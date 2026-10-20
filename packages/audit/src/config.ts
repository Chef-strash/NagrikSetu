/**
 * Audit configuration (U4) — the `AUDIT_*` env prefix (KTD2/KTD3) resolved
 * through the shared `@nagriksetu/agents` resolver, plus this service's limits.
 *
 * `AUDIT_PROVIDER_ID` / `AUDIT_MODEL_ID` / `AUDIT_VISION_MODEL_ID` /
 * `AUDIT_API_KEY` are read by the shared package with the prefix `AUDIT`;
 * everything else here is audit-specific (service token, caps, OCR data dir,
 * optional Supabase for the masked-result table and the bank-merger lookup).
 */
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveModelConfig, resolveProviderKey } from "@nagriksetu/agents";

/** Env prefix for the shared provider/model/key resolver (KTD2, KTD3). */
export const AUDIT_ENV_PREFIX = "AUDIT";

/**
 * Shared-secret header name required on `POST /extract`. The value comes from
 * `AUDIT_SERVICE_TOKEN`; with it unset the endpoint refuses to run (fail
 * closed) rather than exposing 40-60 second ClinePass calls to anyone who can
 * reach the port.
 */
export const AUDIT_TOKEN_HEADER = "x-audit-token";

/** Env var holding the shared service token. */
export const AUDIT_TOKEN_ENV = "AUDIT_SERVICE_TOKEN";

/** Optional local Tesseract language-data directory (no network for a demo). */
export const AUDIT_TESSDATA_ENV = "AUDIT_TESSDATA_DIR";

/** Loopback only: the web app is the only caller in normal operation. */
export const DEFAULT_AUDIT_HOST = "127.0.0.1";
/** Default port (KTD7). */
export const DEFAULT_AUDIT_PORT = 8787;
/** R4: one PDF/JPEG/PNG up to 10 MB. */
export const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** R4: at most the first 3 pages. */
export const DEFAULT_MAX_PAGES = 3;
/** Multipart overhead allowance on top of the upload cap. */
export const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;
/** Agent calls run 40-60 s; anything past this is treated as a timed-out run. */
export const DEFAULT_RUN_TIMEOUT_MS = 120_000;
/** Concurrent agent runs allowed on one process. */
export const DEFAULT_MAX_CONCURRENT_RUNS = 2;

export interface AuditConfig {
  providerId: string;
  modelId: string;
  visionModelId: string;
  apiKey: string | undefined;
  /** Absolute path a demo can point at pre-fetched `*.traineddata`. */
  tessdataDir: string | undefined;
  /** Where tesseract.js may cache downloaded language data (never CWD). */
  tessdataCacheDir: string;
  /** Loopback bind address (KTD7). */
  host: string;
  port: number;
  serviceToken: string | undefined;
  maxUploadBytes: number;
  maxPages: number;
  maxBodyBytes: number;
  maxConcurrentRuns: number;
  runTimeoutMs: number;
  supabaseUrl: string | undefined;
  supabaseServiceRoleKey: string | undefined;
  /** True when Supabase is configured; R14 returns a result either way. */
  hasSupabase: boolean;
  /** True when images must not be attached at all (text-only mode). */
  textOnly: boolean;
}

function readNumber(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Resolve the audit configuration from an env object (defaults to process.env). */
export function loadAuditConfig(env: NodeJS.ProcessEnv = process.env): AuditConfig {
  const models = resolveModelConfig(env, AUDIT_ENV_PREFIX);
  const providerId = models.providerId;
  const supabaseUrl = env["SUPABASE_URL"]?.trim() || undefined;
  const supabaseServiceRoleKey =
    env["SUPABASE_SERVICE_ROLE_KEY"]?.trim() || undefined;
  return {
    providerId,
    modelId: models.modelId,
    visionModelId: models.visionModelId,
    apiKey: resolveProviderKey(env, providerId, AUDIT_ENV_PREFIX),
    tessdataDir: env[AUDIT_TESSDATA_ENV]?.trim() || undefined,
    tessdataCacheDir: env["AUDIT_TESSDATA_CACHE_DIR"]?.trim() || defaultTessdataCacheDir(),
    host: env["AUDIT_HOST"]?.trim() || DEFAULT_AUDIT_HOST,
    port: readNumber(env, "AUDIT_PORT", DEFAULT_AUDIT_PORT),
    serviceToken: env[AUDIT_TOKEN_ENV]?.trim() || undefined,
    maxUploadBytes: readNumber(
      env,
      "AUDIT_MAX_UPLOAD_BYTES",
      DEFAULT_MAX_UPLOAD_BYTES,
    ),
    maxPages: readNumber(env, "AUDIT_MAX_PAGES", DEFAULT_MAX_PAGES),
    maxBodyBytes:
      readNumber(env, "AUDIT_MAX_UPLOAD_BYTES", DEFAULT_MAX_UPLOAD_BYTES) +
      MULTIPART_OVERHEAD_BYTES,
    maxConcurrentRuns: readNumber(
      env,
      "AUDIT_MAX_CONCURRENT_RUNS",
      DEFAULT_MAX_CONCURRENT_RUNS,
    ),
    runTimeoutMs: readNumber(env, "AUDIT_RUN_TIMEOUT_MS", DEFAULT_RUN_TIMEOUT_MS),
    supabaseUrl,
    supabaseServiceRoleKey,
    hasSupabase: Boolean(supabaseUrl && supabaseServiceRoleKey),
    textOnly: env["AUDIT_TEXT_ONLY"]?.trim() === "1",
  };
}

/**
 * Default language-data cache. Explicitly *not* the working directory:
 * tesseract.js falls back to `cachePath || '.'`, so leaving it unset drops
 * `eng.traineddata` (and Hindi/Marathi data) next to the source tree.
 */
function defaultTessdataCacheDir(): string {
  return join(tmpdir(), "nagriksetu-tessdata");
}
