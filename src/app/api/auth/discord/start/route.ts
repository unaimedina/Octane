import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { requestIsSecure } from "@/lib/auth";
import { DISCORD_STATE_COOKIE, DISCORD_STATE_TTL_SECONDS } from "@/lib/constants";
import {
  discordAuthorizeUrl,
  discordRedirectUri,
  publicOrigin,
} from "@/lib/discord";
import { discordConfigured } from "@/lib/env";
import { safeNextPath } from "@/lib/redirect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!discordConfigured()) {
    return NextResponse.redirect(
      new URL("/login?error=not_configured", publicOrigin(request)),
    );
  }

  const state = randomBytes(24).toString("base64url");
  const redirectUri = discordRedirectUri(request);
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const payload = Buffer.from(JSON.stringify({ state, next, redirectUri })).toString(
    "base64url",
  );

  const response = NextResponse.redirect(discordAuthorizeUrl(state, redirectUri));
  response.cookies.set({
    name: DISCORD_STATE_COOKIE,
    value: payload,
    httpOnly: true,
    sameSite: "lax",
    secure: requestIsSecure(request),
    path: "/",
    maxAge: DISCORD_STATE_TTL_SECONDS,
  });
  return response;
}
