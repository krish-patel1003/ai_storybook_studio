import { NextResponse, type NextRequest } from "next/server";

const AUTH_ROUTES = ["/auth/signin", "/auth/signup"];
const PUBLIC_ROUTES = ["/auth/forgot-password", "/terms", "/privacy"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthenticated = request.cookies.has("sb_token");
  const isAuthRoute = AUTH_ROUTES.some((r) => pathname.startsWith(r));
  const isPublicRoute = PUBLIC_ROUTES.some((r) => pathname.startsWith(r));

  // Signed-in user hitting auth pages → send to app
  if (isAuthenticated && isAuthRoute) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Unauthenticated user hitting a protected route → send to sign in
  if (!isAuthenticated && !isAuthRoute && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/signin";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except Next.js internals and static files.
     */
    "/((?!_next/static|_next/image|favicon.ico|assets/).*)",
  ],
};
