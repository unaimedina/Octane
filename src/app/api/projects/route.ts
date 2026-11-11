import type { NextRequest } from "next/server";
import { guard, failure, jsonBody, noStoreJson } from "@/lib/bff";
import { resolveProjectGithubLink } from "@/lib/github-store";
import { isAbsoluteProjectDirectory } from "@/lib/project-paths";
import {
  createProject,
  listProjects,
  ProjectValidationError,
} from "@/lib/projects";
import { validateDirectory } from "@/lib/session-service";
import type { ProjectGithubLink, ProjectInput } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function badRequest(message: string): Response {
  return noStoreJson({ error: "bad_request", message }, 400);
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

export async function GET(request: NextRequest) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    return noStoreJson({ projects: await listProjects(auth.session.subject) });
  } catch (error) {
    return projectFailure(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await guard(request);
  if (auth.error) return auth.error;

  try {
    const body = await jsonBody<unknown>(request);
    if (!isObject(body)) return badRequest("Send a project object.");

    const input = body as unknown as ProjectInput;
    if (typeof input.directory !== "string" || !isAbsoluteProjectDirectory(input.directory)) {
      return badRequest("Choose an absolute folder path.");
    }
    await validateDirectory(input.directory);

    let githubLink: ProjectGithubLink | undefined;
    if (input.github !== undefined) {
      if (input.github === null) {
        githubLink = undefined;
      } else if (
        isObject(input.github) &&
        typeof input.github.repo === "string"
      ) {
        const resolved = await resolveProjectGithubLink(
          auth.session.subject,
          input.github.repo,
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

    const project = await createProject(auth.session.subject, input, githubLink);
    return noStoreJson(project, 201);
  } catch (error) {
    return projectFailure(error);
  }
}
