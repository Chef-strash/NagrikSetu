// Chatbot orchestration (session-based).
//
// The query decomposition runs ONCE when a session starts; later steps reuse the
// stored decomposition instead of re-deriving it:
//
//   startChatSession   -> decompose + rank schemes (stored in the session)
//   selectChatScheme   -> user picks a scheme -> that scheme's published FAQs
//   askChatQuestion    -> grounded FAQ answer for the selected scheme
//
// Depends on the feedback feature for FAQ reads/answers (that logic lives there).

import { getActiveSchemes } from "../../core/schemes.ts";
import type { SchemeRecord } from "../../core/schemes.ts";
import { MemorySessionStore } from "../../core/session-store.ts";
import { isLlmConfigured, llmComplete } from "../../core/llm.ts";
import { runToolAgent, type ToolStep } from "../../core/tool-agent.ts";
import { getFaqAnswer, getFaqs, getReviews, SchemeNotFoundError } from "../feedback/service.ts";
import { GUIDANCE_TEXT } from "../feedback/answer.ts";
import { decomposeWithLlm } from "./decompose-llm.ts";
import { decompose, type DecomposeContext } from "./decompose.ts";
import { rankSchemes } from "./retrieve.ts";
import { assessScheme } from "./assess.ts";
import { checkEligibilityWithLlm } from "./eligibility-llm.ts";
import { buildSchemeToolExecutor, buildSchemeToolSpecs, pickTopReviews } from "./tools.ts";
import {
  appendTurn,
  auditText,
  buildContextBlock,
  createBudget,
  isAuditQuestion,
  languageInstruction,
  looksLikeFacts,
  normaliseLang,
  normaliseProfile,
  profileSummary,
  recentMessages,
  sanitiseAudit,
  shouldRerunEligibility,
  type Budget
} from "./session-context.ts";
import { EMPTY_FACTS } from "./types.ts";
import type {
  AnswerSource,
  ApplicantFacts,
  ChatAnswerView,
  ChatSessionState,
  ChatSessionView,
  AuditState,
  SessionLang,
  SessionProfile,
  EligibilityCheck,
  EligibilityVerdict,
  FaqAnswerView,
  QueryDecomposition,
  SelectedSchemeView,
  SessionMessageView
} from "./types.ts";
import type { AnswerReviewRef } from "../feedback/types.ts";

const SESSION_TTL_MS = 30 * 60 * 1000;
const sessions = new MemorySessionStore<ChatSessionState>(SESSION_TTL_MS);
/** Total LLM time allowed for one message; later calls degrade to extractive answers. */
export const MESSAGE_BUDGET_MS = 15_000;

export class ChatSessionNotFoundError extends Error {
  constructor(id: string) {
    super(`Chat session not found: ${id}`);
    this.name = "ChatSessionNotFoundError";
  }
}

export class NoSchemeSelectedError extends Error {
  constructor(id: string) {
    super(`No scheme selected for chat session: ${id}`);
    this.name = "NoSchemeSelectedError";
  }
}

export interface StartSessionInput {
  query: string;
  lang?: string | null;
  profile?: DecomposeContext["profile"] | Record<string, unknown>;
  profileWard?: string | null;
  ulbCode?: string | null;
}

const FOLLOW_UP_QUESTIONS: Record<string, string> = {
  income: "What is your family's total annual income?",
  category: "Which social category do you belong to (SC / ST / OBC / Open)?",
  classLevel: "Which class have you passed (10th or 12th)?",
  marksPercent: "What percentage did you score in your last exam?",
  domicileYears: "How many years have you lived in Pune?",
  isStreetVendor: "Do you have a street-vending certificate or a ward survey listing?",
  gender: "Are you a girl student? (some schemes are girls-only)"
};

function followUpsFor(state: ChatSessionState): string[] {
  return state.decomposition.unknownFacts
    .map((key) => FOLLOW_UP_QUESTIONS[key])
    .filter((q): q is string => Boolean(q))
    .slice(0, 3);
}

/** Overlay new non-null facts onto the accumulated set. */
function mergeFacts(base: ApplicantFacts, incoming: ApplicantFacts): ApplicantFacts {
  const out: ApplicantFacts = { ...base };
  const target = out as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(incoming)) {
    if (value !== null && value !== undefined) target[key] = value;
  }
  return out;
}

