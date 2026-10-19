// Pure helpers for chatbot session memory: turn history, rolling summary, the
// compact per-message context block, zero-PII audit sanitising, the eligibility
// re-run rule and a shared LLM time budget. No I/O here, so all of it is unit-testable.

import type { LlmMessage } from "../../core/llm.ts";
import type { SchemeRecord } from "../../core/schemes.ts";
import type {
  ApplicantFacts,
  AuditDocStatus,
  AuditState,
  ChatSessionState,
  SessionLang,
  SessionProfile
} from "./types.ts";

export const MAX_TURNS = 40;
export const HISTORY_WINDOW_TURNS = 8;
const TURN_TEXT_MAX = 600;
const SUMMARY_MAX = 700;

export function normaliseLang(value: unknown): SessionLang {
  const v = typeof value === "string" ? value.trim().toLowerCase().slice(0, 2) : "";
  return v === "hi" || v === "mr" ? v : "en";
}

export const LANG_NAMES: Record<SessionLang, string> = {
  en: "English",
  hi: "Hindi (Devanagari)",
  mr: "Marathi (Devanagari)"
};

export function languageInstruction(lang: SessionLang): string {
  return `ALWAYS reply in the session language: ${LANG_NAMES[lang]} (${lang}), even if the citizen writes in another language.`;
}

// --- history ---------------------------------------------------------------

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function appendTurn(state: ChatSessionState, user: string, assistant: string, at = Date.now()): void {
  state.turns.push({ user: clip(user, TURN_TEXT_MAX), assistant: clip(assistant, TURN_TEXT_MAX), at });
  if (state.turns.length > MAX_TURNS) state.turns.splice(0, state.turns.length - MAX_TURNS);
  state.summary = summariseOlderTurns(state.turns);
}

/** The last `n` turns as real chat messages (oldest first). */
export function recentMessages(state: ChatSessionState, n = HISTORY_WINDOW_TURNS): LlmMessage[] {
  const out: LlmMessage[] = [];
  for (const t of state.turns.slice(-n)) {
    out.push({ role: "user", content: t.user });
    if (t.assistant) out.push({ role: "assistant", content: t.assistant });
  }
  return out;
}

/** Deterministic rolling summary of the turns that fell out of the message window. */
export function summariseOlderTurns(turns: ChatSessionState["turns"], keep = HISTORY_WINDOW_TURNS): string {
  const older = turns.slice(0, Math.max(0, turns.length - keep));
  if (older.length === 0) return "";
  const joined = older.map((t) => `Q: ${clip(t.user, 80)} A: ${clip(t.assistant, 80)}`).join(" | ");
  return joined.length > SUMMARY_MAX ? `…${joined.slice(-SUMMARY_MAX)}` : joined;
}

// --- profile ---------------------------------------------------------------

const CATEGORIES = ["SC", "ST", "OBC", "VJNT", "EWS", "OPEN"];

export function normaliseProfile(raw: unknown): SessionProfile | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 60) : null);
  const bool = (v: unknown) => (typeof v === "boolean" ? v : null);
  const cat = str(r.category)?.toUpperCase() ?? null;
  const profile: SessionProfile = {
    ward: str(r.ward),
    category: cat && CATEGORIES.includes(cat) ? cat : null,
    rationCard: str(r.rationCard),
    disabilityStatus: str(r.disabilityStatus),
    dbtEnabled: bool(r.dbtEnabled),
    incomeBand: str(r.incomeBand)
  };
  return Object.values(profile).some((v) => v !== null) ? profile : null;
}

export function profileSummary(p: SessionProfile | null | undefined): string {
  if (!p) return "";
  const parts: string[] = [];
  if (p.ward) parts.push(`ward ${p.ward}`);
  if (p.category) parts.push(`category ${p.category}`);
  if (p.rationCard) parts.push(`ration card ${p.rationCard}`);
  if (p.disabilityStatus) parts.push(`disability ${p.disabilityStatus}`);
  if (p.dbtEnabled !== null && p.dbtEnabled !== undefined) parts.push(`DBT-enabled bank ${p.dbtEnabled ? "yes" : "no"}`);
  if (p.incomeBand) parts.push(`income band ${p.incomeBand}`);
  return parts.join(", ");
}

// --- audit (zero PII) ------------------------------------------------------

const DOC_STATUSES: AuditDocStatus[] = ["UPLOADED", "MISSING", "NEEDS_REVIEW"];
const ID_NUMBER = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b|\b\d{9,}\b/g;

export function maskPii(text: string): string {
  return text.replace(ID_NUMBER, "[masked]");
}

function safeText(v: unknown, max: number): string {
  return typeof v === "string" ? maskPii(v.replace(/\s+/g, " ").trim()).slice(0, max) : "";
}

/**
 * Keep ONLY name/status/rows[label,status,reason] and a short summary. Any other
 * key (field values, file contents) is dropped; ID-like numbers are masked.
 * Returns null when no valid document remains.
 */
