import { NextResponse } from "next/server";
import { authConfigured } from "@/lib/env";
import { dataDirPersistence } from "@/lib/storage-status";
import { probeUpstream } from "@/lib/upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public, minimal health probe. Never exposes upstream credentials or paths. */
export async function GET() {
  const [upstream, storage] = await Promise.all([probeUpstream(), dataDirPersistence()]);
  return NextResponse.json(
    {
      ok: true,
      authConfigured: authConfigured(),
      upstream,
      storage,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