/**
 * Eligibility check for one scheme: the LLM reads the official eligibility text
 * against the citizen's facts (asking for anything missing). Falls back to the
 * deterministic `assessScheme` when no LLM is available.
 */
async function runEligibility(
  scheme: SchemeRecord,
  facts: ApplicantFacts,
  rawQuery: string | null,
  lang: SessionLang = "en",
  budget?: Budget
): Promise<EligibilityCheck> {
  const call = () => checkEligibilityWithLlm({
    schemeName: scheme.name,
    eligibilityText: scheme.eligibilityText,
    benefitAmount: scheme.benefitAmount,
    incomeLimit: scheme.incomeLimit,
    cutoff: scheme.cutoff,
    domicileYears: scheme.domicileYears,
    facts,
    rawQuery,
    language: lang
  });
  let llm: EligibilityCheck | null = null;
  try {
    llm = budget ? await budget.run(call) : await call();
  } catch {
    llm = null;
  }
  if (llm) return llm;

  const assessment = assessScheme(scheme, facts);
  const verdict: EligibilityVerdict =
    assessment.verdict === "likely_match" ? "likely_eligible" : "need_more_info";
  return {
    verdict,
    reasons: assessment.reasons,
    quotedLines: [],
    missingInfo: assessment.missingFacts,
    questions: assessment.missingFacts
      .map((key) => FOLLOW_UP_QUESTIONS[key])
      .filter((q): q is string => Boolean(q))
      .slice(0, 3),
    source: "rules"
  };
}

const ANSWER_SYSTEM = `You are NagrikSetu's citizen help assistant for Pune municipal welfare schemes.
You are answering questions about ONE selected scheme. The SESSION CONTEXT below is current; use it.

Tools:
- faq_lookup: this scheme's official, maintained FAQs. Prefer it for scheme-information questions.
- reviews_lookup: citizen-reported counter experiences (location-matched, else scheme-wide).
- audit_status: the citizen's saved document-audit result. Use it for document/checklist questions.
- web_search: general background only; never the source of scheme amounts, deadlines, or eligibility.

Rules: the maintained FAQs are the source of truth; do not invent scheme facts. Present reviews as
citizen reports, not official policy. Never ask for or repeat ID numbers. Do not re-ask for facts
already in the context. Keep the answer to 1-3 short sentences, plain language.`;

export function buildAnswerSystem(contextBlock: string, lang: SessionLang): string {
  return `${ANSWER_SYSTEM}\n\n${languageInstruction(lang)}\n\n${contextBlock}`;
}

/** Deterministic audit answer for the no-LLM / out-of-budget path. */
function answerFromAudit(audit: AuditState | null): string {
  if (!audit) return "No document audit has been run yet. Run the document audit to see what is missing.";
  const missing = audit.documents.filter((d) => d.status === "MISSING").map((d) => d.name);
  const review = audit.documents.filter((d) => d.status === "NEEDS_REVIEW").map((d) => d.name);
  const parts: string[] = [];
  if (missing.length) parts.push(`Missing: ${missing.join(", ")}.`);
  if (review.length) parts.push(`Needs review: ${review.join(", ")}.`);
  if (!parts.length) parts.push("All listed documents look uploaded.");
  return parts.join(" ");
}

async function answerWithTools(
  scheme: SchemeRecord,
  question: string,
  state: ChatSessionState,
  lang: SessionLang,
  budget: Budget
): Promise<{ answer: string; steps: ToolStep[] } | null> {
  if (!isLlmConfigured() || budget.remainingMs() <= 0) return null;
  try {
    const result = await runToolAgent({
      system: buildAnswerSystem(buildContextBlock(scheme, state, lang), lang),
      user: question,
      messages: recentMessages(state),
      tools: buildSchemeToolSpecs(),
      execute: buildSchemeToolExecutor({
        schemeSlug: scheme.slug,
        location: state.location,
        lang,
        auditStatus: () => auditText(state.audit)
      }),
      complete: (messages) =>
        budget.run(() => llmComplete(messages, { temperature: 0.2, maxTokens: 500 })),
      maxSteps: 2
    });
    if (!result.answer) return null;
    return { answer: result.answer, steps: result.steps };
  } catch {
    return null;
  }
}

