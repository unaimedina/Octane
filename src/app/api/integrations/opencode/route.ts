import type { NextRequest } from "next/server";
import { guard, failure, noStoreJson } from "@/lib/bff";
import { getOpenCodeIntegration } from "@/lib/oc-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const integration = await getOpenCodeIntegration();
    if (!integration) {
      return noStoreJson(
        { error: "not_supported", message: "OpenCode account login requires API v2." },
        404,
      );
    }
    return noStoreJson(integration);
  } catch (error) {
    return failure(error);
  }
}
