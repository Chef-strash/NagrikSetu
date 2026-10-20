"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useApp } from "../../lib/context/AppContext";
import {
  Mic,
  Send,
  Volume2,
  CheckCircle2,
  Clock,
  MapPin,
  Download,
  Loader2,
  FileText,
  ShieldCheck,
  Square,
  Paperclip,
  X
} from "lucide-react";
import { formatTimestamp } from "../../lib/sessions/model";
import { OFFLINE_NOTICE } from "../../lib/chatbot/offline";
import { selectChatScheme } from "../../lib/chatbot/api";
import { buildSelectionMessage } from "../../lib/chatbot/greeting";
import { UPLOAD_ACCEPT, validateUpload } from "../../lib/documents/upload";
import { useVoiceInput } from "../../lib/voice/useVoiceInput";
import { useReadAloud } from "../../lib/voice/useReadAloud";
import { extractViaProxy } from "../../lib/audit/client";
import {
  runWebAudit,
  summarizeWebAudit,
  type AuditCandidate
} from "../../lib/audit/run";
import { postAuditToChat } from "../../lib/audit/chat-link";
import { buildAuditSummaryRequest, fetchAuditSummary } from "../../lib/audit/summary";
import { postExtraction } from "../../lib/documents/storage";
import { supabase } from "../../lib/supabase";
import {
  buildDocumentContext,
  composeMessageWithContext,
  type DocumentContext
} from "../../lib/audit/chat-context";

