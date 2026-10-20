#!/usr/bin/env node
/**
 * Audit CLI (R13): the same pipeline the HTTP service runs, for local use.
 *
 *   node dist/cli.js extract <file> [--document-id=..] [--no-ocr]
 *
 * `extract` prints the masked JSON response on stdout and operational lines on
 * stderr. Nothing it prints is unmasked — the pipeline proves that before it
 * returns (`runAudit`).
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { loadAuditConfig, type AuditConfig } from "./config.js";
import { AuditMaskingError, runAudit, type AuditDeps } from "./extract.js";
import { AuditInputError } from "./pages.js";
import { DEFAULT_EVAL_LIMIT, formatEvalReport, runEval } from "./eval.js";
import { createExtractionStore, loadBankMergers, createSupabaseClient } from "./store.js";
import { startAuditServer } from "./server.js";

export type AuditCommand = "extract" | "serve" | "eval";

export interface CliOptions {
  command: AuditCommand;
  file?: string | undefined;
  directory?: string | undefined;
  sessionId: string;
  documentId?: string | undefined;
  skipOcr: boolean;
  limit: number | undefined;
  pretty: boolean;
}

/** Parse the CLI's own arguments (the harvester's convention: no arg library). */
export function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    command: "extract",
    sessionId: "local-session",
    skipOcr: false,
    limit: undefined,
    pretty: true,
  };
  const positional: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string;
    if (arg === "extract" || arg === "serve" || arg === "eval") {
      options.command = arg;
    } else if (arg === "--no-ocr") {
      options.skipOcr = true;
    } else if (arg === "--compact") {
      options.pretty = false;
    } else if (arg === "--session-id") {
      options.sessionId = (argv[++index] as string) ?? options.sessionId;
    } else if (arg.startsWith("--session-id=")) {
      options.sessionId = arg.split("=")[1] as string;
    } else if (arg === "--document-id") {
      options.documentId = argv[++index] as string;
    } else if (arg.startsWith("--document-id=")) {
      options.documentId = arg.split("=")[1] as string;
    } else if (arg.startsWith("--limit=")) {
      options.limit = Number.parseInt(arg.split("=")[1] as string, 10);
    } else if (!arg.startsWith("--")) {
      positional.push(arg);
    }
  }
  const target = positional[0];
  if (options.command === "eval") options.directory = target;
  else if (target !== undefined) options.file = target;
  if (options.limit !== undefined && !Number.isFinite(options.limit)) {
    options.limit = undefined;
  }
  return options;
}

/** Operational lines go to stderr so stdout stays machine-readable JSON. */
export function log(message: string): void {
  process.stderr.write(`[audit] ${message}\n`);
}

/** `extract <file>`: run one document through the pipeline and print the JSON. */
export async function runExtractCommand(
  options: CliOptions,
  deps: Partial<AuditDeps> = {},
  config: AuditConfig = loadAuditConfig(),
): Promise<number> {
  if (options.file === undefined) {
    log("usage: cli.js extract <file.pdf|file.jpg|file.png>");
    return 2;
  }
  // Read the bytes into memory; the path is never passed on and nothing
  // downstream writes a file (R5).
  const bytes = new Uint8Array(readFileSync(options.file));
  const documentId = options.documentId ?? basename(options.file);
  log(`reading ${documentId} (${bytes.byteLength} bytes, in memory only)`);
  const result = await runAudit(
    {
      bytes,
      sessionId: options.sessionId,
      documentId,
      skipOcr: options.skipOcr,
    },
    { config, ...deps },
  );
  const { meta, response } = result;
  log(
    `model=${meta.modelId} provider=${meta.providerId} kind=${meta.kind} ` +
      `pages=${meta.pagesRead}/${meta.pagesTotal} textOnly=${meta.textOnly} ` +
      `ocrDegraded=${meta.ocrDegraded} withheld=[${meta.withheldPages.join(",")}] ` +
      `${meta.durationMs}ms`,
  );
  for (const notice of response.notices) log(notice);
  log(
    `fields=${response.fields.length} flags=${response.flags.length} ` +
      `needs_review=${response.needs_review} unmasked_values=${result.unmasked.length}`,
  );
  process.stdout.write(
    options.pretty
      ? `${JSON.stringify(response, null, 2)}\n`
      : `${JSON.stringify(response)}\n`,
  );
  return 0;
}

/** How the serve command waits for a shutdown; tests inject their own. */
export type ShutdownWait = () => Promise<void>;

/**
 * Resolve on SIGINT/SIGTERM. `serve` must keep the process alive: the bootstrap
 * below calls `process.exit` as soon as `main` resolves, so a `serve` that
 * resolved after starting the listener would print "listening" and exit before
 * answering one request.
 */
function waitForShutdownSignal(): Promise<void> {
  return new Promise((resolve) => {
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.once(signal, () => {
        log(`received ${signal}; shutting down`);
        resolve();
      });
    }
  });
}

export interface MainHooks {
  /** Test seam: resolve this to make `serve` shut down. */
  waitForShutdown?: ShutdownWait | undefined;
}

export async function main(
  argv: readonly string[],
  hooks: MainHooks = {},
): Promise<number> {
  const options = parseArgs(argv);
  const config = loadAuditConfig();
  try {
    if (options.command === "serve") {
      const mergers = await loadBankMergers(
        createSupabaseClient(config) as never,
      );
      const server = await startAuditServer({
        config,
        store: createExtractionStore(config),
        bankMergers: mergers.mergers,
        logger: log,
      });
      log(
        `listening on ${server.url} (database=${
          config.hasSupabase ? "supabase" : "in-memory"
        }, model=${config.modelId})`,
      );
      log(`POST /extract requires the x-audit-token header (AUDIT_SERVICE_TOKEN).`);
      if (mergers.notice) log(mergers.notice);
      await (hooks.waitForShutdown ?? waitForShutdownSignal)();
      await server.close();
      log("stopped");
      return 0;
    }
    if (options.command === "eval") {
      if (options.directory === undefined) {
        log("usage: cli.js eval <samples/synthetic dir> [--limit=N]");
        return 2;
      }
      const mergers = await loadBankMergers(createSupabaseClient(config) as never);
      const report = await runEval(options.directory, {
        config,
        limit: options.limit ?? DEFAULT_EVAL_LIMIT,
        mergers: mergers.mergers,
        onProgress: log,
      });
      process.stdout.write(`${formatEvalReport(report)}\n`);
      return report.passed ? 0 : 1;
    }
    return await runExtractCommand(options, {}, config);
  } catch (error) {
    if (error instanceof AuditInputError) {
      log(`rejected (${error.code}): ${error.message}`);
      return 2;
    }
    if (error instanceof AuditMaskingError) {
      // Fail closed: the response is not returned at all.
      log(`FAILED CLOSED — ${error.message}`);
      return 3;
    }
    log(`failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (
  process.argv[1]?.endsWith("cli.js") ||
  process.argv[1]?.endsWith("cli.ts")
) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );
}
