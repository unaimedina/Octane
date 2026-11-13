import type { NextRequest } from "next/server";
import { guard, failure, noStoreJson } from "@/lib/bff";
import { listPendingPermissions } from "@/lib/session-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;

export async function GET(request: NextRequest) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const ids = request.nextUrl.searchParams
      .getAll("session")
      .filter((id) => SESSION_ID.test(id))
      .slice(0, 5);
    return noStoreJson(await listPendingPermissions(ids));
  } catch (error) {
    return failure(error);
  }
}
