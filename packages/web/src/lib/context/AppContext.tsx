"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { SCHEMES, Scheme } from "../data/schemes";
import { supabase, isDemoAuth } from "../supabase";
import { EMPTY_PROFILE, rowToProfile, profileToRow } from "../auth/profile-map";
import { buildCandidatePrompt } from "../chatbot/greeting";
import { sendChatMessage, startChatSession, selectChatScheme, ChatbotApiError } from "../chatbot/api";
import { offlineReply } from "../chatbot/offline";
import { loadSchemes, counterLabel, submissionSentence } from "../schemes/load";
import { loadStoredSessions, scheduleSessionSaves, markSessionsSynced } from "../sessions/persist";
import { newId, nowIso, recentHistory } from "../sessions/model";
import { replyText } from "../chatbot/reply";
import { auditUploadedDocuments } from "../documents/audit";
import { toChatProfile } from "../chatbot/profile";

/**
 * Skip the sign-in screen: land straight on the dashboard as a demo citizen.
 *
 * Build-time switch (`NEXT_PUBLIC_AUTO_LOGIN=true`). `NEXT_PUBLIC_*` values are
 * inlined into the bundle, so changing it needs a rebuild. Intended for demo and
 * evaluation builds. It grants a LOCAL identity, not a Supabase session: live reads
 * still work through the anon key (RLS), but server-side writes that need a real
 * user (posting a review, server-side session sync) still require a sign-in.
 */
const AUTO_LOGIN = process.env.NEXT_PUBLIC_AUTO_LOGIN === "true";

/** The same demo citizen `scripts/demo-otp.mjs --profile` writes. */
const AUTO_LOGIN_PROFILE: UserProfile = {
  ...EMPTY_PROFILE,
  name: "Ramesh Patil",
  mobile: "9800000001",
  ward: "Ward 14: Kothrud - Bawdhan",
  income: 180000,
  domicileYears: 12,
  category: "OBC",
  rationCard: "Yellow",
  dbtEnabled: true,
  disabilityStatus: "None"
};

export interface UserProfile {
  name: string;
  mobile: string;
  ward: string;
  income: number;
  domicileYears: number;
  category: string;
  rationCard: string;
  hasProduceVendor: boolean;
  empaneledHospitals: string[];
  dbtEnabled: boolean;
  disabilityStatus: string;
}

export interface SessionDocument {
  id: string;
  name: string;
  fileName?: string;
  isUploaded: boolean;
  isVerified: boolean;
  accountNumber?: string;
  ifscCode?: string;
  originalIfsc?: string;
  ifscNote?: string;
  aadhaarMasked?: string;
  nameOnDocument?: string;
  nameMatchConfidence?: number;
}

export interface CandidateScheme {
  /** Backend scheme slug (matches the web catalog `Scheme.id`). */
  slug: string;
  name: string;
  categoryLabel: string;
  benefitAmount: string | null;
  description: string;
  /** Decomposition ranking score. */
  score: number;
  /** True when the decomposer matched it because the query named the scheme. */
  named: boolean;
}

export interface ActiveSession {
  id: string;
  schemeId: string;
  schemeName: string;
  beneficiaryName: string;
  targetBenefit: string;
  counterLocation: string;
  counterHours: string;
  status: "in_progress" | "completed";
  documentsLeft: number;
  lastActivity: string;
  documents: SessionDocument[];
  conversation: Array<{
    id: string;
    sender: "assistant" | "user";
    text: string;
    timestamp: string;
  }>;
  /** Backend chat session id — required to select a scheme and answer FAQs. */
  chatSessionId?: string;
  /** True once the citizen has picked a scheme. Gates the document checklist. */
  schemeChosen?: boolean;
  /** Top candidate schemes awaiting the citizen's choice. */
  candidates?: CandidateScheme[];
}

/** Result of the single "Audit" action across a session's documents. */
export interface AuditSummary {
  /** Documents verified by this run. */
  audited: number;
  /** Documents still not verified (uploaded but skipped, or never uploaded). */
  pending: number;
  /** Of `pending`, how many were never uploaded at all. */
  notUploaded: number;
}

/**
 * One document's REAL audit outcome, straight from the audit service. Kept
 * structurally minimal (and free of any audit-package import) so the context
 * stays decoupled from the verification layer.
 */
