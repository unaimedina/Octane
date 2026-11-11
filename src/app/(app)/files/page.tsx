import { FilesView } from "@/components/files/files-view";
import { getFileStatus, getFileTree, getPathInfo } from "@/lib/oc-server";
import { hasRepository } from "@/lib/session-service";

export const dynamic = "force-dynamic";

export const metadata = { title: "Files" };

export default async function FilesPage() {
  const [entries, status, pathInfo, repository] = await Promise.all([
    getFileTree(),
    getFileStatus(),
    getPathInfo(),
    hasRepository(),
  ]);

  return (
    <FilesView
      initialEntries={entries}
      initialStatus={status}
      root={pathInfo?.directory ?? pathInfo?.worktree ?? ""}
      hasRepo={repository}
    />
  );
}
