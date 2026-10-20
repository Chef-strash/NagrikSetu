// The one audit run: extract every uploaded file through the audit service, then
// compare the application form against the supporting documents.
//
// Flow: files -> service /extract (sequential, one at a time) -> adapter ->
// verifyApplication -> per-document patches.
//
// Honesty rules enforced here:
//  - a file whose bytes are gone (page reloaded) is reported, never silently passed
//  - a file the service refuses is reported as failed, never counted as verified
//  - when the service is unreachable or unconfigured the run stops and says so,
//    so the caller can fall back to the local check rather than show fake results

import { type ExtractResponse, toAuditDocument } from "./adapt.ts";
import { requestExtraction, type ExtractOutcome } from "./service-client.ts";
import {
  rulesForScheme,
  specsFromSession,
  toDocumentPatches,
  type DocumentAuditPatch
} from "./session.ts";
import type { AuditDocument, AuditResult, DocumentRole } from "./types.ts";
import { verifyApplication } from "./verify.ts";

export interface UploadedFile {
  bytes: Uint8Array | Blob;
  fileName: string;
  mimeType: string;
}

export interface AuditCandidate {
  id: string;
  /** Requirement name as shown in the checklist. */
  name: string;
  role: DocumentRole;
  /** Absent when the page reloaded and the bytes were never kept. */
  file?: UploadedFile;
}

export interface AuditProgress {
  documentId: string;
  name: string;
  index: number;
  total: number;
  state: "running" | "done" | "failed" | "unavailable";
  detail?: string;
}

export interface WebAuditResult {
  audit: AuditResult;
  documents: AuditDocument[];
  patches: DocumentAuditPatch[];
  /** Uploaded rows whose bytes are gone — the citizen must re-pick the file. */
  unavailable: Array<{ documentId: string; name: string }>;
  /** Files the service refused or failed to read. */
  failed: Array<{ documentId: string; name: string; reason: string }>;
  /** True when no document could be extracted because the service was not reachable. */
  serviceUnavailable: boolean;
  /** Why the service was unavailable, when it was. */
  serviceUnavailableReason?: string;
}

export interface RunWebAuditInput {
  sessionId: string;
  schemeId: string | undefined;
  candidates: AuditCandidate[];
  onProgress?: (progress: AuditProgress) => void;
}

export interface RunWebAuditDeps {
  extract?: (input: {
    bytes: Uint8Array | Blob;
    fileName: string;
    mimeType: string;
    sessionId: string;
    documentId: string;
  }) => Promise<ExtractOutcome>;
}

const EMPTY_AUDIT: AuditResult = {
  requiredDocuments: [],
  fieldChecks: [],
  summary: { matches: 0, mismatches: 0, manualChecks: 0, uploaded: 0, missing: 0, needsReview: 0 }
};