function toView(id: string, state: ChatSessionState): ChatSessionView {
  return {
    sessionId: id,
    decomposition: state.decomposition,
    decompositionSource: state.decompositionSource,
    schemes: state.matches,
    selectedSlug: state.selectedSlug,
    followUpQuestions: followUpsFor(state),
    history: state.history,
    turns: state.turns,
    lang: state.lang,
    verdict: state.verdict,
    audit: state.audit,
    tips: state.tips
  };
}

function profileFacts(raw: unknown): Partial<ApplicantFacts> {
  if (typeof raw !== "object" || raw === null) return {};
  const r = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(EMPTY_FACTS)) {
    if (r[key] !== null && r[key] !== undefined) out[key] = r[key];
  }
  const cat = normaliseProfile(raw)?.category;
  if (cat && out.category === undefined) out.category = cat;
  return out as Partial<ApplicantFacts>;
}

/** Start a session: decompose the query once (LLM, else rules) and rank schemes. */
export async function startChatSession(input: StartSessionInput): Promise<ChatSessionView> {
  const profile = normaliseProfile(input.profile);
  const ward = input.profileWard ?? profile?.ward ?? null;
  const { decomposition, source } = await decomposeWithLlm(input.query, {
    profile: profileFacts(input.profile),
    profileWard: ward,
    ulbCode: input.ulbCode ?? null,
    profileSummary: profileSummary(profile)
  });

  const schemes = await getActiveSchemes();
  const matches =
    decomposition.intent === "DISCOVER_SCHEMES" ? rankSchemes(schemes, decomposition, 5) : [];

  const state: ChatSessionState = {
    decomposition,
    decompositionSource: source,
    matches,
    selectedSlug: null,
    facts: decomposition.applicantFacts,
    location: ward ?? decomposition.location.explicitlyStated ?? null,
    history: [],
    turns: [],
    summary: "",
    lang: normaliseLang(input.lang),
    profile,
    verdict: null,
    audit: null,
    tips: []
  };

  const record = sessions.create(state);
  return toView(record.id, state);
}

export async function getChatSession(id: string): Promise<ChatSessionView | null> {
  const record = await sessions.getAsync(id);
  return record ? toView(record.id, record.data) : null;
}

/** Select one of the candidate schemes and return its published FAQs. */
export async function selectChatScheme(
  id: string,
  slug: string,
  lang: string | null
): Promise<SelectedSchemeView> {
  const record = sessions.get(id);
  if (!record) throw new ChatSessionNotFoundError(id);

  const schemes = await getActiveSchemes();
  const scheme = schemes.find((s) => s.slug === slug);
  if (!scheme) throw new SchemeNotFoundError(slug);

  if (lang) record.data.lang = normaliseLang(lang);
  record.data.selectedSlug = slug;
  record.data.audit = null;
  record.data.tips = [];
  const eligibility = await runEligibility(
    scheme,
    record.data.facts,
    record.data.decomposition.rawQuery,
    record.data.lang,
    createBudget(MESSAGE_BUDGET_MS)
  );
  record.data.verdict = eligibility;
  sessions.update(id, record.data);

  const faqList = await getFaqs(slug, lang);
  return { sessionId: id, selectedSlug: slug, scheme, faqs: faqList.faqs, eligibility };
}

/** Answer a question about the selected scheme from its maintained FAQs. */
export async function askChatQuestion(
  id: string,
  question: string,
  lang: string | null
): Promise<ChatAnswerView> {
  const record = sessions.get(id);
  if (!record) throw new ChatSessionNotFoundError(id);
  if (!record.data.selectedSlug) throw new NoSchemeSelectedError(id);

  const view = await sendSessionMessage(id, question, lang);
  if (!view.faq) throw new NoSchemeSelectedError(id);
  return {
    sessionId: id,
    schemeSlug: view.selectedSlug ?? "",
    faq: view.faq,
    answerSource: view.answerSource,
    reviews: view.reviews,
    toolSteps: view.toolSteps
  };
}

