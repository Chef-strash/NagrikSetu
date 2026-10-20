/**
 * The audit service (R13, KTD7, U7 step 4): a small Node HTTP process exposing
 * `POST /extract` and `GET /health`, matching the plan's HTTP Contract.
 *
 * Safety properties that are deliberate, not incidental:
 * - Binds **loopback** only. The web app is the only caller.
 * - `POST /extract` requires the shared-secret header `x-audit-token`
 *   (`AUDIT_SERVICE_TOKEN`). With no token configured the endpoint refuses to
 *   run at all — fail closed, because an open port lets anyone spend ClinePass
 *   quota on 40-60 second agent calls.
 * - Caps the request body (upload + multipart overhead), the number of
 *   concurrent runs, and the run's wall-clock time.
 * - Request bodies are never logged: only method, path, status, bytes and
 *   duration. Nothing derived from the document reaches a log line.
 * - Multipart parsing happens on an in-RAM buffer; no temp file is ever used.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AuditConfig } from "./config.js";
import { AUDIT_TOKEN_HEADER } from "./config.js";
import {
  AuditMaskingError,
  runAudit,
  type AuditRunInput,
  type AuditRunResult,
} from "./extract.js";
import { AuditInputError } from "./pages.js";
import type { ExtractionRecord, ExtractionStore } from "./store.js";
import type { BankMerger } from "./verify/validators.js";

/** One multipart part, kept in memory. */
export interface MultipartPart {
  name: string;
  filename: string | undefined;
  contentType: string | undefined;
  data: Buffer;
}

/** Extract the boundary from a `multipart/form-data` content type. */
export function multipartBoundary(contentType: string): string | undefined {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const value = match?.[1] ?? match?.[2];
  return value?.trim();
}

function splitOn(buffer: Buffer, delimiter: Buffer): Buffer[] {
  const segments: Buffer[] = [];
  let from = 0;
  for (;;) {
    const index = buffer.indexOf(delimiter, from);
    if (index < 0) break;
    segments.push(buffer.subarray(from, index));
    from = index + delimiter.length;
  }
  segments.push(buffer.subarray(from));
  return segments;
}

/** Parse a `multipart/form-data` body from memory. Never touches disk. */
export function parseMultipart(
  body: Buffer,
  contentType: string,
): MultipartPart[] {
  const boundary = multipartBoundary(contentType);
  if (!boundary) throw new AuditInputError("unsupported_type", "missing multipart boundary");
  const parts: MultipartPart[] = [];
  for (const segment of splitOn(body, Buffer.from(`--${boundary}`)).slice(1)) {
    if (segment.length === 0) continue;
    if (segment.subarray(0, 2).toString("latin1") === "--") break; // closing delimiter
    // Each part is `\r\n<headers>\r\n\r\n<body>\r\n`; trailing CRLF trimmed below.
    const headerEnd = segment.indexOf("\r\n\r\n");
    if (headerEnd < 0) continue;
    const headerText = segment.subarray(0, headerEnd).toString("utf8");
    const data = segment.subarray(headerEnd + 4, Math.max(headerEnd + 4, segment.length - 2));
    const disposition = /content-disposition:[^\r\n]*/i.exec(headerText)?.[0] ?? "";
    const name = /name="([^"]*)"/i.exec(disposition)?.[1];
    if (name === undefined) continue;
    const filename = /filename="([^"]*)"/i.exec(disposition)?.[1];
    const partContentType = /content-type:\s*([^\r\n]+)/i.exec(headerText)?.[1]?.trim();
    parts.push({
      name,
      filename: filename === undefined ? undefined : filename,
      contentType: partContentType,
      data: Buffer.from(data),
    });
  }
  return parts;
}

/** Fields the endpoint needs from the multipart body (HTTP Contract). */
export interface ExtractRequest {
  bytes: Uint8Array;
  sessionId: string;
  documentId: string;
}

/**
 * Pull `file`, `session_id` and `document_id` out of the parsed parts. The file
 * name is never trusted for type detection (U4) and is not returned.
 */
export function readExtractRequest(parts: readonly MultipartPart[]): ExtractRequest {
  const file = parts.find((part) => part.name === "file" && part.data.length > 0);
  const sessionId = parts.find((part) => part.name === "session_id")?.data.toString("utf8").trim();
  const documentId = parts.find((part) => part.name === "document_id")?.data.toString("utf8").trim();
  if (!file) throw new AuditInputError("empty_input", "form field 'file' is missing or empty");
  if (!sessionId) throw new AuditInputError("empty_input", "form field 'session_id' is missing");
  if (!documentId) throw new AuditInputError("empty_input", "form field 'document_id' is missing");
  return { bytes: new Uint8Array(file.data), sessionId, documentId };
}

/* -------------------------------------------------------------------------- */
/* Server                                                                     */
/* -------------------------------------------------------------------------- */

export interface AuditServerDeps {
  config: AuditConfig;
  store: ExtractionStore;
  /** Injectable pipeline: tests exercise routing without a model call. */
  run?: ((input: AuditRunInput) => Promise<AuditRunResult>) | undefined;
  /** Bank-merger rows resolved at start-up (Supabase when configured). */
  bankMergers?: readonly BankMerger[] | undefined;
  now?: (() => Date) | undefined;
  /** Operational log sink; receives no request body content, ever. */
  logger?: ((line: string) => void) | undefined;
}

export interface AuditServer {
  server: Server;
  port: number;
  url: string;
  close: () => Promise<void>;
}

