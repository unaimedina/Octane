import type { NextRequest } from "next/server";
import { guard, failure, jsonBody, noStoreJson } from "@/lib/bff";
import { resolveProjectGithubLink } from "@/lib/github-store";
import { isAbsoluteProjectDirectory } from "@/lib/project-paths";
import {
  deleteProject,
  getProject,
  ProjectValidationError,
  updateProject,
} from "@/lib/projects";
import { validateDirectory } from "@/lib/session-service";
import type { ProjectGithubLink, ProjectInput } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function badRequest(message: string): Response {
  return noStoreJson({ error: "bad_request", message }, 400);
}

function notFound(): Response {
  return noStoreJson({ error: "not_found", message: "Project not found." }, 404);
}

function projectFailure(error: unknown): Response {
  if (error instanceof ProjectValidationError) {
    return badRequest(error.message);
  }
  return failure(error);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
    return noStoreJson(project);
  } catch (error) {
    return projectFailure(error);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await guard(request);
  if (auth.error) return auth.error;

  try {
    const { id } = await context.params;
    const current = await getProject(auth.session.subject, id);
    if (!current) return notFound();

    const body = await jsonBody<unknown>(request);
    if (!isObject(body)) return badRequest("Send a project object.");

    const patch: Partial<ProjectInput> = {};
    if ("name" in body) patch.name = body.name as string;
    if ("description" in body) {
      patch.description = body.description as string | undefined;
    }
    if ("context" in body) patch.context = body.context as string;
    if ("directory" in body) {
      if (
        typeof body.directory !== "string" ||
        !isAbsoluteProjectDirectory(body.directory)
      ) {
        return badRequest("Choose an absolute folder path.");
      }
      await validateDirectory(body.directory);
      patch.directory = body.directory;
    }

    let githubLink: ProjectGithubLink | null | undefined;
    if ("github" in body) {
      if (body.github === null) {
        githubLink = null;
      } else if (isObject(body.github) && typeof body.github.repo === "string") {
        const resolved = await resolveProjectGithubLink(
          auth.session.subject,
          body.github.repo,
          current.github,
        );
        if (!resolved.ok) {
          return noStoreJson(
            { error: resolved.error, message: resolved.message },
            resolved.error === "bad_request" ? 400 : 409,
          );
        }
        githubLink = resolved.link;
      } else {
        return badRequest("GitHub repository must be owner/name.");
      }
    }

    const project = await updateProject(
      auth.session.subject,
      id,
      patch,
      githubLink,
    );
    return noStoreJson(project);
  } catch (error) {
    return projectFailure(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await context.params;
    await deleteProject(auth.session.subject, id);
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return projectFailure(error);
  }
}
