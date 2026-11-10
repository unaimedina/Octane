import { NextResponse } from "next/server";
import { authConfigured } from "@/lib/env";
import { probeUpstream } from "@/lib/upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public, minimal health probe. Never exposes upstream credentials or paths. */
export async function GET() {
  const upstream = await probeUpstream();
  return NextResponse.json(
    {
      ok: true,
      authConfigured: authConfigured(),
      upstream,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
