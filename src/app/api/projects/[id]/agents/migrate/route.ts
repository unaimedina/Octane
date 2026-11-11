import type { NextRequest } from "next/server";
import { guard, failure, noStoreJson } from "@/lib/bff";
import { describeProjectFilesError, migrateLegacyContext } from "@/lib/project-files";
import { getProject } from "@/lib/projects";

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
      return noStoreJson({ error: "not_found", message: "Project not found." }, 404);
    }
    const { agents, project: updated } = await migrateLegacyContext(
      auth.session.subject,
      project,
    );
    return noStoreJson({
      agents: { content: agents.content, etag: agents.etag, exists: agents.exists },
      project: updated,
    });
  } catch (error) {
    const described = describeProjectFilesError(error);
    if (described) return noStoreJson(described.body, described.status);
    return failure(error);
  }
}
