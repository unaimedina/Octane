import type { NextRequest } from "next/server";
import { guard, failure } from "@/lib/bff";
import { openEventStream } from "@/lib/event-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    return await openEventStream(request.signal);
  } catch (error) {
    return failure(error);
  }
}
