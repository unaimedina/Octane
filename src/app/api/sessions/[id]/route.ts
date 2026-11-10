import type { NextRequest } from "next/server";
import { guard, failure, jsonBody, noStoreJson } from "@/lib/bff";
import { deleteSession, getSession, updateSessionTitle } from "@/lib/session-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await context.params;
    return noStoreJson(await getSession(id));
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await context.params;
    const body = await jsonBody<{ title?: string }>(request);
    if (!body?.title || typeof body.title !== "string") {
      return noStoreJson({ error: "bad_request", message: "title is required" }, 400);
    }
    return noStoreJson(await updateSessionTitle(id, body.title));
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await context.params;
    await deleteSession(id);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}