export interface ServiceAuditPatch {
  documentId: string;
  isVerified: boolean;
  fields: {
    aadhaarMasked?: string;
    accountNumber?: string;
    ifscCode?: string;
    nameOnDocument?: string;
  };
  ifscNote?: string;
}

interface AppContextType {
  user: UserProfile;
  updateUser: (updated: Partial<UserProfile>) => void;
  isAuthenticated: boolean;
  /** Demo-only login (NEXT_PUBLIC_DEMO_AUTH=true and no Supabase). */
  login: (name: string, mobile: string) => void;
  logout: () => void;
  authLoading: boolean;
  authUserId: string | null;
  authEmail: string | null;
  requestOtp: (email: string, signup: boolean) => Promise<{ error?: string }>;
  verifyOtp: (email: string, token: string) => Promise<{ error?: string }>;
  /** Persist profile (merged with current) to user_profiles under the user's session. */
  saveProfile: (partial?: Partial<UserProfile>) => Promise<{ error?: string }>;
  language: "en" | "mr";
  toggleLanguage: () => void;
  schemes: Scheme[];
  sessions: ActiveSession[];
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  createSession: (
    schemeId: string,
    beneficiaryName: string,
    initialQuery?: string,
    initialAssistantMessage?: string
  ) => string;
  /** Open a session that still needs the citizen to choose among the top matches. */
  createCandidateSession: (input: {
    beneficiaryName: string;
    initialQuery: string;
    chatSessionId: string;
    candidates: CandidateScheme[];
  }) => string;
  /** Apply the citizen's scheme choice: fills the scheme, documents and reply. */
  chooseSessionScheme: (sessionId: string, schemeId: string, assistantMessage: string) => void;
  uploadDocument: (sessionId: string, docId: string, fileName: string) => void;
  /** Keep the picked File in memory (never persisted) so a real audit can read it. */
  rememberDocumentFile: (sessionId: string, docId: string, file: File) => void;
  /** The in-memory File for a document row, or undefined after a reload. */
  getDocumentFile: (sessionId: string, docId: string) => File | undefined;
  /** The single "Audit" action: verify every uploaded document in one pass. */
  auditDocuments: (sessionId: string) => AuditSummary;
  /**
   * Write a REAL audit result (produced by the audit service) onto a session.
   * Separate from `auditDocuments`, which remains the offline/local fallback.
   */
  applyServiceAudit: (
    sessionId: string,
    input: { patches: ServiceAuditPatch[]; summary: string; pendingCount: number }
  ) => void;
  /**
   * Append ONE assistant line to a session's thread. Used to stream audit progress
   * into the chat as each document is read, so the citizen watches the check happen
   * instead of waiting for a single result at the end.
   */
  postSessionMessage: (sessionId: string, text: string) => void;
  sendMessage: (sessionId: string, text: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [language, setLanguage] = useState<"en" | "mr">("en");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [schemes, setSchemes] = useState<Scheme[]>(SCHEMES);

  const [user, setUser] = useState<UserProfile>(EMPTY_PROFILE);

  const [sessions, setSessions] = useState<ActiveSession[]>([]);

  const updateUser = (updated: Partial<UserProfile>) => {
    setUser((prev) => ({ ...prev, ...updated }));
  };

  const login = (name: string, mobile: string) => {
    if (!isDemoAuth && !AUTO_LOGIN) return;
    setUser((prev) => ({ ...prev, name, mobile }));
    setIsAuthenticated(true);
  };

  const logout = () => {
    setIsAuthenticated(false);
    setAuthUserId(null);
    setAuthEmail(null);
    setUser(EMPTY_PROFILE);
    if (supabase) void supabase.auth.signOut();
  };

  const authErr = (e: { message?: string; status?: number } | null | undefined): string | undefined => {
    if (!e) return undefined;
    if (e.status === 429 || /rate limit|too many/i.test(e.message || "")) {
      return "Too many attempts. Please wait a minute before requesting another code.";
    }
    if (/expired|invalid/i.test(e.message || "")) return "That code is invalid or has expired. Request a new one.";
    return e.message || "Something went wrong. Please try again.";
  };

  const requestOtp = async (email: string, signup: boolean) => {
    if (!supabase) return { error: "Sign-in is not configured on this deployment." };
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: signup },
    });
    if (error && !signup && /signups? not allowed|not found/i.test(error.message)) {
      return { error: "No account found for this email. Please sign up first." };
    }
    return { error: authErr(error) };
  };

  const verifyOtp = async (email: string, token: string) => {
    if (!supabase) return { error: "Sign-in is not configured on this deployment." };
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: "email" });
    return { error: authErr(error) };
  };

  const saveProfile = async (partial?: Partial<UserProfile>) => {
    const merged = { ...user, ...(partial || {}) };
    setUser(merged);
    if (!supabase || !authUserId) return isDemoAuth || AUTO_LOGIN ? {} : { error: "You are not signed in." };
    const { error } = await supabase
      .from("user_profiles")
      .upsert(profileToRow(merged, authUserId, authEmail), { onConflict: "user_id" });
    return { error: error?.message };
  };

  // Session bootstrap + live auth changes.
  useEffect(() => {
    if (!supabase) {
      setIsAuthenticated(isDemoAuth);
      setAuthLoading(false);
      return;
    }
    let cancelled = false;
    const apply = async (sess: { user: { id: string; email?: string | null } } | null) => {
      if (cancelled) return;
      if (!sess) {
        setIsAuthenticated(false);
        setAuthUserId(null);
        setAuthEmail(null);
        return;
      }
      setIsAuthenticated(true);
      setAuthUserId(sess.user.id);
      setAuthEmail(sess.user.email ?? null);
      try {
        const { data } = await supabase!
          .from("user_profiles")
          .select("*")
          .eq("user_id", sess.user.id)
          .maybeSingle();
        if (!cancelled && data) setUser(rowToProfile(data as Record<string, unknown>));
      } catch {
        /* keep empty profile */
      }
    };
    supabase.auth.getSession().then(({ data }) => {
      void apply(data.session).finally(() => !cancelled && setAuthLoading(false));
    }).catch(() => setAuthLoading(false));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      // Defer to avoid awaiting Supabase calls inside the auth callback.
      setTimeout(() => void apply(sess), 0);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Skip-login builds: adopt the demo identity once auth has settled, so the
  // dashboard, assistant and audit screens all have a citizen to work with.
  const autoLoginApplied = useRef(false);
  useEffect(() => {
    if (!AUTO_LOGIN || authLoading || autoLoginApplied.current) return;
    autoLoginApplied.current = true;
    setUser((prev) => (prev.name ? prev : AUTO_LOGIN_PROFILE));
  }, [authLoading]);

  const toggleLanguage = () => {
    setLanguage((prev) => (prev === "en" ? "mr" : "en"));
  };

  // Always read the freshest sessions inside async handlers (avoids stale closures).
  const sessionsRef = useRef<ActiveSession[]>(sessions);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    if (!supabase) return;

    async function hydrateFromSupabase() {
      try {
        const liveSchemes = await loadSchemes(supabase, SCHEMES);
        if (liveSchemes) setSchemes(liveSchemes);


      } catch {
        // Fallback gracefully to offline fixtures
      }
    }

    hydrateFromSupabase();
  }, []);

  // Load this user's saved sessions once signed in (no-op when signed out / no Supabase).
  useEffect(() => {
    if (!supabase || !isAuthenticated) return;
    let cancelled = false;
    void loadStoredSessions().then((stored) => {
      if (cancelled || !stored) return;
      const loaded: ActiveSession[] = stored.map((st) => ({
        ...st,
        documents: st.documents as SessionDocument[],
        schemeChosen: Boolean(st.schemeId)
      }));
      markSessionsSynced(loaded);
      setSessions((prev) => {
        const ids = new Set(prev.map((p) => p.id));
        return [...prev, ...loaded.filter((l) => !ids.has(l.id))];
      });
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Debounced save after every change to a session.
  useEffect(() => {
    if (isAuthenticated) scheduleSessionSaves(sessions);
  }, [sessions, isAuthenticated]);

  const createSession = (
    schemeId: string,
    beneficiaryName: string,
    initialQuery?: string,
    initialAssistantMessage?: string
  ): string => {
    const targetScheme = schemes.find((s) => s.id === schemeId);
    if (!targetScheme) return "";
    const newSessionId = newId();

    const citizenGreeting = user?.name ? user.name.split(" ")[0] : "Citizen";

    // The opening assistant message: prefer the one built from the decomposition
    // API, else fall back to the local scheme description.
    const openingText =
      initialAssistantMessage && initialAssistantMessage.trim()
        ? initialAssistantMessage.trim()
        : initialQuery
          ? `Hello ${citizenGreeting}. Based on your search for "${initialQuery}", the closest match is the ${targetScheme.name}${targetScheme.benefitAmount ? ` (${targetScheme.benefitAmount})` : ""}. ${submissionSentence(targetScheme)}Please upload the required documents on the right and click Check to catch any bank or spelling issues before visiting the counter.`
          : `Hello ${citizenGreeting}. We have opened your application for the ${targetScheme.name}. ${submissionSentence(targetScheme)}Please upload your documents on the right and click Check to verify your bank details and requirements.`;

    const conversation: ActiveSession["conversation"] = [];
    // Show the citizen's own request first so the thread reads naturally.
    if (initialAssistantMessage && initialQuery && initialQuery.trim()) {
      conversation.push({
        id: `msg-u-${Date.now()}`,
        sender: "user",
        text: initialQuery.trim(),
        timestamp: nowIso()
      });
    }
    conversation.push({
      id: `msg-a-${Date.now()}`,
      sender: "assistant",
      text: openingText,
      timestamp: nowIso()
    });

    const newSession: ActiveSession = {
      id: newSessionId,
      schemeId: targetScheme.id,
      schemeName: targetScheme.name,
      beneficiaryName: beneficiaryName || user.name,
      targetBenefit: targetScheme.benefitAmount,
      counterLocation: counterLabel(targetScheme),
      counterHours: targetScheme.counterLocation.hours,
      status: "in_progress",
      documentsLeft: targetScheme.requiredDocuments.length,
      lastActivity: "Session started. Ready for document check.",
      documents: targetScheme.requiredDocuments.map((docName, idx) => ({
        id: `doc-${idx}`,
        name: docName,
        isUploaded: false,
        isVerified: false
      })),
      conversation
    };

    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSessionId);
    return newSessionId;
  };

  /**
   * Open a session with the top scheme matches and NO documents yet. The citizen
   * picks one on the application page; only then are documents generated.
   */
  const createCandidateSession = (input: {
    beneficiaryName: string;
    initialQuery: string;
    chatSessionId: string;
    candidates: CandidateScheme[];
  }): string => {
    const newSessionId = newId();

    const prompt = buildCandidatePrompt({
      citizenName: user?.name ?? "Citizen",
      query: input.initialQuery,
      candidates: input.candidates
    });

    const newSession: ActiveSession = {
      id: newSessionId,
      schemeId: "",
      schemeName: "No scheme selected yet",
      beneficiaryName: input.beneficiaryName || user.name,
      targetBenefit: "",
      counterLocation: "",
      counterHours: "",
      status: "in_progress",
      documentsLeft: 0,
      lastActivity: "Awaiting scheme choice.",
      documents: [],
      chatSessionId: input.chatSessionId,
      schemeChosen: false,
      candidates: input.candidates,
      conversation: [
        { id: `msg-u-${Date.now()}`, sender: "user", text: input.initialQuery, timestamp: nowIso() },
        { id: `msg-a-${Date.now() + 1}`, sender: "assistant", text: prompt, timestamp: nowIso() }
      ]
    };

    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSessionId);
    return newSessionId;
  };

  /**
   * Apply the citizen's scheme choice: fill in the scheme, generate the document
   * checklist and append the eligibility reply. Until this runs the checklist is
   * deliberately empty.
   */
  const chooseSessionScheme = (sessionId: string, schemeId: string, assistantMessage: string) => {
    const targetScheme = schemes.find((s) => s.id === schemeId);
    if (!targetScheme) return;

    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== sessionId) return session;
        return {
          ...session,
          schemeId: targetScheme.id,
          schemeName: targetScheme.name,
          targetBenefit: targetScheme.benefitAmount,
          counterLocation: counterLabel(targetScheme),
          counterHours: targetScheme.counterLocation.hours,
          documents: targetScheme.requiredDocuments.map((docName, idx) => ({
            id: `doc-${idx}`,
            name: docName,
            isUploaded: false,
            isVerified: false
          })),
          documentsLeft: targetScheme.requiredDocuments.length,
          schemeChosen: true,
          candidates: [],
          status: "in_progress",
          lastActivity: `Selected ${targetScheme.name}.`,
          conversation: [
            ...session.conversation,
            {
              id: `msg-a-${Date.now()}`,
              sender: "assistant",
              text: assistantMessage,
              timestamp: nowIso()
            }
          ]
        };
      })
    );
  };

  // Uploaded File objects live only here, in memory; the session model keeps names.
  const documentFilesRef = useRef<Map<string, File>>(new Map());
  const rememberDocumentFile = (sessionId: string, docId: string, file: File) => {
    documentFilesRef.current.set(`${sessionId}:${docId}`, file);
  };
  const getDocumentFile = (sessionId: string, docId: string) =>
    documentFilesRef.current.get(`${sessionId}:${docId}`);

  const uploadDocument = (sessionId: string, docId: string, fileName: string) => {
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== sessionId) return session;
        return {
          ...session,
          documents: session.documents.map((doc) => {
            if (doc.id !== docId) return doc;
            // Replacing a file invalidates the previous audit result for that document.
            return {
              ...doc,
              fileName,
              isUploaded: true,
              isVerified: false,
              accountNumber: undefined,
              ifscCode: undefined,
              originalIfsc: undefined,
              ifscNote: undefined,
              aadhaarMasked: undefined,
              nameOnDocument: undefined
            };
          })
        };
      })
    );
  };

  /**
   * The single "Audit" action: verify EVERY uploaded document in one pass and post
   * one summary to the assistant thread. Documents that were never uploaded are
   * reported as still pending rather than silently skipped.
   */
  const auditDocuments = (sessionId: string): AuditSummary => {
    const session = sessionsRef.current.find((s) => s.id === sessionId);
    if (!session) return { audited: 0, pending: 0, notUploaded: 0 };

    const result = auditUploadedDocuments(session.documents, {
      beneficiaryName: session.beneficiaryName || user.name,
      counterLocation: session.counterLocation
    });

    // Apply the audit patches back onto the session documents.
    const patchById = new Map(result.findings.map((finding) => [finding.docId, finding.patch] as const));
    const documents = session.documents.map((doc) => {
      const patch = patchById.get(doc.id);
      return patch ? { ...doc, ...patch } : doc;
    });

    setSessions((prev) =>
      prev.map((s) =>
        s.id !== sessionId
          ? s
          : {
              ...s,
              documents,
              documentsLeft: result.pending,
              status: result.pending === 0 ? "completed" : "in_progress",
              lastActivity:
                result.audited > 0
                  ? `Audited ${result.audited} document${result.audited === 1 ? "" : "s"}.`
                  : s.lastActivity,
              conversation: [
                ...s.conversation,
                {
                  id: `msg-audit-${Date.now()}`,
                  sender: "assistant" as const,
                  text: result.summary,
                  timestamp: nowIso()
                }
              ]
            }
      )
    );

    return { audited: result.audited, pending: result.pending, notUploaded: result.notUploaded };
  };

  /**
   * Write a REAL audit result (from the audit service) back onto a session.
   *
   * Unlike `auditDocuments`, nothing here is invented: every value comes from an
   * extraction the service actually performed, and a document is only marked
   * verified when it satisfied a requirement AND was not flagged for review.
   * Patches replace the previous run's values wholesale so a re-audit never mixes
   * results from two attempts.
   */
  const applyServiceAudit = (
    sessionId: string,
    input: { patches: ServiceAuditPatch[]; summary: string; pendingCount: number }
  ) => {
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== sessionId) return session;

        const patchById = new Map(input.patches.map((patch) => [patch.documentId, patch] as const));
        const documents = session.documents.map((doc) => {
          const patch = patchById.get(doc.id);
          if (!patch) return doc;
          return {
            ...doc,
            isVerified: patch.isVerified,
            aadhaarMasked: patch.fields.aadhaarMasked,
            accountNumber: patch.fields.accountNumber,
            ifscCode: patch.fields.ifscCode,
            nameOnDocument: patch.fields.nameOnDocument,
            ifscNote: patch.ifscNote
          };
        });

        return {
          ...session,
          documents,
          documentsLeft: input.pendingCount,
          status: input.pendingCount === 0 ? "completed" : "in_progress",
          lastActivity: `Audited ${input.patches.length} document${input.patches.length === 1 ? "" : "s"}.`,
          conversation: [
            ...session.conversation,
            {
              id: `msg-audit-${Date.now()}`,
              sender: "assistant" as const,
              text: input.summary,
              timestamp: nowIso()
            }
          ]
        };
      })
    );
  };

  /**
   * Append one assistant line to a session's thread. Kept separate from
   * `applyServiceAudit` so the audit can post progress WHILE it runs.
   */
  const postSessionMessage = (sessionId: string, text: string) => {
    if (!text.trim()) return;
    setSessions((prev) =>
      prev.map((session) =>
        session.id !== sessionId
          ? session
          : {
              ...session,
              lastActivity: "Auditing documents…",
              conversation: [
                ...session.conversation,
                {
                  // Streamed messages can land in the same millisecond, so the id
                  // needs more than Date.now() to stay unique as a React key.
                  id: `msg-audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  sender: "assistant" as const,
                  text,
                  timestamp: nowIso()
                }
              ]
            }
      )
    );
  };

  /**
   * Guarantee a live Layer-2 chat session with the scheme already selected.
   * Sessions hydrated from Supabase (or created from the scheme catalogue) have no
   * chatSessionId yet, so we create and select one on demand.
   */
  const ensureChatSession = async (
    session: ActiveSession,
    forceNew = false
  ): Promise<string | null> => {
    if (session.chatSessionId && !forceNew) return session.chatSessionId;
    if (!session.schemeId) return null;

    try {
      // A recreated session replays the last stored turns so context survives a reload.
      const chat = await startChatSession({
        query: session.conversation.find((m) => m.sender === "user")?.text || session.schemeName,
        lang: language,
        profileWard: user.ward,
        profile: toChatProfile(user),
        history: recentHistory(session.conversation)
      });
      await selectChatScheme(chat.sessionId, session.schemeId, language);

      setSessions((prev) =>
        prev.map((s) =>
          s.id === session.id ? { ...s, chatSessionId: chat.sessionId, schemeChosen: true } : s
        )
      );
      return chat.sessionId;
    } catch {
      return null;
    }
  };

  /**
   * Ask a question inside a session. Once a scheme is chosen the answer comes from
   * that scheme's maintained FAQs via the Layer-2 chatbot; before that we ask the
   * citizen to choose. Falls back to the bundled replies when the service is down.
   */
  const sendMessage = async (sessionId: string, text: string) => {
    if (!text.trim()) return;

    const userMsg = {
      id: `msg-u-${Date.now()}`,
      sender: "user" as const,
      text,
      timestamp: nowIso()
    };

    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, conversation: [...s.conversation, userMsg] } : s))
    );

    const target = sessionsRef.current.find((s) => s.id === sessionId);

    let reply: string;
    if (target && !target.schemeId) {
      reply =
        "Please choose one of the matched schemes on the right first — then I can answer from that scheme's official rules and document list.";
    } else {
      const chatId = target ? await ensureChatSession(target) : null;
      let answer: string | null = null;

      if (chatId) {
        try {
          answer = replyText(await sendChatMessage(chatId, text, language, toChatProfile(user)));
        } catch (err) {
          answer = null;
          // Stale chat session (backend restarted): recreate it and retry once.
          if (err instanceof ChatbotApiError && err.status === 404 && target) {
            const freshId = await ensureChatSession(target, true);
            if (freshId) {
              try {
                answer = replyText(await sendChatMessage(freshId, text, language, toChatProfile(user)));
              } catch {
                answer = null;
              }
            }
          }
        }
      }

      // Offline fallback keeps the app usable without the Layer-2 service.
      const sch = target ? schemes.find((x) => x.id === target.schemeId) : undefined;
      reply = answer ?? offlineReply(text, sch?.counterLocation);
    }

    const botMsg = {
      id: `msg-a-${Date.now()}`,
      sender: "assistant" as const,
      text: reply,
      timestamp: nowIso()
    };

    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, conversation: [...s.conversation, botMsg] } : s))
    );
  };

  return (
    <AppContext.Provider
      value={{
        user,
        updateUser,
        // AUTO_LOGIN short-circuits the flag so every consumer treats the demo
        // visitor as signed in, whatever Supabase reports.
        isAuthenticated: AUTO_LOGIN || isAuthenticated,
        login,
        logout,
        authLoading,
        authUserId,
        authEmail,
        requestOtp,
        verifyOtp,
        saveProfile,
        language,
        toggleLanguage,
        schemes,
        sessions,
        activeSessionId,
        setActiveSessionId,
        createSession,
        createCandidateSession,
        chooseSessionScheme,
        uploadDocument,
        rememberDocumentFile,
        getDocumentFile,
        auditDocuments,
        applyServiceAudit,
        postSessionMessage,
        sendMessage
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}
