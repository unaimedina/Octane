import type { NextRequest } from "next/server";
import { guard, failure, jsonBody, noStoreJson } from "@/lib/bff";
import { startIntegrationOAuth } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await context.params;
    const body = await jsonBody<{
      methodID?: unknown;
      inputs?: unknown;
      label?: unknown;
    }>(request);
    if (typeof body?.methodID !== "string" || !body.methodID) {
      return noStoreJson(
        { error: "bad_request", message: "methodID is required." },
        400,
      );
    }
    const inputs =
      body.inputs && typeof body.inputs === "object" && !Array.isArray(body.inputs)
        ? Object.fromEntries(
            Object.entries(body.inputs as Record<string, unknown>)
              .filter(([, value]) => typeof value === "string")
              .map(([key, value]) => [key, value as string]),
          )
        : {};
    return noStoreJson(
      await startIntegrationOAuth(
        id,
        body.methodID,
        inputs,
        typeof body.label === "string" ? body.label : undefined,
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
