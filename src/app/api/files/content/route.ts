import type { NextRequest } from "next/server";
import { guard, failure, noStoreJson } from "@/lib/bff";
import { getFileContent } from "@/lib/oc-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  const path = request.nextUrl.searchParams.get("path");
  if (!path) {
    return noStoreJson({ error: "bad_request", message: "path is required" }, 400);
  }
  try {
    const content = await getFileContent(path);
    if (!content) {
      return noStoreJson({ error: "not_found", message: "File not found" }, 404);
    }
    return noStoreJson(content);
  } catch (error) {
    return failure(error);
  }
}
