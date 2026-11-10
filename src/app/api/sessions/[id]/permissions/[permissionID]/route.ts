import type { NextRequest } from "next/server";
import { guard, failure, jsonBody, noStoreJson } from "@/lib/bff";
import { respondPermission } from "@/lib/session-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; permissionID: string }> },
) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const { id, permissionID } = await context.params;
    const body = await jsonBody<{ response?: "once" | "always" | "reject" }>(request);
    if (!body?.response || !["once", "always", "reject"].includes(body.response)) {
      return noStoreJson({ error: "bad_request", message: "invalid response" }, 400);
    }
    await respondPermission(id, permissionID, body.response);
    return noStoreJson({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