export class InvalidAuditError extends Error {
  constructor() {
    super("Audit must contain at least one document with a valid status.");
    this.name = "InvalidAuditError";
  }
}

/**
 * Save a zero-PII audit result and attach up to 3 review tips for the selected
 * scheme (ward-matched first, then scheme-wide by helpful_count).
 */
export async function saveChatAudit(
  id: string,
  raw: unknown
): Promise<{ sessionId: string; audit: AuditState; tips: AnswerReviewRef[] }> {
  const record = sessions.get(id);
  if (!record) throw new ChatSessionNotFoundError(id);
  const audit = sanitiseAudit(raw);
  if (!audit) throw new InvalidAuditError();

  const state = record.data;
  state.audit = audit;
  state.tips = [];
  if (state.selectedSlug) {
    try {
      const list = await getReviews(state.selectedSlug, 20);
      state.tips = pickTopReviews(list.reviews, state.location, 3).picked.map((r) => ({
        id: r.id,
        text: r.text,
        counter: r.counter,
        helpfulCount: r.helpfulCount
      }));
    } catch {
      state.tips = [];
    }
  }
  sessions.update(id, state);
  return { sessionId: id, audit, tips: state.tips };
}

export interface SendMessageOptions {
  profile?: unknown;
  profileWard?: string | null;
}

/**
 * Send a message within a session. Records the full turn (user + assistant) so
 * later messages carry real conversation memory.
 *
 * Scheme questions stay FAQ-first and locked to the selected scheme
 * (`forcedIntent: true`); audit/document questions go to the tool agent, which can
 * read the saved audit via `audit_status`.
 */
export async function sendSessionMessage(
  id: string,
  text: string,
  lang: string | null,
  options: SendMessageOptions = {}
): Promise<SessionMessageView> {
  const record = sessions.get(id);
  if (!record) throw new ChatSessionNotFoundError(id);
  const state = record.data;

  if (lang) state.lang = normaliseLang(lang);
  const profile = normaliseProfile(options.profile);
  if (profile) state.profile = profile;
  if (options.profileWard) state.location = options.profileWard;
  else if (profile?.ward && !state.location) state.location = profile.ward;

  const view = await processMessage(id, state, text, createBudget(MESSAGE_BUDGET_MS));

  state.history.push({
    question: text,
    answered: view.faq?.answered ?? view.kind === "schemes",
    at: Date.now()
  });
  appendTurn(state, text, view.faq?.answer || view.message);
  sessions.update(id, state);
  return view;
}

function lastBotQuestion(state: ChatSessionState): string | null {
  const last = state.turns[state.turns.length - 1];
  if (!last) return null;
  const q = last.assistant.split(/(?<=[?।])\s/).filter((p) => p.endsWith("?")).pop();
  return q ?? null;
}

