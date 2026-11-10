import type { NextRequest } from "next/server";
import { guard, failure, noStoreJson } from "@/lib/bff";
import { findFiles } from "@/lib/oc-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  const query = request.nextUrl.searchParams.get("query");
  if (!query) return noStoreJson([]);
  try {
    return noStoreJson(await findFiles(query));
  } catch (error) {
    return failure(error);
  }
}
