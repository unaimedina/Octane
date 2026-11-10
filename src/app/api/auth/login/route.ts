import { NextResponse, type NextRequest } from "next/server";
import {
  createSessionToken,
  isSameOrigin,
  newCsrfToken,
  requestIsSecure,
  setAuthCookies,
  verifyLoginPassword,
} from "@/lib/auth";
import { passwordConfigured } from "@/lib/env";
import { checkRateLimit, clientIp, registerFailure, resetRateLimit } from "@/lib/rate-limit";
import { SESSION_TTL_SECONDS } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function tooMany(retryAfter: number, remaining: number) {
  return NextResponse.json(
    { error: "rate_limited", message: "Too many attempts. Try again later." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Remaining": String(remaining),
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const ip = clientIp(request.headers);
  const limit = checkRateLimit(ip);
  if (!limit.allowed) {
    return tooMany(limit.retryAfterSeconds, limit.remaining);
  }

  if (!passwordConfigured()) {
    return NextResponse.json(
      {
        error: "not_configured",
        message:
          "Password sign-in is not configured. Set AUTH_PASSWORD or AUTH_PASSWORD_HASH on the server, or sign in with Discord.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  let password: unknown;
  try {
    const body = (await request.json()) as { password?: unknown };
    password = body?.password;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const valid = await verifyLoginPassword(typeof password === "string" ? password : "");
  if (!valid) {
    registerFailure(ip);
    // Small constant delay to blunt scripted attempts without helping timing attacks.
    await new Promise((resolve) => setTimeout(resolve, 350));
    return NextResponse.json(
      { error: "invalid_credentials", message: "Incorrect password." },
      {
        status: 401,
        headers: {
          "Cache-Control": "no-store",
          "X-RateLimit-Remaining": String(Math.max(0, checkRateLimit(ip).remaining)),
        },
      },
    );
  }

  resetRateLimit(ip);
  let token: string;
  try {
    ({ token } = await createSessionToken());
  } catch {
    return NextResponse.json(
      {
        error: "not_configured",
        message:
          "AUTH_SECRET is missing or too short. Set a random value of at least 32 characters.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  const csrfToken = newCsrfToken();
  await setAuthCookies(token, csrfToken, requestIsSecure(request));

  return NextResponse.json(
    { ok: true, csrfToken, expiresIn: SESSION_TTL_SECONDS },
    { headers: { "Cache-Control": "no-store" } },
  );
}
