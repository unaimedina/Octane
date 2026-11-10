import type { NextRequest } from "next/server";
import { guard, failure, noStoreJson } from "@/lib/bff";
import { getSessionStatuses } from "@/lib/session-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    return noStoreJson(await getSessionStatuses());
  } catch (error) {
    return failure(error);
  }
}
