import type { NextRequest } from "next/server";
import { guard, failure, noStoreJson } from "@/lib/bff";
import { getSessionChildren } from "@/lib/oc-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await context.params;
    return noStoreJson(await getSessionChildren(id));
  } catch (error) {
    return failure(error);
  }
}
