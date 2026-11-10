import type { NextRequest } from "next/server";
import { guard, failure, jsonBody, noStoreJson } from "@/lib/bff";
import { commandSession } from "@/lib/session-service";

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
      command?: string;
      arguments?: string;
      agent?: string;
      model?: string;
    }>(request);
    if (!body?.command) {
      return noStoreJson({ error: "bad_request", message: "command is required" }, 400);
    }
    await commandSession(id, {
      messageID: body.messageID,
      command: body.command,
      arguments: body.arguments ?? "",
      agent: body.agent,
      model: body.model,
    });
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}
