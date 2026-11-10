import type { NextRequest } from "next/server";
import { guard, failure, jsonBody, noStoreJson } from "@/lib/bff";
import { promptSession } from "@/lib/session-service";

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
    const body = await jsonBody<{
      messageID?: string;
      model?: { providerID: string; modelID: string };
      agent?: string;
      skills?: string[];
      parts?: Array<Record<string, unknown>>;
    }>(request);
    if (!body || !Array.isArray(body.parts)) {
      return noStoreJson({ error: "bad_request", message: "parts are required" }, 400);
    }
    await promptSession(id, {
      messageID: body.messageID,
      model: body.model,
      agent: body.agent,
      skills: Array.isArray(body.skills)
        ? body.skills.filter((id): id is string => typeof id === "string")
        : undefined,
      parts: body.parts,
    });
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}
