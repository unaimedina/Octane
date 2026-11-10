import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic gate for page navigations. Route handlers and server layouts do the
 * real signature verification; this only avoids flashing protected shells.
 *
 * No matcher export: Next.js 16 proxy files reject extra segment config, so we
 * cheaply skip every path that is not a protected page below.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get("oc_session")?.value;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt"
  ) {
    return NextResponse.next();
  }

  if (pathname === "/login") {
    if (token) return NextResponse.redirect(new URL("/chat", request.url));
    return NextResponse.next();
  }

  const isProtected =
    pathname === "/" ||
    pathname.startsWith("/chat") ||
    pathname.startsWith("/files") ||
    pathname.startsWith("/settings");

  if (!isProtected) return NextResponse.next();

  if (!token) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
