import type { NextRequest } from "next/server";
import { guard, failure, noStoreJson } from "@/lib/bff";
import { listIntegrations } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    return noStoreJson({ integrations: await listIntegrations() });
  } catch (error) {
    return failure(error);
  }
}
