import type { NextRequest } from "next/server";
import { guard, failure, noStoreJson } from "@/lib/bff";
import { getFileTree } from "@/lib/oc-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const path = request.nextUrl.searchParams.get("path") ?? undefined;
    return noStoreJson(await getFileTree(path));
  } catch (error) {
    return failure(error);
  }
}
