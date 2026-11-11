import type { NextRequest } from "next/server";
import { guard, failure, noStoreJson } from "@/lib/bff";
import { getGithubStatus } from "@/lib/github-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    return noStoreJson(await getGithubStatus(auth.session.subject));
  } catch (error) {
    return failure(error);
  }
}
