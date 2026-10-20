"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useApp } from "../../lib/context/AppContext";
import { ArrowLeft, CheckCircle2, Clock, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { UPLOAD_ACCEPT, validateUpload } from "../../lib/documents/upload";
import { extractViaProxy } from "../../lib/audit/client";
import {
  runWebAudit,
  summarizeWebAudit,
  type AuditCandidate,
  type AuditProgress
} from "../../lib/audit/run";
import type { FieldCheckResult } from "../../lib/audit/types";
import { postAuditToChat } from "../../lib/audit/chat-link";
import { buildAuditSummaryRequest, fetchAuditSummary } from "../../lib/audit/summary";

/**
 * Synthetic id for the application form. It is the document whose FIELDS get
 * checked, so it is deliberately not one of the supporting-document rows.
 */
const FORM_DOC_ID = "__application_form__";

/** `File` is already a Blob, so it can be handed to the extractor as-is. */
function toUploadedFile(file: File) {
  return {
    bytes: file as Blob,
    fileName: file.name || "upload",
    mimeType: file.type || "application/octet-stream"
  };
}

function AuditContent() {
  const searchParams = useSearchParams();
  const {
    sessions,
    uploadDocument,
    auditDocuments,
    applyServiceAudit,
    postSessionMessage,
    language
  } = useApp();

  const sessionIdParam = searchParams.get("session");
  const [activeSession, setActiveSession] = useState(
    sessions.find((s) => s.id === sessionIdParam) || sessions[0]
  );
  const [uploadError, setUploadError] = useState<string | null>(null);

  // File bytes are held in memory for this visit only. This app never persists a
  // document, and leaving the page means the file has to be re-picked — which the
  // audit reports rather than silently treating the row as checked.
  const fileRef = useRef<Map<string, File>>(new Map());
  const [formFile, setFormFile] = useState<File | null>(null);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<AuditProgress | null>(null);
  const [fieldChecks, setFieldChecks] = useState<FieldCheckResult[]>([]);
  const [auditNotices, setAuditNotices] = useState<string[]>([]);

  useEffect(() => {
    if (sessionIdParam) {
      const found = sessions.find((s) => s.id === sessionIdParam);
      if (found) setActiveSession(found);
    } else if (sessions.length > 0) {
      setActiveSession(sessions[0]);
    }
  }, [sessionIdParam, sessions]);

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
    fileRef.current.set(docId, file);
    uploadDocument(activeSession.id, docId, file.name);
  };

  const handleFormUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const verdict = validateUpload(file);
    if (!verdict.ok) {
      setUploadError(verdict.error ?? "That file could not be used.");
      return;
    }
    setUploadError(null);
    setFormFile(file);
  };

  /**
   * The single audit action. Sends every picked file to the audit service through
   * the server-side proxy, then compares the application form's fields against the
   * supporting documents. If the service is not reachable it falls back to the local
   * deterministic check so an offline demo still responds (Protocol 5).
   */
  const handleAudit = async () => {
    if (running) return;
    setUploadError(null);
    setAuditNotices([]);
    setFieldChecks([]);
    setProgress(null);
    setRunning(true);

    const candidates: AuditCandidate[] = [
      ...(formFile
        ? [
            {
              id: FORM_DOC_ID,
              name: "Application Form",
              role: "APPLICATION_FORM" as const,
              file: toUploadedFile(formFile)
            }
          ]
        : []),
      ...activeSession.documents.map((doc) => {
        const file = fileRef.current.get(doc.id);
        return {
          id: doc.id,
          name: doc.name,
          role: "SUPPORTING" as const,
          ...(file ? { file: toUploadedFile(file) } : {})
        };
      })
    ];

    try {
      postSessionMessage(
        activeSession.id,
        `Auditing ${candidates.filter((candidate) => candidate.file).length} document(s)…`
      );

      const result = await runWebAudit(
        {
          sessionId: activeSession.id,
          schemeId: activeSession.schemeId,
          candidates,
          // Drives the on-page "Reading X of Y" line only. The chat deliberately gets
          // ONE compiled report at the end, never a line per document: the compiled
          // report already names every unreadable file and every document to re-pick.
          onProgress: (p) => {
            setProgress(p);
          }
        },
        { extract: extractViaProxy }
      );

      if (result.serviceUnavailable) {
        const fallback = auditDocuments(activeSession.id);
        setAuditNotices(
          [
            "Document audit service is offline - nothing was verified.",
            fallback.audited > 0 ? `Demo mode: ${fallback.audited} document(s) placeholder-checked, NOT verified.` : ""
          ].filter(Boolean)
        );
        return;
      }

      const notices: string[] = [];
      if (result.unavailable.length > 0) {
        notices.push(
          `Re-pick these files so they can be checked: ${result.unavailable.map((d) => d.name).join(", ")}.`
        );
      }
      for (const failure of result.failed) {
        notices.push(`${failure.name} could not be read (${failure.reason}).`);
      }
      setAuditNotices(notices);
      setFieldChecks(result.audit.fieldChecks);

      // The chat gets an LLM-WRITTEN summary when the backend can produce one, and the
      // deterministic report otherwise. Only statuses/labels/reasons are sent - never a
      // value - and the audit VERDICT itself is unchanged either way.
      const llmSummary = await fetchAuditSummary(
        buildAuditSummaryRequest(result, {
          schemeName: activeSession.schemeName,
          language,
          counterLocation: activeSession.counterLocation
        })
      );
      const summary = llmSummary ?? summarizeWebAudit(result, activeSession.counterLocation);

      applyServiceAudit(activeSession.id, {
        patches: result.patches.map((patch) => ({
          documentId: patch.documentId,
          isVerified: patch.isVerified,
          fields: patch.fields,
          ifscNote: patch.ifscNote
        })),
        summary,
        pendingCount: result.audit.requiredDocuments.filter((row) => row.status !== "UPLOADED").length
      });

      // Fire-and-forget: labels/statuses only go to the chatbot; any crowd tips come back as a chat line.
      if (activeSession.chatSessionId) {
        const sessionId = activeSession.id;
        void postAuditToChat(activeSession.chatSessionId, result.audit).then((tips) => {
          if (tips) postSessionMessage(sessionId, tips);
        });
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "The audit could not be completed.");
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  if (!activeSession) {
    return (
      <div className="bg-[#050505] border border-[#333] rounded-lg p-10 text-center text-gray-500 text-xs">
        No active session selected. <Link href="/sessions" className="text-emerald-500 underline">Return to Sessions</Link>.
      </div>
    );
  }

  const uploadedCount = activeSession.documents.filter((d) => d.isUploaded).length;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top Navigation */}
      <div className="flex items-center justify-between border-b border-[#333] pb-4">
        <div>
          <Link
            href={`/assistant?session=${activeSession.id}`}
            className="inline-flex items-center space-x-1 text-xs font-semibold text-gray-400 hover:text-white transition-colors mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Assistant Session</span>
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            Check Documents: {activeSession.schemeName}
          </h1>
          <p className="text-xs text-gray-400">
            Beneficiary: <span className="font-semibold text-gray-200">{activeSession.beneficiaryName}</span> • Submission at: {activeSession.counterLocation}
          </p>
        </div>

        <Link
          href={`/assistant?session=${activeSession.id}`}
          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold rounded shadow-subtle transition-colors"
        >
          Done & Open Assistant →
        </Link>
      </div>

      {/* Notice Banner */}
      <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-4 text-xs text-gray-300 leading-relaxed">
        <p className="font-semibold text-white mb-0.5">Catch Common Rejection Traps Before Visiting the Counter</p>
        <p>
          Ward clerks defensively reject files for merged bank IFSC codes (like old Syndicate Bank codes) and minor spelling mismatches. Upload your documents below, then press <span className="font-semibold text-white">Audit</span> once to verify them all.
        </p>
      </div>

      {/* Application Form — the document whose FIELDS get checked */}
      <div className="bg-[#050505] border border-[#333] rounded-lg p-5 shadow-subtle space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#222] pb-3">
          <span className="font-bold text-sm text-white">Application Form (the form you filled in)</span>
          {formFile ? (
            <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-emerald-50 text-emerald-800 text-xs font-semibold rounded border border-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Ready to Check</span>
            </span>
          ) : (
            <span className="text-gray-600 text-xs">Not uploaded</span>
          )}
        </div>

        <p className="text-xs text-gray-400 leading-relaxed">
          Upload the filled application form and the Audit compares each field on it — name, date of birth,
          Aadhaar number, bank details — against the matching value in your supporting documents.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className={formFile ? "font-medium text-gray-200" : "text-gray-600"}>
            {formFile ? `Uploaded form: ${formFile.name}` : "Upload the form to check its fields against your documents"}
          </span>
          <label className="cursor-pointer px-3 py-1.5 bg-[#1a1a1a] hover:bg-[#222] hover:text-white text-gray-200 text-xs font-medium rounded transition-colors">
            <span>{formFile ? "Replace Form" : "Choose Form"}</span>
            <input type="file" accept={UPLOAD_ACCEPT} className="hidden" onChange={handleFormUpload} />
          </label>
        </div>
      </div>

      {/* Document Checklist & Upload Station */}
      <div className="space-y-4">
        {activeSession.documents.map((doc, idx) => (
          <div
            key={doc.id}
            className="bg-[#050505] border border-[#333] rounded-lg p-5 shadow-subtle space-y-3 hover:border-[#444] transition-colors"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#222] pb-3">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-xs text-gray-600 tabular-nums">{idx + 1}.</span>
                <span className="font-bold text-sm text-white">{doc.name}</span>
              </div>

              <div>
                {doc.isVerified ? (
                  <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-emerald-50 text-emerald-800 text-xs font-semibold rounded border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Verified</span>
                  </span>
                ) : doc.isUploaded ? (
                  <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-amber-50 text-amber-800 text-xs font-semibold rounded border border-amber-200">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    <span>Uploaded - Ready to Audit</span>
                  </span>
                ) : (
                  <span className="text-gray-600 text-xs">Pending Upload</span>
                )}
              </div>
            </div>

            {/* Upload row */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1">
              <div className="text-gray-400 text-xs">
                {doc.fileName ? (
                  <span className="font-medium text-gray-200">Uploaded file: {doc.fileName}</span>
                ) : (
                  <span className="text-gray-600">Select a clear photo or PDF scan from your device</span>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <label className="cursor-pointer px-3 py-1.5 bg-[#1a1a1a] hover:bg-[#222] hover:text-white text-gray-200 text-xs font-medium rounded transition-colors">
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

            {/* Document Specific Results if Verified */}
            {doc.isVerified && (
              <div className="mt-3 p-3.5 rounded bg-black border border-[#333] text-xs space-y-1.5 animate-in fade-in duration-100">
                <div className="font-semibold text-white text-xs flex items-center space-x-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Document Details Verified</span>
                </div>

                {doc.accountNumber && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-gray-300 pt-1">
                    <div>
                      <span className="text-gray-600 block text-[11px]">Bank Account:</span>
                      <span className="font-mono font-medium">{doc.accountNumber}</span>
                    </div>
                    <div>
                      <span className="text-gray-600 block text-[11px]">Active IFSC Code:</span>
                      <span className="font-mono font-medium text-emerald-700">{doc.ifscCode}</span>
                    </div>
                    {doc.ifscNote && (
                      <div className="sm:col-span-2 text-amber-800 bg-amber-50 p-2 rounded text-[11px] border border-amber-200">
                        {doc.ifscNote}
                      </div>
                    )}
                  </div>
                )}

                {doc.aadhaarMasked && (
                  <div className="text-gray-300 pt-1">
                    <span className="text-gray-600 block text-[11px]">Aadhaar Number:</span>
                    <span className="font-mono font-medium">{doc.aadhaarMasked}</span>
                  </div>
                )}

                {doc.nameOnDocument && (
                  <div className="text-gray-300 text-[11px] pt-1">
                    <span className="text-gray-600">Name Match: </span>
                    <span className="font-medium text-white">{doc.nameOnDocument}</span> (Matches student identity)
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Live progress: /extract takes tens of seconds per document */}
      {running && progress && (
        <div className="flex items-center space-x-2 text-xs text-gray-300">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
          <span>
            Reading {progress.index} of {progress.total}: {progress.name}…
          </span>
        </div>
      )}

      {/* Field checks: every field found on the form, each with exactly one status */}
      {fieldChecks.length > 0 && (
        <div className="bg-[#050505] border border-[#333] rounded-lg p-5 space-y-3">
          <div className="border-b border-[#222] pb-3">
            <h2 className="font-bold text-sm text-white">Application Form Field Checks</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Every field found on your form is listed. A tick means it matched a supporting document; a cross
              means it differed; a question mark means it could not be confirmed and needs your eye.
            </p>
          </div>

          <ul className="space-y-2">
            {fieldChecks.map((check) => (
              <li
                key={check.fieldKey}
                className="flex items-start justify-between gap-3 text-xs border-b border-[#1a1a1a] pb-2 last:border-0"
              >
                <div className="min-w-0">
                  <span className="font-semibold text-gray-200">{check.formLabel}</span>
                  {check.evidence && (
                    <span className="text-gray-500"> — checked against {check.evidence.documentType}</span>
                  )}
                  <p className="text-gray-500 mt-0.5">{check.reason}</p>
                </div>
                <span className="shrink-0">
                  {check.status === "MATCH" ? (
                    <span className="inline-flex items-center space-x-1 text-emerald-400 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Match</span>
                    </span>
                  ) : check.status === "MISMATCH" ? (
                    <span className="inline-flex items-center space-x-1 text-red-400 font-semibold">
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Mismatch</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center space-x-1 text-amber-400 font-semibold">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Check manually</span>
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>

          <p className="text-[11px] text-gray-600 leading-relaxed">
            These checks are guidance only, never a decision, and automated reading can miss things. Review
            every field yourself before submitting.
          </p>
        </div>
      )}

      {/* Audit notices: offline fallback, unreadable files, files needing a re-pick */}
      {auditNotices.length > 0 && (
        <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-4 text-xs text-gray-300 space-y-1">
          {auditNotices.map((notice) => (
            <p key={notice}>{notice}</p>
          ))}
        </div>
      )}

      {uploadError && (
        <p className="text-xs text-amber-400 leading-relaxed">{uploadError}</p>
      )}

      {/* Bottom Audit & Return */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#333]">
        <Link
          href="/sessions"
          className="text-xs font-semibold text-gray-400 hover:text-white"
        >
          ← Back to All Sessions
        </Link>
        <div className="flex items-center space-x-2">
          <Link
            href={`/assistant?session=${activeSession.id}`}
            className="px-4 py-2 bg-[#0a0a0a] hover:bg-black text-gray-300 border border-[#333] text-xs font-semibold rounded transition-colors"
          >
            Save & Return to Session
          </Link>
          <button
            onClick={handleAudit}
            disabled={running || (uploadedCount === 0 && !formFile)}
            className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded shadow-subtle transition-colors flex items-center space-x-1.5"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            <span>{running ? "Auditing…" : "Audit"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AuditPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-gray-500">Loading Document Check Station...</div>}>
      <AuditContent />
    </Suspense>
  );
}
