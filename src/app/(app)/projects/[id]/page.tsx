import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { getProject } from "@/lib/projects";
import { getGithubStatus } from "@/lib/github-store";
import { ProjectDetail } from "@/components/projects/project-detail";

export const dynamic = "force-dynamic";
export const metadata = { title: "Project" };

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const [project, github] = await Promise.all([
    getProject(session.subject, id),
    getGithubStatus(session.subject),
  ]);
  if (!project) notFound();
  return <ProjectDetail initialProject={project} github={github} />;
}
