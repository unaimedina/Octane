import type { NextRequest } from "next/server";
import { guard, failure, noStoreJson } from "@/lib/bff";
import {
  cancelOpenCodeOAuth,
  getOpenCodeOAuthStatus,
} from "@/lib/oc-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ attemptID: string }> },
) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const { attemptID } = await context.params;
    return noStoreJson(await getOpenCodeOAuthStatus(attemptID));
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ attemptID: string }> },
) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const { attemptID } = await context.params;
    await cancelOpenCodeOAuth(attemptID);
    return new Response(null, { status: 204 });
  } catch (error) {
    return failure(error);
  }
}