/** Read the body with a hard cap, aborting as soon as it is exceeded. */
export function readBody(
  request: IncomingMessage,
  maxBytes: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let exceeded = false;
    request.on("data", (chunk: Buffer) => {
      if (exceeded) return;
      size += chunk.length;
      if (size > maxBytes) {
        exceeded = true;
        // Do NOT destroy the socket here: the connection would reset before the
        // handler writes its 413, and the web app would see a broken
        // pipe instead of the status this contract promises. Stopping the reads
        // lets the response go out; Node closes the connection once it has.
        request.pause();
        reject(
          new AuditInputError("oversize", `request body exceeds ${maxBytes} bytes`),
        );
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

/** Run `work`, or give up after `timeoutMs` (the run is left to settle). */
export async function withTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`run exceeded ${timeoutMs} ms`)),
          timeoutMs,
        );
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function sendJson(
  response: ServerResponse,
  status: number,
  payload: unknown,
): void {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(body.length),
    // Never cached: a response can carry an audit of an identity document.
    "cache-control": "no-store",
  });
  response.end(body);
}

/** HTTP status for a pipeline failure, and the code reported to the caller. */
export function errorResponse(error: unknown): {
  status: number;
  code: string;
  message: string;
} {
  if (error instanceof AuditInputError) {
    const status =
      error.code === "oversize" ? 413 : error.code === "unsupported_type" ? 415 : 400;
    return { status, code: error.code, message: error.message };
  }
  if (error instanceof AuditMaskingError) {
    return {
      status: 500,
      code: "masking_failed",
      message: "the response did not pass the zero-PII check and was not returned",
    };
  }
  return {
    status: 500,
    code: "extraction_failed",
    message: error instanceof Error ? error.message : String(error),
  };
}

/** Build the HTTP server (no `listen`). Tests call this with `listen(0)`. */
export function createAuditServer(deps: AuditServerDeps): Server {
  const { config } = deps;
  const log = deps.logger ?? (() => undefined);
  const now = deps.now ?? (() => new Date());
  const run = deps.run ?? ((input: AuditRunInput) => runAudit(input, { config }));
  let activeRuns = 0;

  return createServer((request, response) => {
    const startedAt = Date.now();
    const finish = (status: number, bytes = 0): void => {
      // No body content, no headers, no document data — only the shape.
      log(
        `${request.method ?? "-"} ${request.url ?? "-"} -> ${status} ` +
          `${Date.now() - startedAt}ms ${bytes}B`,
      );
    };

    if (request.method === "GET" && request.url === "/health") {
      sendJson(response, 200, {
        ok: true,
        database: deps.store.kind === "supabase" ? "supabase" : "in-memory",
        model: config.modelId,
      });
      finish(200);
      return;
    }

    if (request.method !== "POST" || request.url !== "/extract") {
      sendJson(response, 404, { error: "not_found" });
      finish(404);
      return;
    }

    // Fail closed: with no token configured the endpoint does not run at all.
    if (!config.serviceToken) {
      sendJson(response, 503, {
        error: "service_token_unconfigured",
        detail: "set AUDIT_SERVICE_TOKEN before exposing /extract",
      });
      finish(503);
      return;
    }
    if (request.headers[AUDIT_TOKEN_HEADER] !== config.serviceToken) {
      sendJson(response, 401, { error: "unauthorized" });
      finish(401);
      return;
    }
    const contentType = request.headers["content-type"] ?? "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
      sendJson(response, 415, { error: "unsupported_media_type" });
      finish(415);
      return;
    }
    if (activeRuns >= config.maxConcurrentRuns) {
      sendJson(response, 429, { error: "too_many_runs" });
      finish(429);
      return;
    }

    activeRuns += 1;
    void (async () => {
      try {
        const body = await readBody(request, config.maxBodyBytes);
        const parsed = readExtractRequest(parseMultipart(body, contentType));
        const result = await withTimeout(run(parsed), config.runTimeoutMs);
        const record: ExtractionRecord = {
          session_id: parsed.sessionId,
          document_id: parsed.documentId,
          model_id: result.meta.modelId,
          document_type_guess: result.response.document_type_guess,
          needs_review: result.response.needs_review,
          pages_read: result.response.pages_read,
          pages_total: result.response.pages_total,
          // Already masked; the store asserts it again (R11/R14).
          result: result.response,
          created_at: now().toISOString(),
          completed_at: now().toISOString(),
        };
        const payload = result.response;
        try {
          await deps.store.save(record);
        } catch (error) {
          // The audit is still valid; a store failure must not lose the result.
          log(
            `store failed (${
              error instanceof Error ? error.message : String(error)
            }); returning the result anyway`,
          );
          payload.notices = [
            ...payload.notices,
            "The masked result could not be saved for this session.",
          ];
        }
        const bytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
        sendJson(response, 200, payload);
        finish(200, bytes);
      } catch (error) {
        const { status, code, message } = errorResponse(error);
        sendJson(response, status, { error: code, detail: message });
        finish(status);
      } finally {
        activeRuns -= 1;
      }
    })();
  });
}

/** Start the service on the configured loopback address. */
export async function startAuditServer(
  deps: AuditServerDeps,
): Promise<AuditServer> {
  const server = createAuditServer(deps);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(deps.config.port, deps.config.host, () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : deps.config.port;
  return {
    server,
    port,
    url: `http://${deps.config.host}:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}
