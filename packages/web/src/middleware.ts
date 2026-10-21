import { NextResponse, type NextRequest } from "next/server";
import { isProtectedPath, hasAuthCookie } from "./lib/auth/next-path";

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (!isProtectedPath(pathname)) return NextResponse.next();
  // No session cookie exists in either case: demo mode has no Supabase at all, and
  // skip-login builds (NEXT_PUBLIC_AUTO_LOGIN) never create a real session. Both
  // fall through to the client-side guard instead of a redirect.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_AUTO_LOGIN === "true") {
    return NextResponse.next();
  }
  const names = req.cookies.getAll().map((c) => c.name);
  if (hasAuthCookie(names)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/auth/signin";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/profile/:path*", "/sessions/:path*", "/assistant/:path*", "/audit/:path*"],
};
