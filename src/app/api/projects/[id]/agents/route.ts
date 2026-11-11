import type { NextRequest } from "next/server";
import { guard, failure, jsonBody, noStoreJson } from "@/lib/bff";
import { describeProjectFilesError, readAgents, writeAgents } from "@/lib/project-files";
import { getProject } from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function notFound(): Response {
  return noStoreJson({ error: "not_found", message: "Project not found." }, 404);
}

function projectFailure(error: unknown): Response {
  const described = describeProjectFilesError(error);
  if (described) return noStoreJson(described.body, described.status);
  return failure(error);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await context.params;
    const project = await getProject(auth.session.subject, id);
    if (!project) return notFound();
    const agents = await readAgents(project);
    return noStoreJson({
      content: agents.content,
      etag: agents.etag,
      exists: agents.exists,
    });
  } catch (error) {
    return projectFailure(error);
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await context.params;
    const project = await getProject(auth.session.subject, id);
    if (!project) return notFound();

    const body = await jsonBody<{ content?: unknown; ifMatch?: unknown }>(request);
    if (
      !body ||
      typeof body.content !== "string" ||
      typeof body.ifMatch !== "string"
    ) {
      return noStoreJson(
        { error: "bad_request", message: "Send { content, ifMatch }." },
        400,
      );
    }
    const agents = await writeAgents(project, body.content, body.ifMatch);
    return noStoreJson({
      content: agents.content,
      etag: agents.etag,
      exists: true,
    });
  } catch (error) {
    return projectFailure(error);
  }
}
