import type { NextRequest } from "next/server";
import { guard, failure, jsonBody, noStoreJson } from "@/lib/bff";
import { createSession, getHiddenSessionIds, getSessions } from "@/lib/session-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const [sessions, hiddenIds] = await Promise.all([
      getSessions(),
      getHiddenSessionIds(auth.session.subject),
    ]);
    const hidden = new Set(hiddenIds);
    return noStoreJson(sessions.filter((item) => !hidden.has(item.id)));
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const body = await jsonBody<{ title?: string; directory?: string }>(request);
    return noStoreJson(
      await createSession(body?.title, body?.directory?.trim() || undefined),
      201,
    );
  } catch (error) {
    return failure(error);
  }
}
