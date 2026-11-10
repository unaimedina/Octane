import { NextResponse, type NextRequest } from "next/server";
import { clearAuthCookies, isSameOrigin, tokensMatch } from "@/lib/auth";
import { CSRF_COOKIE, CSRF_HEADER } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(CSRF_COOKIE)?.value;
  const header = request.headers.get(CSRF_HEADER) ?? undefined;
  if (!isSameOrigin(request) || !tokensMatch(cookie, header)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await clearAuthCookies();
  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
