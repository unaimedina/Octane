import { AppDataProvider } from "@/components/app-data";
import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/auth";
import { harnessLabel } from "@/lib/harness";
import { listProjects } from "@/lib/projects";
import { buildUsageSummary, parseBudget } from "@/lib/usage";
import {
  getAgents,
  getHealth,
  getHiddenSessionIds,
  getPathInfo,
  getProviders,
  getSessions,
  getSessionStatuses,
  getSkills,
  listPendingPermissions,
} from "@/lib/session-service";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const harness = "opencode" as const;

  const [
    sessions,
    pathInfo,
    health,
    providers,
    agents,
    skills,
    statuses,
    hiddenSessionIds,
    projects,
  ] = await Promise.all([
    getSessions(),
    getPathInfo(),
    getHealth(),
    getProviders(),
    getAgents(),
    getSkills(),
    getSessionStatuses(),
    getHiddenSessionIds(session.subject),
    // A projects-store failure must never block the workspace.
    listProjects(session.subject).catch(() => []),
  ]);
  const hiddenSet = new Set(hiddenSessionIds);

  // Catch-up read so a permission that arrived while the page was loading (or
  // while its live event was missed) is visible on the first render. Reuses the
  // statuses already fetched above and is never filtered by `hiddenSet`: worker
  // sessions still need their permissions answered.
  const pending = await listPendingPermissions([], statuses).catch(() => ({
    permissions: [],
    scope: [],
  }));

  const usage = buildUsageSummary(sessions, {
    rollingBudget: parseBudget(process.env.USAGE_ROLLING_BUDGET_USD),
    weeklyBudget: parseBudget(process.env.USAGE_WEEKLY_BUDGET_USD),
    monthlyBudget: parseBudget(process.env.USAGE_MONTHLY_BUDGET_USD),
  });

  return (
    <AppDataProvider
      initialSessions={sessions.filter((item) => !hiddenSet.has(item.id))}
      initialProjects={projects}
      initialModels={providers.models}
      initialDefaultModel={providers.defaultModel}
      initialAgents={agents}
      initialSkills={skills}
      initialPath={pathInfo}
      initialHealth={health}
      initialUsage={usage}
      initialStatuses={statuses}
      initialPermissions={pending.permissions}
      username={session.username}
      harness={harness}
      harnessLabel={harnessLabel(harness)}
      hiddenSessionIds={hiddenSessionIds}
    >
      <AppShell>{children}</AppShell>
    </AppDataProvider>
  );
}
