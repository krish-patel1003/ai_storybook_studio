import { NextResponse, type NextRequest } from "next/server";

const AUTH_ROUTES = ["/auth/signin", "/auth/signup"];
const PUBLIC_ROUTES = ["/auth/forgot-password", "/terms", "/privacy"];

function isTokenValid(request: NextRequest): boolean {
  const token = request.cookies.get("sb_token")?.value;
  if (!token || token === "1") return false;
  // Decode JWT exp without a library
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthenticated = isTokenValid(request);
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