export async function runWebAudit(
  input: RunWebAuditInput,
  deps: RunWebAuditDeps = {}
): Promise<WebAuditResult> {
  const extract = deps.extract ?? ((request) => requestExtraction(request));
  const { sessionId, schemeId, candidates, onProgress } = input;

  const withBytes = candidates.filter((candidate) => candidate.file);
  const unavailable = candidates
    .filter((candidate) => !candidate.file)
    .map((candidate) => ({ documentId: candidate.id, name: candidate.name }));

  const documents: AuditDocument[] = [];
  const extracts = new Map<string, ExtractResponse>();
  const failed: WebAuditResult["failed"] = [];

  // Sequential on purpose: the service allows only 2 concurrent runs, and one file
  // at a time keeps progress honest and avoids pointless 429s.
  let index = 0;
  for (const candidate of withBytes) {
    index += 1;
    const file = candidate.file as UploadedFile;
    onProgress?.({
      documentId: candidate.id,
      name: candidate.name,
      index,
      total: withBytes.length,
      state: "running"
    });

    const outcome = await extract({
      bytes: file.bytes,
      fileName: file.fileName,
      mimeType: file.mimeType,
      sessionId,
      documentId: candidate.id
    });

    if (!outcome.available) {
      // Nothing has been read yet: the whole run is off, so stop and let the
      // caller fall back instead of pretending the documents were checked.
      if (documents.length === 0) {
        return {
          audit: EMPTY_AUDIT,
          documents: [],
          patches: [],
          unavailable,
          failed,
          serviceUnavailable: true,
          ...(outcome.detail ? { serviceUnavailableReason: outcome.detail } : {})
        };
      }
      failed.push({
        documentId: candidate.id,
        name: candidate.name,
        reason: outcome.detail ?? "The audit service stopped responding."
      });
      onProgress?.({
        documentId: candidate.id,
        name: candidate.name,
        index,
        total: withBytes.length,
        state: "failed"
      });
      continue;
    }

    if (!outcome.ok) {
      failed.push({
        documentId: candidate.id,
        name: candidate.name,
        reason: outcome.detail ?? outcome.error
      });
      onProgress?.({
        documentId: candidate.id,
        name: candidate.name,
        index,
        total: withBytes.length,
        state: "failed",
        detail: outcome.detail ?? outcome.error
      });
      continue;
    }

    extracts.set(candidate.id, outcome.response);
    documents.push(
      toAuditDocument({
        id: candidate.id,
        role: candidate.role,
        response: outcome.response,
        fileName: file.fileName
      })
    );
    onProgress?.({
      documentId: candidate.id,
      name: candidate.name,
      index,
      total: withBytes.length,
      state: "done"
    });
  }

  const supporting = candidates
    .filter((candidate) => candidate.role === "SUPPORTING")
    .map((candidate) => ({ name: candidate.name }));

  const audit = verifyApplication({
    documents,
    requiredDocuments: specsFromSession(supporting, schemeId),
    rules: rulesForScheme(schemeId)
  });

  return {
    audit,
    documents,
    patches: toDocumentPatches({ documents, extracts, result: audit }),
    unavailable,
    failed,
    serviceUnavailable: false
  };
}

/** A tick / cross / question mark for a status, for the chat report. */
function mark(status: string): string {
  if (status === "MATCH" || status === "UPLOADED") return "✓";
  if (status === "MISMATCH" || status === "MISSING") return "✗";
  return "?";
}

/** Human-readable multi-line report posted to the assistant thread. */
export function summarizeWebAudit(result: WebAuditResult, counterLocation: string): string {
  if (result.serviceUnavailable) {
    return "The document reader is offline, so nothing could be verified online.";
  }

  const { summary } = result.audit;
  const lines: string[] = ["Document audit"];

  for (const row of result.audit.requiredDocuments) {
    const note =
      row.status === "UPLOADED"
        ? ""
        : row.status === "MISSING"
          ? " — not found"
          : " — needs a check";
    lines.push(`${mark(row.status)} ${row.name}${note}`);
  }

  lines.push(
    "",
    `Form checks — ${summary.matches} matched, ${summary.mismatches} mismatched, ${summary.manualChecks} to check by hand`
  );

  if (result.audit.fieldChecks.length === 0) {
    lines.push("• No application form was uploaded, so no fields could be compared.");
  }
  for (const check of result.audit.fieldChecks) {
    lines.push(`${mark(check.status)} ${check.formLabel} — ${check.reason}`);
  }

  if (result.failed.length > 0) {
    lines.push("", `${result.failed.length} file(s) could not be read:`);
    for (const failure of result.failed) {
      lines.push(`✗ ${failure.name} — ${failure.reason}`);
    }
  }

  if (result.unavailable.length > 0) {
    lines.push("", `Re-pick these files to include them: ${result.unavailable.map((d) => d.name).join(", ")}`);
  }

  lines.push(
    "",
    "These checks are guidance only, never a decision. Correct anything flagged, then take your papers to " +
      `${counterLocation}.`
  );

  return lines.join("\n");
}
