import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { requestIsSecure, verifySessionToken } from "@/lib/auth";
import { GITHUB_STATE_COOKIE, GITHUB_STATE_TTL_SECONDS, SESSION_COOKIE } from "@/lib/constants";
import { publicOrigin } from "@/lib/discord";
import { githubConfigured } from "@/lib/env";
import { githubAuthorizeUrl, githubRedirectUri } from "@/lib/github";
import { safeNextPath } from "@/lib/redirect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  if (!session) {
    return NextResponse.redirect(
      new URL("/login?next=/projects", publicOrigin(request)),
    );
  }
  if (!githubConfigured()) {
    return NextResponse.redirect(
      new URL("/projects?github=not_configured", publicOrigin(request)),
    );
  }

  const state = randomBytes(24).toString("base64url");
  const next = safeNextPath(request.nextUrl.searchParams.get("next"), "/projects");
  const redirectUri = githubRedirectUri(request);
  const payload = Buffer.from(JSON.stringify({ state, next, redirectUri })).toString(
    "base64url",
  );

  const response = NextResponse.redirect(
    githubAuthorizeUrl(state, redirectUri),
  );
  response.cookies.set({
    name: GITHUB_STATE_COOKIE,
    value: payload,
    httpOnly: true,
    sameSite: "lax",
    secure: requestIsSecure(request),
    path: "/",
    maxAge: GITHUB_STATE_TTL_SECONDS,
  });
  return response;
}
