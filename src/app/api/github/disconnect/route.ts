import type { NextRequest } from "next/server";
import { guard, failure } from "@/lib/bff";
import { deleteGithubConnection } from "@/lib/github-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    await deleteGithubConnection(auth.session.subject);
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