function AssistantContent() {
  const searchParams = useSearchParams();
  const {
    sessions,
    schemes,
    uploadDocument,
    auditDocuments,
    applyServiceAudit,
    postSessionMessage,
    rememberDocumentFile,
    getDocumentFile,
    sendMessage,
    chooseSessionScheme,
    language
  } = useApp();

  const sessionIdParam = searchParams.get("session");
  const queryParam = searchParams.get("query");

  const activeSession = sessions.find((s) => s.id === sessionIdParam) || (sessionIdParam ? undefined : sessions[0]);
  const schemeData = schemes.find((s) => s.id === activeSession?.schemeId);

  const [inputText, setInputText] = useState("");
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  const voice = useVoiceInput({
    language,
    onTranscript: (text, lowConfidence) => {
      setInputText(text);
      setVoiceHint(lowConfidence ? "Please check the text before sending." : null);
    }
  });
  const reader = useReadAloud();
  const [choosingSlug, setChoosingSlug] = useState<string | null>(null);
  const [choiceError, setChoiceError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [auditing, setAuditing] = useState(false);

  // A document attached to this chat. Only its MASKED fields are kept, in memory,
  // and they ride along with the next question as context. Nothing is persisted.
  const [attachedDoc, setAttachedDoc] = useState<DocumentContext | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  // The document checklist stays hidden until the citizen picks a scheme.
  const needsSchemeChoice = Boolean(
    activeSession && !activeSession.schemeChosen && (activeSession.candidates?.length ?? 0) > 0
  );

  const querySentRef = useRef(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // If arrived with query parameter from Home, send once
  useEffect(() => {
    if (queryParam && activeSession && !querySentRef.current) {
      querySentRef.current = true;
      void sendMessage(activeSession.id, queryParam);
    }
  }, [queryParam, activeSession, sendMessage]);

  // Auto-scroll to bottom of chat when new message arrives
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.conversation]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isSending) return;
    const question = inputText;
    // The attached document's masked facts go in front of the question, so the
    // backend's fact extractor and answering agent both see them. The question
    // itself is never truncated (see chat-context.ts).
    const outgoing = composeMessageWithContext(question, attachedDoc?.contextBlock ?? null);
    setInputText("");
    setIsSending(true);
    try {
      await sendMessage(activeSession!.id, outgoing);
    } finally {
      setIsSending(false);
    }
  };

  const handleQuickQuestion = async (q: string) => {
    if (isSending) return;
    setIsSending(true);
    try {
      await sendMessage(activeSession!.id, q);
    } finally {
      setIsSending(false);
    }
  };

  /**
   * Read an attached document through the audit service (POST /extract via our
   * server-side proxy) and keep only its masked fields as chat context.
   * Protocol 4: nothing is persisted, and unmasked values never reach the browser.
   */
  const handleAttachDocument = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const verdict = validateUpload(file);
    if (!verdict.ok) {
      setAttachError(verdict.error ?? "That file could not be used.");
      return;
    }

    setAttachError(null);
    setAttaching(true);
    try {
      const outcome = await extractViaProxy({
        bytes: file,
        fileName: file.name || "document",
        mimeType: file.type || "application/octet-stream",
        sessionId: activeSession?.id ?? "web-session",
        documentId: `chat-${Date.now()}`
      });

      if (!outcome.available) {
        setAttachError(
          "The document reader is offline, so this file could not be read. You can still ask your question without it."
        );
        return;
      }
      if (!outcome.ok) {
        setAttachError(`That document could not be read (${outcome.detail ?? outcome.error}).`);
        return;
      }

      const context = buildDocumentContext(outcome.response, file.name);
      if (!context) {
        setAttachError("No readable details were found on that document.");
        return;
      }
      setAttachedDoc(context);
    } catch (error) {
      setAttachError(error instanceof Error ? error.message : "That document could not be attached.");
    } finally {
      setAttaching(false);
    }
  };

  const handleFileUpload = (docId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Clear the input so re-picking the SAME file still fires a change event.
    e.target.value = "";
    if (!file) return;

    const verdict = validateUpload(file);
    if (!verdict.ok) {
      setUploadError(verdict.error ?? "That file could not be used.");
      return;
    }
    setUploadError(null);
    rememberDocumentFile(activeSession!.id, docId, file);
    uploadDocument(activeSession!.id, docId, file.name);
  };

  /**
   * The single audit action. Runs the REAL pipeline (audit service via the server
   * proxy -> verify -> applyServiceAudit -> crowd tips). The local placeholder check
   * only runs when NEXT_PUBLIC_DEMO_AUDIT=true.
   */
  const handleAudit = async () => {
    if (auditing || !activeSession) return;
    setUploadError(null);

    if (process.env.NEXT_PUBLIC_DEMO_AUDIT === "true") {
      auditDocuments(activeSession.id);
      return;
    }

    const session = activeSession;
    const toFile = (file: File) => ({
      bytes: file as Blob,
      fileName: file.name || "upload",
      mimeType: file.type || "application/octet-stream"
    });
    const candidates: AuditCandidate[] = session.documents.map((doc) => {
      const file = getDocumentFile(session.id, doc.id);
      return {
        id: doc.id,
        name: doc.name,
        role: "SUPPORTING" as const,
        ...(file ? { file: toFile(file) } : {})
      };
    });

    setAuditing(true);
    try {
      postSessionMessage(session.id, `Auditing ${candidates.filter((c) => c.file).length} document(s)…`);

      // Masked extraction metadata is saved best-effort when signed in.
      const extract: typeof extractViaProxy = async (input) => {
        const outcome = await extractViaProxy(input);
        if (outcome.available && outcome.ok && supabase) {
          void supabase.auth
            .getSession()
            .then(({ data }) => {
              const token = data.session?.access_token;
              if (token) {
                return postExtraction(token, {
                  sessionId: input.sessionId,
                  documentId: input.documentId,
                  response: outcome.response
                });
              }
            })
            .catch(() => undefined);
        }
        return outcome;
      };

      const result = await runWebAudit(
        {
          sessionId: session.id,
          schemeId: session.schemeId,
          candidates
        },
        { extract }
      );

      if (result.serviceUnavailable) {
        postSessionMessage(
          session.id,
          "The document audit service is offline, so nothing was verified. Please try again in a moment."
        );
        return;
      }

      const llmSummary = await fetchAuditSummary(
        buildAuditSummaryRequest(result, {
          schemeName: session.schemeName,
          language,
          counterLocation: session.counterLocation
        })
      );

      applyServiceAudit(session.id, {
        patches: result.patches.map((patch) => ({
          documentId: patch.documentId,
          isVerified: patch.isVerified,
          fields: patch.fields,
          ifscNote: patch.ifscNote
        })),
        summary: llmSummary ?? summarizeWebAudit(result, session.counterLocation),
        pendingCount: result.audit.requiredDocuments.filter((row) => row.status !== "UPLOADED").length
      });

      // Labels/statuses only; crowd-sourced counter tips come back as an assistant message.
      if (session.chatSessionId) {
        const tips = await postAuditToChat(session.chatSessionId, result.audit);
        if (tips) postSessionMessage(session.id, tips);
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "The audit could not be completed.");
    } finally {
      setAuditing(false);
    }
  };

  /**
   * The citizen picked one of the candidate schemes. Select it on the backend so
   * the session locks to it, then reveal the scheme panel + document checklist
   * with an eligibility-grounded opening message.
   */
  const handleChooseScheme = async (slug: string) => {
    if (!activeSession) return;
    setChoiceError(null);
    setChoosingSlug(slug);

    const catalogScheme = schemes.find((s) => s.id === slug);
    if (!catalogScheme) {
      setChoiceError("That scheme is no longer available. Please pick another.");
      setChoosingSlug(null);
      return;
    }

    let opening = `You selected the ${catalogScheme.name}. Upload your documents on the right and click Check to verify them before visiting the counter.`;

    if (activeSession.chatSessionId) {
      try {
        const selection = await selectChatScheme(activeSession.chatSessionId, slug, language);
        opening = buildSelectionMessage({
          scheme: selection.scheme,
          eligibility: selection.eligibility,
          counter: catalogScheme.counterLocation,
          documentCount: catalogScheme.requiredDocuments.length
        });
      } catch {
        setChoiceError("Could not reach the scheme assistant. Showing the documents anyway.");
      }
    }

    chooseSessionScheme(activeSession.id, catalogScheme.id, opening);
    setChoosingSlug(null);
  };

  /** Read one message aloud, or stop if that message is already playing. */
  const toggleRead = (id: string, text: string) => {
    if (reader.activeId === id && reader.state !== "idle") {
      reader.stop();
      return;
    }
    void reader.play(id, text, language);
  };

  /** Header "Listen": the latest assistant reply. */
  const handleAudioPlayback = () => {
    const last = [...(activeSession?.conversation ?? [])].reverse().find((m) => m.sender === "assistant");
    if (last) toggleRead(last.id, last.text);
  };

  const handleVoiceRecord = () => {
    setVoiceHint(null);
    voice.toggle();
  };

  const isRecording = voice.state === "recording";
  const lastAssistantId = [...(activeSession?.conversation ?? [])].reverse().find((m) => m.sender === "assistant")?.id;
  const isPlayingAudio = reader.state !== "idle" && reader.activeId === lastAssistantId;
  const voiceStatus =
    voice.state === "recording"
      ? `Recording… 0:${String(voice.seconds).padStart(2, "0")} — tap the mic to stop`
      : voice.state === "transcribing"
        ? "Transcribing…"
        : voice.state === "requesting"
          ? "Waiting for microphone permission…"
          : voice.error ?? reader.error ?? voiceHint;

  if (!activeSession) {
    return (
      <div className="bg-[#050505] border border-[#333] rounded-lg p-10 text-center text-gray-500 text-xs">
        No active session selected. <Link href="/sessions" className="text-emerald-500 underline">Return to Sessions</Link>.
      </div>
    );
  }

  const allVerified = activeSession.documents.every((d) => d.isVerified);
  const uploadedCount = activeSession.documents.filter((d) => d.isUploaded).length;

  return (
    <div className="space-y-4">
      {/* Top Session Breadcrumb Bar */}
      <div className="bg-[#050505] border border-[#333] rounded-lg px-5 py-3 shadow-subtle flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-gray-200">Application:</span>
          <span className="font-bold text-white">{activeSession.beneficiaryName}</span>
          <span className="text-gray-600">•</span>
          <span className="text-gray-400">{activeSession.schemeName}</span>
        </div>

        <div className="flex items-center space-x-3">
          <Link
            href="/sessions"
            className="text-xs text-gray-400 hover:text-white font-medium transition-colors"
          >
            Save & Exit to Sessions
          </Link>
        </div>
      </div>

      {/* Main Split-View Workstation: 5 cols Left (Chat) / 7 cols Right (Session State) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
        {/* CHAT PANE (right / 7 cols, the wider one): Conversational Counselor.
            `md:order-2` places it visually on the right while leaving it first in
            the DOM, which is the natural reading order on mobile (single column). */}
        <div className="md:col-span-7 md:order-2 bg-[#050505] border border-[#333] rounded-lg shadow-subtle flex flex-col h-[700px]">
          {/* Assistant Header */}
          <div className="px-4 py-3 border-b border-[#333] flex items-center justify-between bg-black rounded-t-lg">
            <div>
              <h3 className="font-bold text-xs text-white uppercase tracking-wider">
                {language === "mr" ? "नागरिक सहाय्यक" : "Civic Assistant"}
              </h3>
              <p className="text-[11px] text-gray-500">
                {language === "mr" ? "वार्ड नियम व पडताळणी मार्गदर्शन" : "Ward rules & document guidance"}
              </p>
            </div>
            <button
              onClick={handleAudioPlayback}
              className={`p-1.5 rounded border text-xs flex items-center space-x-1 transition-colors ${
                isPlayingAudio
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200 animate-pulse"
                  : "bg-[#050505] text-gray-300 border-[#444] hover:bg-[#1a1a1a]"
              }`}
              title="Listen to Guidance (TTS)"
            >
              <Volume2 className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-[11px] font-medium">{isPlayingAudio ? "Stop" : "Listen"}</span>
            </button>
          </div>

          {/* Conversation Thread */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 text-xs">
            {activeSession.conversation.map((msg) => {
              const isAssistant = msg.sender === "assistant";
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isAssistant ? "items-start" : "items-end"}`}
                >
                  <div className="flex items-center space-x-1.5 mb-1 text-[11px] text-gray-600">
                    <span className="font-semibold text-gray-400">
                      {isAssistant ? "Assistant" : activeSession.beneficiaryName.split(" ")[0]}
                    </span>
                    <span>•</span>
                    <span>{formatTimestamp(msg.timestamp)}</span>
                  </div>
                  <div
                    className={`p-3 rounded-lg max-w-[90%] leading-relaxed whitespace-pre-line break-words ${
                      isAssistant
                        ? "bg-black text-white border border-[#333] text-xs"
                        : "bg-[#0a0a0a] text-white text-xs"
                    }`}
                  >
                    {msg.text.startsWith(OFFLINE_NOTICE) ? (
                      <>
                        <span className="block mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
                          {OFFLINE_NOTICE}
                        </span>
                        {msg.text.slice(OFFLINE_NOTICE.length).trim()}
                      </>
                    ) : (
                      msg.text
                    )}
                  </div>
                  {isAssistant && (
                    <button
                      type="button"
                      onClick={() => toggleRead(msg.id, msg.text)}
                      className="mt-1 text-[11px] text-gray-500 hover:text-white flex items-center space-x-1"
                      title="Read this reply aloud"
                    >
                      {reader.activeId === msg.id && reader.state !== "idle" ? (
                        <>
                          <Square className="w-3 h-3" />
                          <span>{reader.state === "loading" ? "Loading…" : "Stop"}</span>
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-3 h-3" />
                          <span>Listen</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })}

            {isSending && (
              <div className="flex flex-col items-start">
                <div className="flex items-center space-x-1.5 mb-1 text-[11px] text-gray-600">
                  <span className="font-semibold text-gray-400">Assistant</span>
                  <span>•</span>
                  <span>checking…</span>
                </div>
                <div className="p-3 rounded-lg bg-black text-gray-400 border border-[#333] text-xs flex items-center space-x-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                  <span>Checking maintained scheme records…</span>
                </div>
              </div>
            )}

            <div ref={chatBottomRef} />
          </div>

          {/* Quick Suggestions */}
          <div className="px-4 py-2 border-t border-[#222] bg-black/50 flex flex-wrap gap-1.5">
            <button
              onClick={() => handleQuickQuestion(
                schemeData?.counterLocation.desk
                  ? `What are the working hours of ${schemeData.counterLocation.desk}?`
                  : "What are the working hours of the submission counter?"
              )}
              className="text-[11px] px-2 py-1 bg-[#050505] border border-[#333] rounded text-gray-300 hover:bg-[#1a1a1a] transition-colors"
            >
              Counter hours?
            </button>
            <button
              onClick={() => handleQuickQuestion("Can I submit a DigiLocker income certificate?")}
              className="text-[11px] px-2 py-1 bg-[#050505] border border-[#333] rounded text-gray-300 hover:bg-[#1a1a1a] transition-colors"
            >
              DigiLocker cert accepted?
            </button>
            <button
              onClick={() => handleQuickQuestion("Do I need to carry passport photos?")}
              className="text-[11px] px-2 py-1 bg-[#050505] border border-[#333] rounded text-gray-300 hover:bg-[#1a1a1a] transition-colors"
            >
              Passport photos?
            </button>
          </div>

          {/* Chat Input */}
          <form onSubmit={handleSendMessage} className="p-3 border-t border-[#333] space-y-2">
            {/* Attached document: read via the audit service, masked, in memory only */}
            {(attachedDoc || attaching || attachError) && (
              <div className="flex items-start justify-between gap-2 text-[11px] bg-[#0a0a0a] border border-[#333] rounded px-2.5 py-1.5">
                {attaching ? (
                  <span className="flex items-center space-x-1.5 text-gray-400">
                    <Loader2 className="w-3 h-3 animate-spin text-emerald-500" />
                    <span>Reading document…</span>
                  </span>
                ) : attachError ? (
                  <span className="text-amber-400 leading-relaxed">{attachError}</span>
                ) : attachedDoc ? (
                  <span className="text-gray-300 leading-relaxed">
                    <span className="font-semibold text-white">
                      {attachedDoc.documentType} · {attachedDoc.fileName}
                    </span>
                    <span className="text-gray-500"> — {attachedDoc.lines.join(" · ")}</span>
                    <span className="block text-gray-600 mt-0.5">
                      Sent as context with your next question.
                    </span>
                  </span>
                ) : null}

                {!attaching && (
                  <button
                    type="button"
                    onClick={() => {
                      setAttachedDoc(null);
                      setAttachError(null);
                    }}
                    className="shrink-0 text-gray-500 hover:text-white transition-colors"
                    title={attachedDoc ? "Remove attached document" : "Dismiss"}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleVoiceRecord}
                className={`p-2 rounded border transition-colors ${
                  isRecording
                    ? "bg-[#1a0505] text-friction-700 border-friction-200 animate-pulse"
                    : "bg-black text-gray-400 border-[#333] hover:bg-[#1a1a1a]"
                }`}
                title={isRecording ? "Stop recording" : "Speak your question"}
                disabled={voice.state === "transcribing" || voice.state === "requesting"}
              >
                <Mic className="w-4 h-4 text-emerald-500" />
              </button>

              {/* Attach a document to ask about; it is read through POST /extract */}
              <label
                className="p-2 rounded border border-[#333] bg-black text-gray-400 hover:bg-[#1a1a1a] transition-colors cursor-pointer"
                title="Attach a document to use as context"
              >
                {attaching ? (
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                ) : (
                  <Paperclip className="w-4 h-4 text-emerald-500" />
                )}
                <input
                  type="file"
                  accept={UPLOAD_ACCEPT}
                  className="hidden"
                  onChange={handleAttachDocument}
                  disabled={attaching}
                />
              </label>

              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ask any question about ward counter rules..."
                className="flex-1 text-xs px-3 py-2 bg-[#0a0a0a] border border-[#444] rounded focus:border-emerald-500 outline-none text-white placeholder:text-gray-500"
              />
              <button
                type="submit"
                disabled={isSending}
                className="p-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded transition-colors"
              >
                {isSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </button>
            </div>
          </form>
          <p className="px-3 pb-2 text-[11px] text-gray-500">
            {voiceStatus ?? "Your voice is turned into text and not stored."}
          </p>
        </div>

        {/* STATE PANE (left / 5 cols, the narrower one): Live Session State Card */}
        <div className="md:col-span-5 md:order-1 bg-[#050505] border border-[#333] rounded-lg p-5 shadow-subtle space-y-5">
          {/* Candidate Picker — the document checklist stays hidden until a choice */}
          {needsSchemeChoice ? (
            <div className="space-y-4">
              <div className="border-b border-[#222] pb-3">
                <span className="text-[11px] text-gray-600 block font-medium">
                  Matched Municipal Schemes:
                </span>
                <h2 className="font-bold text-sm text-white">Choose the scheme you need</h2>
                <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                  {language === "mr"
                    ? "तुमच्या गरजेनुसार योजना निवडा. निवड केल्यानंतरच आवश्यक कागदपत्रांची यादी दिसेल."
                    : "Pick the scheme that fits your situation. The required-documents checklist appears only after you choose."}
                </p>
              </div>

              {activeSession.candidates?.map((candidate) => (
                <div
                  key={candidate.slug}
                  className="bg-[#0a0a0a] border border-[#333] hover:border-emerald-600 rounded-lg p-4 space-y-3 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <span className="text-[11px] font-semibold text-emerald-500 uppercase tracking-wider">
                        {candidate.categoryLabel}
                      </span>
                      <h3 className="font-semibold text-sm text-white leading-snug">
                        {candidate.name}
                      </h3>
                    </div>
                    {candidate.benefitAmount && (
                      <span className="shrink-0 text-xs font-semibold text-emerald-700 tabular-nums">
                        {candidate.benefitAmount}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-gray-400 leading-relaxed">{candidate.description}</p>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-gray-600">
                      {candidate.named ? "Matched from your query" : `Match score ${candidate.score}`}
                    </span>
                    <button
                      onClick={() => void handleChooseScheme(candidate.slug)}
                      disabled={choosingSlug !== null}
                      className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-semibold rounded transition-colors flex items-center space-x-1.5"
                    >
                      {choosingSlug === candidate.slug ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Checking…</span>
                        </>
                      ) : (
                        <>
                          <FileText className="w-3.5 h-3.5" />
                          <span>Choose this scheme</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}

              {choiceError && (
                <p className="text-[11px] text-amber-400 leading-relaxed">{choiceError}</p>
              )}
            </div>
          ) : (
            <>
          {/* Target Scheme Summary */}
          <div className="border-b border-[#222] pb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-[11px] text-gray-600 block font-medium">Target Municipal Scheme:</span>
              <h2 className="font-bold text-sm text-white">{activeSession.schemeName}</h2>
              <span className="text-xs font-semibold text-emerald-700 tabular-nums">
                {activeSession.targetBenefit}
              </span>
            </div>

            <div className="text-right">
              {allVerified ? (
                <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-emerald-50 text-emerald-800 text-[11px] font-semibold rounded border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>All Documents Checked</span>
                </span>
              ) : (
                <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-amber-50 text-amber-800 text-[11px] font-semibold rounded border border-amber-200">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  <span>{activeSession.documentsLeft} Left to Check</span>
                </span>
              )}
            </div>
          </div>

          {/* Submission Desk Location Card */}
          <div className="bg-black p-3 rounded border border-[#333] text-xs space-y-1">
            <span className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider block">
              Where to Submit in Person:
            </span>
            <div className="flex items-start space-x-1.5 text-white">
              <MapPin className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">{activeSession.counterLocation}</p>
                <p className="text-gray-500 text-[11px]">Hours: {activeSession.counterHours}</p>
              </div>
            </div>
          </div>

          {/* Document Checklist & Uploaders */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-[#222] pb-1.5">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Required Documents Checklist
              </h3>
              <Link
                href={`/audit?session=${activeSession.id}`}
                className="text-xs text-emerald-500 hover:text-emerald-600 font-medium"
              >
                Open Full Document Check View →
              </Link>
            </div>

            <div className="space-y-3">
              {activeSession.documents.map((doc) => (
                <div
                  key={doc.id}
                  className="p-3 rounded border border-[#333] bg-[#050505] hover:border-[#444] transition-colors space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      {doc.isVerified ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-[#444] shrink-0" />
                      )}
                      <span className={`font-semibold ${doc.isVerified ? "text-white" : "text-gray-300"}`}>
                        {doc.name}
                      </span>
                    </div>

                    <div>
                      {doc.isVerified ? (
                        <span className="text-emerald-700 font-medium text-[11px] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                          Checked
                        </span>
                      ) : doc.isUploaded ? (
                        <span className="text-amber-700 font-medium text-[11px] bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                          Uploaded
                        </span>
                      ) : (
                        <span className="text-gray-600 text-[11px]">Pending</span>
                      )}
                    </div>
                  </div>

                  {/* Upload input (the single Audit action lives below the list) */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#222] text-[11px]">
                    <div className="text-gray-500 truncate max-w-[200px]">
                      {doc.fileName ? `File: ${doc.fileName}` : "No file uploaded yet"}
                    </div>

                    <div className="flex items-center space-x-2">
                      <label className="cursor-pointer px-2.5 py-1 bg-[#1a1a1a] hover:bg-[#222] hover:text-white text-gray-300 rounded font-medium transition-colors">
                        <span>{doc.isUploaded ? "Replace File" : "Choose File"}</span>
                        <input
                          type="file"
                          accept={UPLOAD_ACCEPT}
                          className="hidden bg-[#0a0a0a] text-white"
                          onChange={(e) => handleFileUpload(doc.id, e)}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Single audit action — replaces the per-document Check buttons */}
            {uploadError && (
              <p className="text-[11px] text-amber-400 leading-relaxed">{uploadError}</p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <p className="text-[11px] text-gray-500 leading-relaxed">
                {uploadedCount === 0
                  ? "Upload at least one document, then run a single audit."
                  : `${uploadedCount} of ${activeSession.documents.length} uploaded — one audit checks them all.`}
              </p>
              <button
                onClick={handleAudit}
                disabled={uploadedCount === 0 || auditing}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded shadow-subtle transition-colors flex items-center space-x-1.5"
              >
                {auditing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                <span>{auditing ? "Auditing…" : "Audit"}</span>
              </button>
            </div>
          </div>

          {/* Official Form & Staple Order Pack */}
          {schemeData && (
          <div className="border-t border-[#333] pt-4 space-y-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Official Application Form & Staple Instructions
            </h3>

            <div className="p-4 rounded-lg bg-black border border-[#333] space-y-3 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <span className="font-semibold text-white block">{schemeData.officialFormName || "Official application form"}</span>
                  <p className="text-gray-500 text-[11px]">
                    Download this official municipal form or retrieve it directly from the municipal portal.
                  </p>
                </div>
                {schemeData.officialFormUrl && (
                <a
                  href={schemeData.officialFormUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-1.5 bg-[#0a0a0a] hover:bg-black text-white text-xs font-semibold rounded flex items-center space-x-1.5 transition-colors self-start sm:self-auto"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Form (PDF)</span>
                </a>
                )}
              </div>

              {schemeData.stapleOrder.length > 0 && (
              <div className="border-t border-[#333] pt-2 space-y-1">
                <span className="text-[11px] font-semibold text-gray-300 block">
                  Papers to staple together in this order before visiting the counter:
                </span>
                <ol className="list-decimal list-inside space-y-0.5 text-gray-400 text-[11px] leading-relaxed">
                  {schemeData.stapleOrder.map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ol>
              </div>
              )}
            </div>
          </div>
          )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AssistantPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-gray-500">Loading Assistant Workstation...</div>}>
      <AssistantContent />
    </Suspense>
  );
}
