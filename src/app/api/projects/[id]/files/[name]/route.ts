import type { NextRequest } from "next/server";
import { guard, failure, noStoreJson } from "@/lib/bff";
import { deleteContextFile, describeProjectFilesError } from "@/lib/project-files";
import { getProject } from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; name: string }> },
) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const { id, name } = await context.params;
    const project = await getProject(auth.session.subject, id);
    if (!project) {
      return noStoreJson({ error: "not_found", message: "Project not found." }, 404);
    }
    await deleteContextFile(project, name);
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const described = describeProjectFilesError(error);
    if (described) return noStoreJson(described.body, described.status);
    return failure(error);
  }
}
