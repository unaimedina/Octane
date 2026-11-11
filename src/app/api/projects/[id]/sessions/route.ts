import type { NextRequest } from "next/server";
import { guard, failure, noStoreJson } from "@/lib/bff";
import { apiFlavor } from "@/lib/oc-server";
import { getProject } from "@/lib/projects";
import {
  addContext,
  createSession,
  deleteSession,
} from "@/lib/session-service";

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
    const project = await getProject(auth.session.subject, id);
    if (!project) {
      return noStoreJson(
        { error: "not_found", message: "Project not found." },
        404,
      );
    }

    if ((await apiFlavor()) === "v1") {
      return noStoreJson(
        {
          error: "projects_require_v2",
          message: "Project directories require the OpenCode v2 API.",
        },
        400,
      );
    }

    const session = await createSession(
      `${project.name} session`,
      project.directory,
    );

    if (project.context.trim()) {
      try {
        await addContext(session.id, project.context, "Project context");
      } catch (error) {
        await deleteSession(session.id).catch(() => undefined);
        return failure(error);
      }
    }

    return noStoreJson(session, 201);
  } catch (error) {
    return failure(error);
  }
}
