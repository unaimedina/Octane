import { requireSession } from "@/lib/auth";
import { getGoUsage } from "@/lib/go-usage";
import { getSessions } from "@/lib/session-service";
import { buildUsageSummary } from "@/lib/usage";
import { UsageView } from "@/components/usage/usage-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Usage" };

export default async function UsagePage() {
  const session = await requireSession();
  const [sessions, goUsage] = await Promise.all([
    getSessions(),
    getGoUsage(session.subject),
  ]);
  const usage = buildUsageSummary(sessions, { goUsage });
  return <UsageView usage={usage} />;
}