async function processMessage(
  sessionId: string,
  state: ChatSessionState,
  text: string,
  budget: Budget
): Promise<SessionMessageView> {
  const lang = state.lang;
  const factsBefore = state.facts;

  // Skip decomposition once a scheme is chosen, unless the message may carry facts.
  const needDecompose = !state.selectedSlug || looksLikeFacts(text);
  let decomposition: QueryDecomposition = state.decomposition;
  if (needDecompose) {
    try {
      decomposition = (
        await budget.run(() =>
          decomposeWithLlm(text, {
            profile: profileFacts(state.profile),
            profileWard: state.location,
            lastBotQuestion: lastBotQuestion(state),
            profileSummary: profileSummary(state.profile)
          })
        )
      ).decomposition;
    } catch {
      decomposition = decompose(text, { profileWard: state.location });
    }
    state.facts = mergeFacts(state.facts, decomposition.applicantFacts);
  }

  // --- Selected-scheme lock (scheme questions stay FAQ-first) ----------------
  if (state.selectedSlug) {
    const locked: QueryDecomposition = {
      ...decomposition,
      intent: "ASK_SCHEME_INFO",
      schemeQuery: state.selectedSlug
    };

    const selectedScheme = (await getActiveSchemes()).find((s) => s.slug === state.selectedSlug);

    // Only re-run eligibility when new facts arrived (or there is no verdict yet).
    if (selectedScheme && shouldRerunEligibility(state, factsBefore, state.facts)) {
      state.verdict = await runEligibility(
        selectedScheme,
        state.facts,
        state.decomposition.rawQuery,
        lang,
        budget
      );
    }
    const eligibility = state.verdict;

    const toolAnswer = selectedScheme
      ? await answerWithTools(selectedScheme, text, state, lang, budget)
      : null;

    let faq: FaqAnswerView;
    let answerSource: AnswerSource;
    let reviews: AnswerReviewRef[];
    let toolSteps: ToolStep[] = [];

    if (toolAnswer) {
      faq = {
        answered: true,
        answer: toolAnswer.answer,
        references: [],
        officialUrl: selectedScheme?.officialFormUrl ?? null,
        guidance: GUIDANCE_TEXT
      };
      answerSource = "tools";
      reviews = [];
      toolSteps = toolAnswer.steps;
    } else if (isAuditQuestion(text) && state.audit) {
      faq = {
        answered: true,
        answer: answerFromAudit(state.audit),
        references: [],
        officialUrl: selectedScheme?.officialFormUrl ?? null,
        guidance: GUIDANCE_TEXT
      };
      answerSource = "none";
      reviews = [];
    } else {
      const answered = await getFaqAnswer(state.selectedSlug, text, lang, {
        location: state.location,
        history: recentMessages(state),
        sessionContext: buildContextBlock(selectedScheme ?? null, state, lang),
        skipLlm: budget.remainingMs() <= 0
      });
      faq = {
        answered: answered.answered,
        answer: answered.answer,
        references: answered.references,
        officialUrl: answered.officialUrl,
        guidance: answered.guidance
      };
      answerSource = answered.answerSource;
      reviews = answered.reviews;
    }

    return {
      sessionId,
      selectedSlug: state.selectedSlug,
      forcedIntent: true,
      decomposition: locked,
      kind: "faq_answer",
      message: faq.answered
        ? "Answered from the selected scheme's maintained information."
        : "That is not covered by the selected scheme's maintained FAQs.",
      faq,
      schemes: [],
      followUpQuestions: [],
      answerSource,
      reviews,
      eligibility,
      toolSteps,
      tips: state.tips
    };
  }

  // --- No selection yet: normal behaviour -----------------------------------
  if (decomposition.intent === "DISCOVER_SCHEMES") {
    const schemes = await getActiveSchemes();
    const matches = rankSchemes(schemes, decomposition, 5);
    state.matches = matches;
    return {
      sessionId,
      selectedSlug: null,
      forcedIntent: false,
      decomposition,
      kind: "schemes",
      message: matches.length
        ? `I found ${matches.length} relevant schemes. Select one to see its FAQs.`
        : "No matching scheme found. Try rephrasing.",
      faq: null,
      schemes: matches,
      followUpQuestions: followUpsFor(state),
      answerSource: "none",
      reviews: [],
      eligibility: null,
      toolSteps: [],
      tips: []
    };
  }

  if (decomposition.schemeQuery) {
    const answer = await getFaqAnswer(decomposition.schemeQuery, text, lang, {
      location: state.location,
      history: recentMessages(state),
      sessionContext: buildContextBlock(null, state, lang),
      skipLlm: budget.remainingMs() <= 0
    });
    return {
      sessionId,
      selectedSlug: null,
      forcedIntent: false,
      decomposition,
      kind: "faq_answer",
      message: "Here is what the maintained scheme information says.",
      faq: {
        answered: answer.answered,
        answer: answer.answer,
        references: answer.references,
        officialUrl: answer.officialUrl,
        guidance: answer.guidance
      },
      schemes: [],
      followUpQuestions: [],
      answerSource: answer.answerSource,
      reviews: answer.reviews,
      eligibility: null,
      toolSteps: [],
      tips: []
    };
  }

  return {
    sessionId,
    selectedSlug: null,
    forcedIntent: false,
    decomposition,
    kind: "other",
    message:
      "Tell me your situation and I'll find schemes, or select a scheme to ask about it.",
    faq: null,
    schemes: state.matches,
    followUpQuestions: [],
    answerSource: "none",
    reviews: [],
    eligibility: null,
    toolSteps: [],
    tips: []
  };
}
