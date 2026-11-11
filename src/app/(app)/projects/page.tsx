import { requireSession } from "@/lib/auth";
import { listProjects } from "@/lib/projects";
import { getGithubStatus } from "@/lib/github-store";
import { ProjectsView } from "@/components/projects/projects-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const session = await requireSession();
  const [projects, github] = await Promise.all([
    listProjects(session.subject),
    getGithubStatus(session.subject),
  ]);
  return <ProjectsView initialProjects={projects} github={github} />;
}
