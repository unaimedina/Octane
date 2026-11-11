import type { NextRequest } from "next/server";
import { guard, failure, noStoreJson } from "@/lib/bff";
import {
  describeProjectFilesError,
  listContextFiles,
  MAX_CONTEXT_FILE_BYTES,
  saveContextFile,
} from "@/lib/project-files";
import { getProject } from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MULTIPART_SLACK_BYTES = 64 * 1024;

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
    return noStoreJson({ files: await listContextFiles(project) });
  } catch (error) {
    return projectFailure(error);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await context.params;
    const project = await getProject(auth.session.subject, id);
    if (!project) return notFound();

    // Reject oversized bodies before buffering them. Multipart framing adds a
    // little overhead on top of the file itself.
    const declared = Number(request.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > MAX_CONTEXT_FILE_BYTES + MULTIPART_SLACK_BYTES) {
      return noStoreJson(
        { error: "too_large", message: "Files must be 5 MB or smaller." },
        413,
      );
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return noStoreJson(
        { error: "bad_request", message: "Send multipart/form-data with a file field." },
        400,
      );
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      return noStoreJson(
        { error: "bad_request", message: "Send a file in the \"file\" field." },
        400,
      );
    }
    if (file.size > MAX_CONTEXT_FILE_BYTES) {
      return noStoreJson(
        { error: "too_large", message: "Files must be 5 MB or smaller." },
        413,
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const saved = await saveContextFile(project, file.name, bytes);
    return noStoreJson({ file: saved, files: await listContextFiles(project) }, 201);
  } catch (error) {
    return projectFailure(error);
  }
}
