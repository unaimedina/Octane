import type { NextRequest } from "next/server";
import { guard, failure, noStoreJson } from "@/lib/bff";
import {
  cancelIntegrationAttempt,
  getIntegrationAttemptStatus,
} from "@/lib/integrations";

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
    return noStoreJson(await getIntegrationAttemptStatus(attemptID));
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
    await cancelIntegrationAttempt(attemptID);
    return new Response(null, { status: 204 });
  } catch (error) {
    return failure(error);
  }
}
