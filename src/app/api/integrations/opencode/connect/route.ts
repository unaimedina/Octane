import type { NextRequest } from "next/server";
import { guard, failure, jsonBody, noStoreJson } from "@/lib/bff";
import { getOpenCodeIntegration, startOpenCodeOAuth } from "@/lib/oc-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const body = await jsonBody<{ methodID?: string }>(request);
    let methodID = body?.methodID;
    if (!methodID) {
      const integration = await getOpenCodeIntegration();
      methodID = integration?.oauthMethodID ?? "device";
    }
    return noStoreJson(await startOpenCodeOAuth(methodID));
  } catch (error) {
    return failure(error);
  }
}
