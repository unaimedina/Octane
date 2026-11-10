import { NextResponse, type NextRequest } from "next/server";
import {
  createSessionToken,
  isSameOrigin,
  newCsrfToken,
  requestIsSecure,
  setAuthCookies,
  tokensMatch,
  verifySessionToken,
} from "@/lib/auth";
import { CSRF_COOKIE, CSRF_HEADER } from "@/lib/constants";
import { authUsername } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await verifySessionToken(request.cookies.get("oc_session")?.value);
  const existingCsrf = request.cookies.get(CSRF_COOKIE)?.value;
  const csrfToken = existingCsrf ?? newCsrfToken();

  const response = NextResponse.json(
    {
      authenticated: Boolean(session),
      username: session?.username ?? authUsername(),
      csrfToken,
      expiresAt: session?.expiresAt ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );

  if (!existingCsrf) {
    response.cookies.set({
      name: CSRF_COOKIE,
      value: csrfToken,
      httpOnly: false,
      sameSite: "lax",
      secure: requestIsSecure(request),
      path: "/",
    });
  }

  return response;
}

/** Rotate the signed session (extends the 12h window) for an already authenticated client. */
export async function POST(request: NextRequest) {
  const session = await verifySessionToken(request.cookies.get("oc_session")?.value);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const cookie = request.cookies.get(CSRF_COOKIE)?.value;
  const header = request.headers.get(CSRF_HEADER) ?? undefined;
  if (!isSameOrigin(request) || !tokensMatch(cookie, header)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { token } = await createSessionToken({
    subject: session.subject,
    username: session.username,
  });
  const csrfToken = newCsrfToken();
  await setAuthCookies(token, csrfToken, requestIsSecure(request));
  return NextResponse.json(
    { ok: true, csrfToken },
    { headers: { "Cache-Control": "no-store" } },
  );
}
