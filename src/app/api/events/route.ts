import type { NextRequest } from "next/server";
import { guard, failure } from "@/lib/bff";
import { openEventStream } from "@/lib/event-proxy";
import { runWithUpstream, upstreamForSession } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const target = await upstreamForSession(auth.session);
    return await runWithUpstream(target, () => openEventStream(request.signal));
  } catch (error) {
    return failure(error);
  }
}
