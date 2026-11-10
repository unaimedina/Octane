import { NextResponse, type NextRequest } from "next/server";
import {
  createSessionToken,
  newCsrfToken,
  requestIsSecure,
  setAuthCookies,
  tokensMatch,
} from "@/lib/auth";
import { DISCORD_STATE_COOKIE } from "@/lib/constants";
import {
  DiscordAuthError,
  discordDisplayName,
  exchangeDiscordCode,
  fetchDiscordUser,
  publicOrigin,
  requireDiscordRole,
} from "@/lib/discord";
import { discordConfigured } from "@/lib/env";
import { checkRateLimit, clientIp, registerFailure, resetRateLimit } from "@/lib/rate-limit";
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

function fail(request: NextRequest, code: string) {
  const url = new URL("/login", publicOrigin(request));
  url.searchParams.set("error", code);
  const response = NextResponse.redirect(url);
  response.cookies.set({
    name: DISCORD_STATE_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: requestIsSecure(request),
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest) {
  if (!discordConfigured()) return fail(request, "not_configured");

  const params = request.nextUrl.searchParams;
  if (params.get("error") === "access_denied") {
    return fail(request, "access_denied");
  }

  const code = params.get("code");
  const state = params.get("state");
  const stored = readState(request.cookies.get(DISCORD_STATE_COOKIE)?.value);
  if (
    !code ||
    !state ||
    !stored?.state ||
    !tokensMatch(state, stored.state) ||
    !stored.redirectUri
  ) {
    return fail(request, "state_mismatch");
  }

  const ip = clientIp(request.headers);
  const limit = checkRateLimit(ip);
  if (!limit.allowed) {
    return fail(request, "rate_limited");
  }

  try {
    const accessToken = await exchangeDiscordCode(code, stored.redirectUri);
    const user = await fetchDiscordUser(accessToken);
    await requireDiscordRole(user.id);

    let token: string;
    try {
      ({ token } = await createSessionToken({
        subject: user.id,
        username: discordDisplayName(user),
      }));
    } catch {
      return fail(request, "not_configured");
    }

    resetRateLimit(ip);
    const csrfToken = newCsrfToken();
    await setAuthCookies(token, csrfToken, requestIsSecure(request));

    const response = NextResponse.redirect(
      new URL(safeNextPath(stored.next), publicOrigin(request)),
    );
    response.cookies.set({
      name: DISCORD_STATE_COOKIE,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: requestIsSecure(request),
      path: "/",
      maxAge: 0,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    registerFailure(ip);
    if (error instanceof DiscordAuthError) {
      console.error(
        `[discord-auth] ${error.code}${error.discordCode ? ` (discord ${error.discordCode})` : ""}: ${error.message}`,
      );
    } else {
      console.error("[discord-auth] unexpected error", error);
    }
    const code =
      error instanceof DiscordAuthError ? error.code : "discord_error";
    return fail(request, code);
  }
}
