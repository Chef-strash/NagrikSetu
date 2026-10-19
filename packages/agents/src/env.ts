/**
 * Env-var name helpers shared by key resolution (provider.ts) and model
 * resolution (models.ts).
 *
 * Callers name their own prefix (`HARVESTER`, `AUDIT`) so one package can serve
 * two features without either reading the other's variables.
 */

/**
 * `<PREFIX>_<SUFFIX>`, upper-cased with non-alphanumerics folded to `_`.
 * Returns `undefined` for a blank prefix so a caller that passes `""` never
 * accidentally reads a bare `API_KEY` / `MODEL_ID` variable.
 */
export function envName(prefix: string, suffix: string): string | undefined {
  const normalized = prefix
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return normalized ? `${normalized}_${suffix}` : undefined;
}

/** Trimmed env value, or `undefined` when absent or whitespace-only. */
export function readEnv(
  env: NodeJS.ProcessEnv,
  name: string,
): string | undefined {
  const raw = env[name]?.trim();
  return raw ? raw : undefined;
}
