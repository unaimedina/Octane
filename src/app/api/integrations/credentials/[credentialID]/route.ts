import type { NextRequest } from "next/server";
import { guard, failure } from "@/lib/bff";
import { deleteIntegrationCredential } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ credentialID: string }> },
) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const { credentialID } = await context.params;
    await deleteIntegrationCredential(credentialID);
    return new Response(null, { status: 204 });
  } catch (error) {
    return failure(error);
  }
}
