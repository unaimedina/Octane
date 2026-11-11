import * as oc from "./oc-server";
import { listWorkerSessionIds } from "./tasks";
import type {
  Agent,
  Command,
  FileDiff,
  HarnessId,
  HealthInfo,
  MessageWithParts,
  Path,
  Session,
  SessionStatus,
  SessionWithHarness,
  Skill,
  Todo,
} from "./types";

function tag(session: Session): SessionWithHarness {
  return { ...session, harness: "opencode" };
}

export type SessionPromptBody = {
  messageID?: string;
  model?: { providerID: string; modelID: string };
  agent?: string;
  skills?: string[];
  parts: Array<Record<string, unknown>>;
};

export async function getSessionBackend(
  id: string,
): Promise<{ harness: HarnessId; backendID: string }> {
  return { harness: "opencode", backendID: id };
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

export async function getSessions(): Promise<SessionWithHarness[]> {
  const sessions = await oc.getSessions().catch(() => []);
  return sessions
    .map(tag)
    .sort((a, b) => b.time.updated - a.time.updated);
}

export async function getHiddenSessionIds(subject: string): Promise<string[]> {
  return listWorkerSessionIds(subject).catch(() => []);
}

export async function getSession(id: string): Promise<SessionWithHarness> {
  return tag(await oc.getSession(id));
}

export async function getSessionStatuses(): Promise<Record<string, SessionStatus>> {
  return oc.getSessionStatuses().catch(() => ({}));
}

export async function getMessages(id: string): Promise<MessageWithParts[]> {
  return oc.getMessages(id);
}

export async function getTodos(id?: string): Promise<Todo[]> {
  if (!id) return [];
  return oc.getTodos(id);
}

export async function getSessionDiff(id: string): Promise<FileDiff[]> {
  return oc.getSessionDiff(id);
}

/* -------------------------------------------------------------------------- */
/* Composer context                                                            */
/* -------------------------------------------------------------------------- */

export async function getProviders() {
  return oc.getProviders();
}

export async function getAgents(): Promise<Agent[]> {
  return oc.getAgents();
}

export async function getSkills(): Promise<Skill[]> {
  return oc.getSkills();
}

export async function getCommands(): Promise<Command[]> {
  return oc.getCommands();
}

export async function getPathInfo(): Promise<Path | null> {
  return oc.getPathInfo();
}

export async function hasRepository(directory?: string): Promise<boolean> {
  return oc.hasRepository(directory);
}

export async function getHealth(): Promise<HealthInfo | null> {
  return oc.getHealth();
}

/* -------------------------------------------------------------------------- */
/* Mutations                                                                   */
/* -------------------------------------------------------------------------- */

export async function createSession(
  title?: string,
  directory?: string,
): Promise<Session> {
  return oc.createSession(title, directory);
}

export async function validateDirectory(directory: string): Promise<void> {
  await oc.validateDirectory(directory);
}

export async function updateSessionTitle(
  id: string,
  title: string,
): Promise<SessionWithHarness> {
  return tag(await oc.updateSessionTitle(id, title));
}

export async function deleteSession(id: string): Promise<void> {
  await oc.deleteSession(id);
}

export async function promptSession(
  id: string,
  body: SessionPromptBody,
): Promise<void> {
  await oc.promptSession(id, body);
}

export async function abortSession(id: string): Promise<void> {
  return oc.abortSession(id);
}

export async function addContext(
  id: string,
  text: string,
  description?: string,
): Promise<void> {
  await oc.addContext(id, text, description);
}

export async function commandSession(
  id: string,
  body: {
    messageID?: string;
    command: string;
    arguments: string;
    agent?: string;
    model?: string;
  },
): Promise<void> {
  await oc.commandSession(id, body);
}

export async function shellSession(
  id: string,
  body: {
    messageID?: string;
    command: string;
    agent?: string;
    model?: { providerID: string; modelID: string };
  },
): Promise<void> {
  await oc.shellSession(id, body);
}

export async function forkSession(id: string): Promise<Session> {
  return oc.forkSession(id);
}

export async function summarizeSession(
  id: string,
  model?: { providerID: string; modelID: string } | null,
): Promise<void> {
  return oc.summarizeSession(id, model);
}

export async function respondPermission(
  sessionID: string,
  permissionID: string,
  response: "once" | "always" | "reject",
): Promise<void> {
  return oc.respondPermission(sessionID, permissionID, response);
}
