import { notFound } from "next/navigation";
import { ChatView } from "@/components/chat/chat-view";
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
  getTodos,
  hasRepository,
} from "@/lib/session-service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Session" };

export default async function ChatSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ prompt?: string }>;
}) {
  const { id } = await params;
  const { prompt } = await searchParams;

  let session;
  try {
    session = await getSession(id);
  } catch {
    notFound();
  }

  const [
    messages,
    todos,
    diff,
    commands,
    providers,
    agents,
    skills,
    backend,
    repository,
  ] = await Promise.all([
    getMessages(id),
    getTodos(id),
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
      initialTodos={todos}
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
    />
  );
}
