import { NextResponse, type NextRequest } from "next/server";
import { isSameOrigin, tokensMatch, verifySessionToken, type SessionInfo } from "@/lib/auth";
import { CSRF_COOKIE, CSRF_HEADER } from "@/lib/constants";
import { UpstreamError } from "@/lib/upstream";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Validate the signed session cookie and, for mutations, the CSRF double-submit token. */
export async function guard(
  request: NextRequest,
): Promise<{ session: SessionInfo; error?: undefined } | { error: Response; session?: undefined }> {
  const session = await verifySessionToken(request.cookies.get("oc_session")?.value);
  if (!session) {
    return {
      error: NextResponse.json(
        { error: "unauthorized", message: "Sign in to continue." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      ),
    };
  }

  if (!SAFE_METHODS.has(request.method)) {
    const cookie = request.cookies.get(CSRF_COOKIE)?.value;
    const header = request.headers.get(CSRF_HEADER) ?? undefined;
    if (!isSameOrigin(request) || !tokensMatch(cookie, header)) {
      return {
        error: NextResponse.json(
          { error: "forbidden", message: "Invalid origin or CSRF token." },
          { status: 403, headers: { "Cache-Control": "no-store" } },
        ),
      };
    }
  }

  return { session };
}

export function failure(error: unknown): Response {
  console.error("[bff] request failed:", error);
  if (error instanceof UpstreamError) {
    let message = error.message;
    try {
      const parsed = JSON.parse(error.message) as { message?: string; error?: string };
      message = parsed.message ?? parsed.error ?? message;
    } catch {
      // plain text body
    }
    return NextResponse.json(
      { error: "upstream_error", message },
      {
        status: error.status >= 400 && error.status < 600 ? error.status : 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
  const message = error instanceof Error ? error.message : "Unexpected error";
  return NextResponse.json(
    { error: "upstream_unreachable", message },
    { status: 502, headers: { "Cache-Control": "no-store" } },
  );
}

export async function jsonBody<T>(request: NextRequest): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export function noStoreJson(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
