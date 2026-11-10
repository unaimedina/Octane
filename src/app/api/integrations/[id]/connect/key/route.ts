import type { NextRequest } from "next/server";
import { guard, failure, jsonBody, noStoreJson } from "@/lib/bff";
import { connectIntegrationKey } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await context.params;
    const body = await jsonBody<{ key?: unknown; label?: unknown }>(request);
    if (typeof body?.key !== "string" || !body.key.trim()) {
      return noStoreJson(
        { error: "bad_request", message: "API key is required." },
        400,
      );
    }
    await connectIntegrationKey(
      id,
      body.key.trim(),
      typeof body.label === "string" ? body.label : undefined,
    );
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
