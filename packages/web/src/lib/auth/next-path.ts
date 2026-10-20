/** Only same-origin relative paths are allowed as post-login redirects. */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\\]/.test(next)) return fallback;
  if (next.startsWith("/auth/")) return fallback;
  return next;
}

export const PROTECTED_PREFIXES = ["/profile", "/sessions", "/assistant", "/audit"];

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/** Supabase auth cookie name pattern: sb-<project-ref>-auth-token (possibly chunked .0/.1). */
export function hasAuthCookie(names: string[]): boolean {
  return names.some((n) => /^sb-.+-auth-token(\.\d+)?$/.test(n));
}
