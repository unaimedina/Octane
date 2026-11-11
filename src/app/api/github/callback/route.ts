import { NextResponse, type NextRequest } from "next/server";
import { requestIsSecure, tokensMatch, verifySessionToken } from "@/lib/auth";
import { GITHUB_STATE_COOKIE, SESSION_COOKIE } from "@/lib/constants";
import { publicOrigin } from "@/lib/discord";
import { githubConfigured } from "@/lib/env";
import { exchangeGithubCode, fetchGithubUser, GithubError } from "@/lib/github";
import { saveGithubConnection } from "@/lib/github-store";
import { safeNextPath } from "@/lib/redirect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StatePayload = {
  state?: string;
  next?: string;
  redirectUri?: string;
};

function readState(value: string | undefined): StatePayload | null {
  if (!value) return null;
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as StatePayload;
  } catch {
    return null;
  }
}

function clearState(response: NextResponse, request: NextRequest): NextResponse {
  response.cookies.set({
    name: GITHUB_STATE_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: requestIsSecure(request),
    path: "/",
    maxAge: 0,
  });
  return response;
}

function fail(request: NextRequest, code: string): NextResponse {
  const url = new URL("/projects", publicOrigin(request));
  url.searchParams.set("github", code);
  return clearState(NextResponse.redirect(url), request);
}

export async function GET(request: NextRequest) {
  const session = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  if (!session) {
    return NextResponse.redirect(
      new URL("/login?next=/projects", publicOrigin(request)),
    );
  }
  if (!githubConfigured()) return fail(request, "not_configured");

  const params = request.nextUrl.searchParams;
  if (params.get("error") === "access_denied") {
    return fail(request, "access_denied");
  }

  const code = params.get("code");
  const state = params.get("state");
  const stored = readState(request.cookies.get(GITHUB_STATE_COOKIE)?.value);
  if (
    !code ||
    !state ||
    !stored?.state ||
    !tokensMatch(state, stored.state) ||
    !stored.redirectUri
  ) {
    return fail(request, "state_mismatch");
  }

  try {
    const accessToken = await exchangeGithubCode(code, stored.redirectUri);
    const user = await fetchGithubUser(accessToken);
    await saveGithubConnection(session.subject, {
      login: user.login,
      name: user.name,
      avatarUrl: user.avatarUrl,
      token: accessToken,
    });

    const url = new URL(
      safeNextPath(stored.next, "/projects"),
      publicOrigin(request),
    );
    url.searchParams.set("github", "connected");
    const response = NextResponse.redirect(url);
    response.headers.set("Cache-Control", "no-store");
    return clearState(response, request);
  } catch (error) {
    if (error instanceof GithubError) {
      console.error(`[github-auth] ${error.code ?? "error"}: ${error.message}`);
      return fail(
        request,
        error.code === "not_configured" ? "not_configured" : "github_error",
      );
    }
    console.error("[github-auth] unexpected error");
    return fail(request, "github_error");
  }
}