export function sanitiseAudit(raw: unknown, at = Date.now()): AuditState | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.documents)) return null;
  const documents: AuditState["documents"] = [];
  for (const d of r.documents.slice(0, 20)) {
    if (typeof d !== "object" || d === null) continue;
    const doc = d as Record<string, unknown>;
    const name = safeText(doc.name, 120);
    const status = typeof doc.status === "string" ? (doc.status.toUpperCase() as AuditDocStatus) : null;
    if (!name || !status || !DOC_STATUSES.includes(status)) continue;
    const rows = (Array.isArray(doc.rows) ? doc.rows : []).slice(0, 30).flatMap((row) => {
      if (typeof row !== "object" || row === null) return [];
      const x = row as Record<string, unknown>;
      const label = safeText(x.label, 120);
      if (!label) return [];
      return [{ label, status: safeText(x.status, 20).toUpperCase(), reason: safeText(x.reason, 200) }];
    });
    documents.push({ name, status, rows });
  }
  if (documents.length === 0) return null;
  const summary = safeText(r.summary, 500) || null;
  return { documents, summary, savedAt: at };
}

export function auditText(audit: AuditState | null | undefined): string {
  if (!audit) return "No document audit has been run in this session.";
  const lines = audit.documents.map((d) => {
    const bad = d.rows.filter((x) => x.status && x.status !== "OK" && x.status !== "PASS");
    const detail = bad.length ? ` [${bad.map((x) => `${x.label}: ${x.status}${x.reason ? ` (${x.reason})` : ""}`).join("; ")}]` : "";
    return `- ${d.name}: ${d.status}${detail}`;
  });
  return [...lines, audit.summary ? `Summary: ${audit.summary}` : ""].filter(Boolean).join("\n");
}

const AUDIT_QUESTION = /\b(audit|document|documents|checklist|missing|upload(ed)?|needs? review|कागद|दस्तावेज|दस्तऐवज)\b/i;
export function isAuditQuestion(text: string): boolean {
  return AUDIT_QUESTION.test(text);
}

// --- eligibility re-run rule ----------------------------------------------

const FACT_HINT =
  /\d|lakh|income|earn|salary|\b(sc|st|obc|ews|vjnt|open|general)\b|\bage\b|years?|girl|female|male|woman|boy|passed|class|marks|percent|%|orphan|vendor|disab|आय|उत्पन्न|वर्ष/i;
export function looksLikeFacts(text: string): boolean {
  return FACT_HINT.test(text);
}

export function factsChanged(before: ApplicantFacts, after: ApplicantFacts): boolean {
  return JSON.stringify(before) !== JSON.stringify(after);
}

export function shouldRerunEligibility(
  state: Pick<ChatSessionState, "verdict">,
  before: ApplicantFacts,
  after: ApplicantFacts
): boolean {
  return !state.verdict || factsChanged(before, after);
}

// --- context block ---------------------------------------------------------

export function buildContextBlock(
  scheme: SchemeRecord | null,
  state: ChatSessionState,
  lang: SessionLang
): string {
  const lines: string[] = ["SESSION CONTEXT"];
  if (scheme) {
    lines.push(
      `Scheme: ${scheme.name}`,
      `Benefit: ${scheme.benefitAmount ?? "not published"}`,
      `Deadline: ${scheme.deadline ?? "not published"}`,
      `Citizen ward/counter: ${state.location ?? "unknown"}`,
      `Required documents: ${scheme.requiredDocuments.join("; ") || "not listed"}`,
      `Official link: ${scheme.officialFormUrl ?? "none"}`
    );
  } else {
    lines.push("Scheme: none selected yet");
  }
  const known = Object.entries(state.facts)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${k}=${String(v)}`);
  lines.push(`Applicant facts: ${known.join(", ") || "none yet"}`);
  if (state.verdict) {
    lines.push(
      `Latest eligibility verdict: ${state.verdict.verdict}`,
      `Verdict reasons: ${state.verdict.reasons.slice(0, 4).join("; ") || "none"}`
    );
    if (state.verdict.missingInfo.length) lines.push(`Still needed: ${state.verdict.missingInfo.join(", ")}`);
  }
  const prof = profileSummary(state.profile);
  if (prof) lines.push(`Citizen profile: ${prof}`);
  lines.push(`Document audit: ${state.audit ? auditText(state.audit) : "not run"}`);
  if (state.summary) lines.push(`Earlier conversation: ${state.summary}`);
  lines.push(`Reply language: ${lang}`);
  return lines.join("\n");
}

// --- LLM time budget -------------------------------------------------------

export class BudgetExceededError extends Error {
  constructor() {
    super("LLM time budget exhausted");
    this.name = "BudgetExceededError";
  }
}

export interface Budget {
  remainingMs(): number;
  /** Race `work` against what is left of the budget; rejects with BudgetExceededError. */
  run<T>(work: () => Promise<T>): Promise<T>;
}

export function createBudget(totalMs: number, now: () => number = Date.now): Budget {
  const end = now() + totalMs;
  return {
    remainingMs: () => Math.max(0, end - now()),
    run<T>(work: () => Promise<T>): Promise<T> {
      const left = end - now();
      if (left <= 0) return Promise.reject(new BudgetExceededError());
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new BudgetExceededError()), left);
        work().then(
          (v) => { clearTimeout(timer); resolve(v); },
          (e) => { clearTimeout(timer); reject(e); }
        );
      });
    }
  };
}
