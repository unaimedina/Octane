import { notFound } from "next/navigation";
import { ChatView } from "@/components/chat/chat-view";
import { requireSession } from "@/lib/auth";
import { harnessLabel } from "@/lib/harness";
import {
  getAgents,
  getCommands,
  getMessages,
  getProviders,
  getSession,
  getSessionBackend,
  getSessionDiff,
  getSkills,
  hasRepository,
} from "@/lib/session-service";
import { listTasks } from "@/lib/tasks";

export const dynamic = "force-dynamic";
export const metadata = { title: "Session" };

export default async function ChatSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ prompt?: string; send?: string }>;
}) {
  const { id } = await params;
  const { prompt, send } = await searchParams;
  const auth = await requireSession();

  let session;
  try {
    session = await getSession(id);
  } catch {
    notFound();
  }

  const [
    messages,
    tasks,
    diff,
    commands,
    providers,
    agents,
    skills,
    backend,
    repository,
  ] = await Promise.all([
    getMessages(id),
    listTasks(auth.subject, id),
    getSessionDiff(id),
    getCommands(),
    getProviders(),
    getAgents(),
    getSkills(),
    getSessionBackend(id),
    hasRepository(session.directory || undefined),
  ]);

  return (
    <ChatView
      key={id}
      initialSession={session}
      initialMessages={messages}
      initialTasks={tasks}
      initialDiff={diff}
      commands={commands}
      models={providers.models}
      defaultModel={providers.defaultModel}
      agents={agents}
      skills={skills}
      harnessLabel={harnessLabel(session.harness)}
      backendSessionID={backend.backendID}
      hasRepo={repository}
      initialDraft={prompt ?? ""}
      autoSend={send === "1"}
    />
  );
}
