import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isAuthPath } from "@/lib/session";

// Optimistic check on cookie presence only; the app shell verifies the session with the API.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const signedIn = request.cookies.has(SESSION_COOKIE);

  if (pathname.startsWith("/session-expiree")) return NextResponse.next();

  if (!signedIn && !isAuthPath(pathname)) {
    const url = new URL("/connexion", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  if (signedIn && isAuthPath(pathname) && !pathname.startsWith("/reinitialiser")) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|icon\\.svg|favicon\\.ico|.*\\.[a-z0-9]+$).*)"],
};
