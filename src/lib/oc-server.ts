import path from "node:path";
import type {
  Agent,
  AssistantMessage,
  Command,
  Config,
  File,
  FileContent,
  FileDiff,
  FileNode,
  FilePart,
  HealthInfo,
  MessageWithParts,
  ModelOption,
  OAuthAttempt,
  OAuthStatus,
  OpenCodeIntegration,
  Part,
  Path,
  Session,
  SessionStatus,
  SessionUsage,
  Skill,
  TextPart,
  ToolPart,
  ToolState,
  UserMessage,
} from "./types";
import { apiFlavor, UpstreamError, upstreamFetch, upstreamJson } from "./upstream";
import { serverAuthHeader } from "./env";

type Raw = Record<string, unknown>;

function raw(value: unknown): Raw {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Raw)
    : {};
}
function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/* -------------------------------------------------------------------------- */
/* v2 normalization                                                            */
/* -------------------------------------------------------------------------- */

type V2Session = Raw & {
  id: string;
  title?: string;
  projectID?: string;
  parentID?: string;
  agent?: string;
  model?: { id?: string; providerID?: string };
  location?: { directory?: string };
  cost?: number;
  tokens?: unknown;
  time?: { created?: number; updated?: number };
};

function toSession(value: unknown): Session & SessionUsage {
  const session = raw(value) as V2Session;
  const created = num(session.time?.created, Date.now());
  return {
    id: str(session.id),
    projectID: str(session.projectID),
    directory: str(session.location?.directory),
    parentID: session.parentID ? str(session.parentID) : undefined,
    title: str(session.title) || "Untitled session",
    version: "",
    cost: typeof session.cost === "number" ? session.cost : undefined,
    tokens: session.tokens ? v2TokenUsage(session.tokens) : undefined,
    model: session.model
      ? {
          id: str(session.model.id) || undefined,
          providerID: str(session.model.providerID) || undefined,
        }
      : undefined,
    time: {
      created,
      updated: num(session.time?.updated, created),
    },
  };
}

function v2FileUrl(file: Raw): string {
  const source = raw(file.source);
  if (str(source.type) === "uri" && str(source.uri)) return str(source.uri);
  const mime = str(file.mime, "application/octet-stream");
  const data = str(file.data);
  if (!data) return "";
  return `data:${mime};base64,${data}`;
}

function v2TokenUsage(value: unknown) {
  const tokens = raw(value);
  const cache = raw(tokens.cache);
  return {
    input: num(tokens.input),
    output: num(tokens.output),
    reasoning: num(tokens.reasoning),
    cache: { read: num(cache.read), write: num(cache.write) },
  };
}

function v2ToolPart(
  content: Raw,
  index: number,
  sessionID: string,
  messageID: string,
): ToolPart | null {
  const id = str(content.id, `${messageID}:tool:${index}`);
  const name = str(content.name, "tool");
  const state = raw(content.state);
  const status = str(state.status);
  const input = state.input;
  const metadata = raw(state.metadata);
  const inputRecord: Record<string, unknown> =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : { raw: str(input) };

  let toolState: ToolState;
  if (status === "completed") {
    const outputParts = arr(state.content);
    const output = outputParts
      .map((item) => {
        const entry = raw(item);
        if (str(entry.type) === "text") return str(entry.text);
        if (str(entry.type) === "file") return `[file: ${str(entry.uri, "attachment")}]`;
        return "";
      })
      .filter(Boolean)
      .join("\n");
    toolState = {
      status: "completed",
      input: inputRecord,
      output,
      title: str(metadata.title),
      metadata,
      time: { start: 0, end: 0 },
    };
  } else if (status === "error") {
    const error = raw(state.error);
    toolState = {
      status: "error",
      input: inputRecord,
      error: str(error.message, "Tool call failed"),
      metadata,
      time: { start: 0, end: 0 },
    };
  } else if (status === "running") {
    toolState = {
      status: "running",
      input: inputRecord,
      title: str(metadata.title) || undefined,
      metadata,
      time: { start: 0 },
    };
  } else {
    toolState = {
      status: "pending",
      input: inputRecord,
      raw: str(input),
    };
  }

  return {
    id,
    sessionID,
    messageID,
    type: "tool",
    callID: id,
    tool: name,
    state: toolState,
    metadata,
  };
}

function v2ToMessage(
  value: unknown,
  session: V2Session | null,
): MessageWithParts | null {
  const message = raw(value);
  const type = str(message.type);
  const id = str(message.id);
  const sessionID = str(message.sessionID, str(session?.id));
  const created = num(raw(message.time).created, Date.now());

  if (type === "user") {
    const parts: Part[] = [];
    const text = str(message.text);
    if (text) {
      parts.push({
        id: `${id}:text`,
        sessionID,
        messageID: id,
        type: "text",
        text,
      } satisfies TextPart);
    }
    for (const [index, fileValue] of arr(message.files).entries()) {
      const file = raw(fileValue);
      const url = v2FileUrl(file);
      if (!url) continue;
      parts.push({
        id: `${id}:file:${index}`,
        sessionID,
        messageID: id,
        type: "file",
        mime: str(file.mime, "application/octet-stream"),
        filename: str(file.name) || undefined,
        url,
      } satisfies FilePart);
    }
    const info: UserMessage = {
      id,
      sessionID,
      role: "user",
      time: { created },
      agent: str(session?.agent, "build"),
      model: {
        providerID: str(session?.model?.providerID),
        modelID: str(session?.model?.id),
      },
    };
    return { info, parts };
  }

  if (type === "assistant") {
    const model = raw(message.model);
    const content = arr(message.content);
    const parts: Part[] = [];
    let textOrdinal = 0;
    let reasoningOrdinal = 0;
    content.forEach((value, index) => {
      const entry = raw(value);
      if (str(entry.type) === "text") {
        const text = str(entry.text);
        if (!text) return;
        parts.push({
          id: `${id}:text:${textOrdinal++}`,
          sessionID,
          messageID: id,
          type: "text",
          text,
        } satisfies TextPart);
      } else if (str(entry.type) === "reasoning") {
        parts.push({
          id: `${id}:reasoning:${reasoningOrdinal++}`,
          sessionID,
          messageID: id,
          type: "reasoning",
          text: str(entry.text),
          time: { start: created, end: num(raw(message.time).completed, created) },
        });
      } else if (str(entry.type) === "tool") {
        const tool = v2ToolPart(entry, index, sessionID, id);
        if (tool) parts.push(tool);
      }
    });

    const tokenInfo = v2TokenUsage(message.tokens);
    const error = raw(message.error);
    const info: AssistantMessage = {
      id,
      sessionID,
      role: "assistant",
      time: {
        created,
        completed:
          message.time && typeof raw(message.time).completed === "number"
            ? num(raw(message.time).completed)
            : undefined,
      },
      parentID: "",
      modelID: str(model.id, str(model.modelID)),
      providerID: str(model.providerID),
      mode: str(message.agent, "build"),
      path: { cwd: str(session?.location?.directory), root: str(session?.location?.directory) },
      cost: num(message.cost),
      tokens: tokenInfo,
      finish: str(message.finish) || undefined,
      error:
        str(error.message) || str(error.type)
          ? { name: str(error.type, "UnknownError"), data: { message: str(error.message) } }
          : undefined,
    } as AssistantMessage;

    return { info, parts };
  }

  if (type === "synthetic") {
    const text = str(message.text);
    if (!text) return null;
    const description = str(message.description);
    const info: UserMessage = {
      id,
      sessionID,
      role: "user",
      time: { created },
      agent: "context",
      model: { providerID: "", modelID: "" },
    };
    return {
      info,
      parts: [
        {
          id: `${id}:context`,
          sessionID,
          messageID: id,
          type: "text",
          text,
          ...(description ? { metadata: { contextDescription: description } } : {}),
        },
      ],
    };
  }

  if (type === "compaction") {
    const status = str(message.status);
    if (status === "failed") return null;
    const info: AssistantMessage = {
      id,
      sessionID,
      role: "assistant",
      time: { created, completed: created },
      parentID: "",
      modelID: "",
      providerID: "",
      mode: "compaction",
      path: { cwd: "", root: "" },
      cost: 0,
      tokens: v2TokenUsage(message.tokens),
    } as AssistantMessage;
    return {
      info,
      parts: [
        {
          id: `${id}:compaction`,
          sessionID,
          messageID: id,
          type: "compaction",
          auto: str(message.reason) === "auto",
        },
      ],
    };
  }

  if (type === "shell") {
    const command = str(message.command);
    const output = str(raw(message.output).output);
    const info: AssistantMessage = {
      id,
      sessionID,
      role: "assistant",
      time: { created, completed: num(raw(message.time).completed, created) },
      parentID: "",
      modelID: "",
      providerID: "",
      mode: "shell",
      path: { cwd: "", root: "" },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    } as AssistantMessage;
    return {
      info,
      parts: [
        {
          id: `${id}:shell`,
          sessionID,
          messageID: id,
          type: "tool",
          callID: id,
          tool: "bash",
          state: {
            status: "completed",
            input: { command },
            output,
            title: command,
            metadata: {},
            time: { start: created, end: created },
          },
        },
      ],
    };
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

export async function getHealth(): Promise<HealthInfo | null> {
  try {
    if ((await apiFlavor()) === "v2") {
      const info = await upstreamJson<Raw>("/api/info");
      return { healthy: true, version: str(info.version, "2") };
    }
    return await upstreamJson<HealthInfo>("/global/health");
  } catch {
    return null;
  }
}

export async function getPathInfo(): Promise<Path | null> {
  try {
    if ((await apiFlavor()) === "v2") {
      const info = await upstreamJson<Raw>("/api/location");
      const project = raw(info.project);
      return {
        directory: str(info.directory),
        worktree: str(project.directory ?? project.canonical ?? info.directory),
        config: "not exposed by v2",
        state: "not exposed by v2",
      };
    }
    return await upstreamJson<Path>("/path");
  } catch {
    return null;
  }
}

export async function getSessions(): Promise<Session[]> {
  try {
    if ((await apiFlavor()) === "v2") {
      // Show sessions from every project. Filtering by the current project hid
      // sessions after the workspace mount changed on Docker deployments.
      const page = await upstreamJson<Raw>("/api/session?limit=100&order=desc");
      return arr(page.data).map(toSession);
    }
    return await upstreamJson<Session[]>("/session");
  } catch {
    return [];
  }
}

/** Subagent sessions are child sessions in OpenCode. */
export async function getSessionChildren(id: string): Promise<Session[]> {
  try {
    if ((await apiFlavor()) === "v2") {
      const page = await upstreamJson<Raw>("/api/session?limit=200&order=desc");
      return arr(page.data)
        .map(toSession)
        .filter((session) => session.parentID === id);
    }
    return await upstreamJson<Session[]>(
      `/session/${encodeURIComponent(id)}/children`,
    );
  } catch {
    return [];
  }
}

export async function getSession(id: string): Promise<Session> {
  const flavor = await apiFlavor();
  if (flavor === "v2") {
    const result = await upstreamJson<Raw>(`/api/session/${encodeURIComponent(id)}`);
    return toSession(result.data);
  }
  return upstreamJson<Session>(`/session/${encodeURIComponent(id)}`);
}

export async function getSessionStatuses(): Promise<Record<string, SessionStatus>> {
  try {
    if ((await apiFlavor()) === "v2") {
      const result = await upstreamJson<Raw>("/api/session/active");
      const statuses: Record<string, SessionStatus> = {};
      for (const [id, value] of Object.entries(raw(result.data))) {
        if (str(raw(value).type) === "running") statuses[id] = { type: "busy" };
      }
      return statuses;
    }
    return await upstreamJson<Record<string, SessionStatus>>("/session/status");
  } catch {
    return {};
  }
}

export async function getMessages(id: string): Promise<MessageWithParts[]> {
  try {
    if ((await apiFlavor()) === "v2") {
      const [sessionResult, page] = await Promise.all([
        upstreamJson<Raw>(`/api/session/${encodeURIComponent(id)}`).catch(() => null),
        upstreamJson<Raw>(
          `/api/session/${encodeURIComponent(id)}/message?limit=200&order=asc`,
        ),
      ]);
      const session = sessionResult ? (raw(sessionResult.data) as V2Session) : null;
      return arr(page.data)
        .map((message) => v2ToMessage(message, session))
        .filter((message): message is MessageWithParts => Boolean(message))
        .sort((a, b) => a.info.time.created - b.info.time.created);
    }
    return await upstreamJson<MessageWithParts[]>(
      `/session/${encodeURIComponent(id)}/message?limit=200`,
    );
  } catch {
    return [];
  }
}

export async function getTodos(id?: string): Promise<import("./types").Todo[]> {
  try {
    if ((await apiFlavor()) === "v2") {
      // v2 currently has no todo surface; the panel degrades cleanly.
      return [];
    }
    return await upstreamJson<import("./types").Todo[]>(
      `/session/${encodeURIComponent(id ?? "")}/todo`,
    );
  } catch {
    return [];
  }
}

export async function getMessageById(
  sessionID: string,
  messageID: string,
): Promise<MessageWithParts | null> {
  try {
    if ((await apiFlavor()) === "v2") {
      const result = await upstreamJson<Raw>(
        `/api/session/${encodeURIComponent(sessionID)}/message/${encodeURIComponent(messageID)}`,
      );
      return v2ToMessage(result.data, { id: sessionID } as V2Session);
    }
    return await upstreamJson<MessageWithParts>(
      `/session/${encodeURIComponent(sessionID)}/message/${encodeURIComponent(messageID)}`,
    );
  } catch {
    return null;
  }
}

export async function getSessionDiff(id: string): Promise<FileDiff[]> {
  try {
    if ((await apiFlavor()) === "v2") {
      const result = await upstreamJson<Raw>(`/api/session/${encodeURIComponent(id)}/diff`);
      return arr(result.data).map((value) => {
        const item = raw(value);
        return {
          file: str(item.file),
          before: "",
          after: "",
          additions: num(item.additions),
          deletions: num(item.deletions),
          patch: str(item.patch),
        } as FileDiff & { patch?: string };
      });
    }
    return await upstreamJson<FileDiff[]>(`/session/${encodeURIComponent(id)}/diff`);
  } catch {
    return [];
  }
}

export async function getSkills(): Promise<Skill[]> {
  try {
    if ((await apiFlavor()) === "v2") {
      const result = await upstreamJson<Raw>("/api/skill");
      return arr(result.data).map((value) => {
        const skill = raw(value);
        return {
          id: str(skill.id),
          name: str(skill.name, str(skill.id)),
          description: str(skill.description) || undefined,
          autoinvoke: Boolean(skill.autoinvoke),
          path: str(skill.path) || undefined,
          content: str(skill.content) || undefined,
        } satisfies Skill;
      });
    }
    return [];
  } catch {
    return [];
  }
}

export async function getAgents(): Promise<Agent[]> {
  try {
    if ((await apiFlavor()) === "v2") {
      const result = await upstreamJson<Raw>("/api/agent");
      return arr(result.data).map((value) => {
        const agent = raw(value);
        return {
          name: str(agent.id, str(agent.name)),
          description: str(agent.description) || undefined,
          mode: (str(agent.mode, "primary") as Agent["mode"]) ?? "primary",
          builtIn: true,
          permission: {
            edit: "ask",
            bash: {},
          },
          tools: {},
          options: {},
        } as Agent;
      });
    }
    return await upstreamJson<Agent[]>("/agent");
  } catch {
    return [];
  }
}

export async function getCommands(): Promise<Command[]> {
  try {
    if ((await apiFlavor()) === "v2") {
      const result = await upstreamJson<Raw>("/api/command");
      return arr(result.data).map((value) => {
        const command = raw(value);
        return {
          name: str(command.name),
          description: str(command.description) || undefined,
          template: "",
        } as Command;
      });
    }
    return await upstreamJson<Command[]>("/command");
  } catch {
    return [];
  }
}

export async function getProviders(): Promise<{
  models: ModelOption[];
  defaultModel: { providerID: string; modelID: string } | null;
}> {
  try {
    if ((await apiFlavor()) === "v2") {
      const [modelsResult, providersResult, defaultResult] = await Promise.all([
        upstreamJson<Raw>("/api/model"),
        upstreamJson<Raw>("/api/provider").catch(() => null),
        upstreamJson<Raw>("/api/model/default").catch(() => null),
      ]);
      const providerNames = new Map<string, string>();
      const connected = new Set<string>();
      if (providersResult) {
        for (const value of arr(providersResult.data)) {
          const provider = raw(value);
          const id = str(provider.id);
          providerNames.set(id, str(provider.name, id));
          if (str(provider.activation) === "enabled") connected.add(id);
        }
      }
      const models: ModelOption[] = [];
      for (const value of arr(modelsResult.data)) {
        const model = raw(value);
        if (str(model.type, "chat") !== "chat" || model.enabled === false) continue;
        const providerID = str(model.providerID);
        const capabilities = raw(model.capabilities);
        const input = arr(capabilities.input).map((item) => str(item));
        if (!providerNames.has(providerID)) {
          providerNames.set(providerID, providerID);
        }
        models.push({
          providerID,
          providerName: providerNames.get(providerID) ?? providerID,
          modelID: str(model.modelID, str(model.id)),
          name: str(model.name, str(model.modelID)),
          connected: connected.size === 0 || connected.has(providerID),
          reasoning: arr(model.variants).length > 0,
          attachment: input.includes("image") || input.includes("pdf"),
        });
      }
      models.sort((a, b) => {
        if (a.connected !== b.connected) return a.connected ? -1 : 1;
        return `${a.providerName} ${a.name}`.localeCompare(`${b.providerName} ${b.name}`);
      });
      const def = defaultResult ? raw(defaultResult.data) : null;
      const defaultModel =
        def && str(def.providerID)
          ? {
              providerID: str(def.providerID),
              modelID: str(def.modelID, str(def.id)),
            }
          : models[0]
            ? { providerID: models[0].providerID, modelID: models[0].modelID }
            : null;
      return { models, defaultModel };
    }

    const [providers, connected] = await Promise.all([
      upstreamJson<{
        providers: Array<{
          id: string;
          name: string;
          models: Record<
            string,
            { id: string; name: string; reasoning?: boolean; attachment?: boolean }
          >;
        }>;
        default: Record<string, string>;
      }>("/config/providers"),
      upstreamJson<{ connected: string[] }>("/provider").catch(() => null),
    ]);
    const connectedSet = new Set(connected?.connected ?? []);
    const models: ModelOption[] = [];
    for (const provider of providers.providers) {
      for (const model of Object.values(provider.models ?? {})) {
        models.push({
          providerID: provider.id,
          providerName: provider.name,
          modelID: model.id,
          name: model.name,
          connected: connectedSet.has(provider.id),
          reasoning: Boolean(model.reasoning),
          attachment: Boolean(model.attachment),
        });
      }
    }
    models.sort((a, b) => {
      if (a.connected !== b.connected) return a.connected ? -1 : 1;
      return `${a.providerName} ${a.name}`.localeCompare(`${b.providerName} ${b.name}`);
    });
    const [defaultProvider] = Object.keys(providers.default ?? {});
    return {
      models,
      defaultModel:
        defaultProvider && providers.default[defaultProvider]
          ? {
              providerID: defaultProvider,
              modelID: providers.default[defaultProvider],
            }
          : models[0]
            ? { providerID: models[0].providerID, modelID: models[0].modelID }
            : null,
    };
  } catch {
    return { models: [], defaultModel: null };
  }
}

export async function getOpenCodeIntegration(): Promise<OpenCodeIntegration | null> {
  if ((await apiFlavor()) !== "v2") return null;
  // Newly spawned per-user servers expose integrations shortly after /api/info.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await upstreamJson<Raw>("/api/integration/opencode");
      const data = raw(result.data);
      const methods = arr(data.methods).map(raw);
      const oauth = methods.find((method) => str(method.type) === "oauth");
      return {
        id: "opencode",
        name: str(data.name, "OpenCode Console"),
        connections: arr(data.connections).map((value) => {
          const connection = raw(value);
          return {
            type: str(connection.type, "credential"),
            id: str(connection.id) || undefined,
            label: str(connection.label) || undefined,
            method: str(connection.method) || undefined,
          };
        }),
        oauthMethodID: oauth ? str(oauth.id) || null : null,
      };
    } catch (error) {
      const retryable =
        error instanceof UpstreamError && error.status === 404 && attempt < 2;
      if (!retryable) return null;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  return null;
}

const OPENCODE_INTEGRATION = "/api/integration/opencode";

export async function startOpenCodeOAuth(
  methodID: string,
): Promise<OAuthAttempt> {
  const result = await upstreamJson<Raw>(
    `${OPENCODE_INTEGRATION}/connect/oauth`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ methodID }),
    },
  );
  const data = raw(result.data);
  const time = raw(data.time);
  return {
    attemptID: str(data.attemptID),
    url: str(data.url),
    instructions: str(data.instructions),
    mode: str(data.mode) === "code" ? "code" : "auto",
    expires: num(time.expires) || undefined,
  };
}

export async function getOpenCodeOAuthStatus(
  attemptID: string,
): Promise<OAuthStatus> {
  const result = await upstreamJson<Raw>(
    `${OPENCODE_INTEGRATION}/connect/oauth/${encodeURIComponent(attemptID)}`,
  );
  const data = raw(result.data);
  const status = str(data.status, "pending");
  return {
    status: (["pending", "complete", "failed", "expired"].includes(status)
      ? status
      : "pending") as OAuthStatus["status"],
    message: str(data.message) || undefined,
  };
}

export async function completeOpenCodeOAuth(
  attemptID: string,
  code?: string,
): Promise<void> {
  await upstreamJson(
    `${OPENCODE_INTEGRATION}/connect/oauth/${encodeURIComponent(attemptID)}/complete`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: code || null }),
    },
  );
}

export async function cancelOpenCodeOAuth(attemptID: string): Promise<void> {
  await upstreamJson(
    `${OPENCODE_INTEGRATION}/connect/oauth/${encodeURIComponent(attemptID)}`,
    { method: "DELETE" },
  );
}

export async function getConfig(): Promise<Config | null> {
  try {
    if ((await apiFlavor()) === "v2") {
      const { defaultModel } = await getProviders();
      return {
        model: defaultModel
          ? `${defaultModel.providerID}/${defaultModel.modelID}`
          : undefined,
      } as Config;
    }
    return await upstreamJson<Config>("/config");
  } catch {
    return null;
  }
}

export async function getMcpStatus(): Promise<Record<string, unknown>> {
  try {
    if ((await apiFlavor()) === "v2") {
      const result = await upstreamJson<Raw>("/api/mcp");
      const entries: Record<string, unknown> = {};
      for (const value of arr(result.data)) {
        const server = raw(value);
        const name = str(server.name, str(server.id, "mcp"));
        entries[name] = {
          status: str(server.status, str(server.state, "idle")),
          ...server,
        };
      }
      return entries;
    }
    return await upstreamJson<Record<string, unknown>>("/mcp");
  } catch {
    return {};
  }
}

export async function getLspStatus(): Promise<unknown[]> {
  try {
    if ((await apiFlavor()) === "v2") return [];
    return await upstreamJson<unknown[]>("/lsp");
  } catch {
    return [];
  }
}

export async function getFormatterStatus(): Promise<unknown[]> {
  try {
    if ((await apiFlavor()) === "v2") return [];
    return await upstreamJson<unknown[]>("/formatter");
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------------------- */
/* Files                                                                       */
/* -------------------------------------------------------------------------- */

function encodePath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export async function getFileTree(path?: string): Promise<FileNode[]> {
  try {
    if ((await apiFlavor()) === "v2") {
      const query = path ? `?path=${encodeURIComponent(path)}` : "";
      const result = await upstreamJson<Raw>(`/api/fs/list${query}`);
      return arr(result.data).map((value) => {
        const entry = raw(value);
        const entryPath = str(entry.path).replace(/\\/g, "/").replace(/\/+$/, "");
        return {
          name: entryPath.split("/").filter(Boolean).pop() ?? entryPath,
          path: entryPath,
          absolute: entryPath,
          type: str(entry.type) === "directory" ? "directory" : "file",
          ignored: false,
        } as FileNode;
      });
    }
    return await upstreamJson<FileNode[]>(
      `/file${path ? `?path=${encodeURIComponent(path)}` : ""}`,
    );
  } catch {
    return [];
  }
}

export async function getFileContent(path: string): Promise<FileContent | null> {
  try {
    if ((await apiFlavor()) === "v2") {
      const response = await upstreamFetch(`/api/fs/read/${encodePath(path)}`);
      if (!response.ok) return null;
      const contentType = response.headers.get("content-type") ?? "";
      const buffer = Buffer.from(await response.arrayBuffer());
      const textLike =
        contentType.startsWith("text/") ||
        /json|javascript|xml|svg|x-sh|toml|yaml/.test(contentType) ||
        (!contentType && !buffer.includes(0));
      if (!textLike) {
        return {
          type: "binary",
          content: buffer.toString("base64"),
          encoding: "base64",
          mimeType: contentType || "application/octet-stream",
        };
      }
      let diff: string | undefined;
      try {
        const vcs = await upstreamJson<Raw>(
          "/api/vcs/diff?mode=working&untracked=files",
        );
        const match = arr(vcs.data)
          .map(raw)
          .find((item) => str(item.file).replace(/\\/g, "/") === path.replace(/\\/g, "/"));
        if (match) diff = str(match.patch) || undefined;
      } catch {
        // no VCS repository or diff unavailable
      }
      return {
        type: "text",
        content: buffer.toString("utf8"),
        mimeType: contentType || "text/plain",
        ...(diff ? { diff } : {}),
      };
    }
    return await upstreamJson<FileContent>(
      `/file/content?path=${encodeURIComponent(path)}`,
    );
  } catch {
    return null;
  }
}

export async function getFileStatus(): Promise<File[]> {
  try {
    if ((await apiFlavor()) === "v2") {
      const result = await upstreamJson<Raw>("/api/vcs/status");
      return arr(result.data).map((value) => {
        const item = raw(value);
        return {
          path: str(item.file),
          added: num(item.additions),
          removed: num(item.deletions),
          status: str(item.status, "modified") as File["status"],
        };
      });
    }
    return await upstreamJson<File[]>("/file/status");
  } catch {
    return [];
  }
}

export async function findFiles(query: string, limit = 60): Promise<string[]> {
  try {
    if ((await apiFlavor()) === "v2") {
      const result = await upstreamJson<Raw>(
        `/api/fs/find?query=${encodeURIComponent(query)}&type=file&limit=${limit}`,
      );
      return arr(result.data)
        .map((value) => str(raw(value).path))
        .filter(Boolean);
    }
    return await upstreamJson<string[]>(
      `/find/file?query=${encodeURIComponent(query)}&type=file&limit=${limit}`,
    );
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------------------- */
/* Mutations                                                                   */
/* -------------------------------------------------------------------------- */

type PromptBody = {
  messageID?: string;
  model?: { providerID: string; modelID: string };
  agent?: string;
  noReply?: boolean;
  system?: string;
  tools?: Record<string, boolean>;
  skills?: string[];
  parts: Array<Record<string, unknown>>;
};

async function applySessionSelection(
  id: string,
  body: { model?: { providerID: string; modelID: string }; agent?: string },
): Promise<void> {
  if (body.agent) {
    await upstreamFetch(`/api/session/${encodeURIComponent(id)}/agent`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agent: body.agent }),
    });
  }
  if (body.model) {
    await upstreamFetch(`/api/session/${encodeURIComponent(id)}/model`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: {
          providerID: body.model.providerID,
          id: body.model.modelID,
          variant: "default",
        },
      }),
    });
  }
}

export async function promptSession(id: string, body: PromptBody): Promise<void> {
  const flavor = await apiFlavor();
  if (flavor === "v2") {
    await applySessionSelection(id, body);
    const text = body.parts
      .filter((part) => part.type === "text")
      .map((part) => str(part.text))
      .join("\n\n");
    const files = body.parts
      .filter((part) => part.type === "file")
      .map((part) => ({ uri: str(part.url), name: str(part.filename) }))
      .filter((file) => file.uri);
    await upstreamJson<Raw>(`/api/session/${encodeURIComponent(id)}/prompt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...(body.messageID ? { id: body.messageID } : {}),
        text,
        ...(files.length ? { files } : {}),
        ...(body.skills?.length
          ? { skills: body.skills.map((id) => ({ id })) }
          : {}),
      }),
    });
    return;
  }
  await upstreamJson(`/session/${encodeURIComponent(id)}/prompt_async`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Inject extra context without asking the model for a reply.
 * v2 uses a synthetic message; v1 uses prompt_async with noReply.
 */
export async function addContext(
  id: string,
  text: string,
  description?: string,
): Promise<void> {
  if ((await apiFlavor()) === "v2") {
    await upstreamJson(`/api/session/${encodeURIComponent(id)}/synthetic`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text,
        ...(description ? { description } : {}),
      }),
    });
    return;
  }
  await promptSession(id, {
    noReply: true,
    parts: [{ type: "text", text }],
  });
}

export async function commandSession(
  id: string,
  body: { messageID?: string; command: string; arguments: string; agent?: string; model?: string },
): Promise<void> {
  const flavor = await apiFlavor();
  if (flavor === "v2") {
    if (body.agent) {
      await upstreamFetch(`/api/session/${encodeURIComponent(id)}/agent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agent: body.agent }),
      });
    }
    if (body.model?.includes("/")) {
      const [providerID, ...rest] = body.model.split("/");
      await applySessionSelection(id, {
        model: { providerID, modelID: rest.join("/") },
      });
    }
    await upstreamJson(`/api/session/${encodeURIComponent(id)}/command`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...(body.messageID ? { id: body.messageID } : {}),
        name: body.command,
        text: body.arguments,
      }),
    });
    return;
  }
  await upstreamJson(`/session/${encodeURIComponent(id)}/command`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
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
  const flavor = await apiFlavor();
  if (flavor === "v2") {
    await applySessionSelection(id, body);
    await upstreamJson(`/api/session/${encodeURIComponent(id)}/shell`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...(body.messageID ? { id: body.messageID } : {}),
        command: body.command,
      }),
    });
    return;
  }
  await upstreamJson(`/session/${encodeURIComponent(id)}/shell`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function abortSession(id: string): Promise<void> {
  if ((await apiFlavor()) === "v2") {
    await upstreamJson(`/api/session/${encodeURIComponent(id)}/interrupt`, {
      method: "POST",
    });
    return;
  }
  await upstreamJson(`/session/${encodeURIComponent(id)}/abort`, { method: "POST" });
}

export async function forkSession(id: string): Promise<Session> {
  if ((await apiFlavor()) === "v2") {
    const result = await upstreamJson<Raw>(`/api/session/${encodeURIComponent(id)}/fork`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    return toSession(result.data);
  }
  return upstreamJson<Session>(`/session/${encodeURIComponent(id)}/fork`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
}

export async function summarizeSession(
  id: string,
  model?: { providerID: string; modelID: string } | null,
): Promise<void> {
  if ((await apiFlavor()) === "v2") {
    await upstreamJson(`/api/session/${encodeURIComponent(id)}/compact`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    return;
  }
  await upstreamJson(`/session/${encodeURIComponent(id)}/summarize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(model ?? {}),
  });
}

export async function respondPermission(
  sessionID: string,
  permissionID: string,
  response: "once" | "always" | "reject",
): Promise<void> {
  if ((await apiFlavor()) === "v2") {
    await upstreamJson(
      `/api/session/${encodeURIComponent(sessionID)}/permission/${encodeURIComponent(permissionID)}/reply`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: response }),
      },
    );
    return;
  }
  await upstreamJson(
    `/session/${encodeURIComponent(sessionID)}/permissions/${encodeURIComponent(permissionID)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ response }),
    },
  );
}

function normalizeDirectory(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/\/+$/, "");
}

function looksWindowsPath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\");
}

/**
 * Resolve a folder using the path style of the target machine, not the web
 * server's host OS. The web app and OpenCode can run in different containers.
 */
function resolveDirectoryPath(requested: string, fallback?: string): string {
  const impl = looksWindowsPath(requested)
    ? path.win32
    : requested.startsWith("/")
      ? path.posix
      : fallback && looksWindowsPath(fallback)
        ? path.win32
        : path.posix;
  if (impl.isAbsolute(requested)) return impl.normalize(requested);
  if (!fallback) {
    throw new UpstreamError("Choose an absolute folder path.", 400);
  }
  return impl.normalize(impl.join(fallback, requested));
}

/**
 * Resolve a requested folder against OpenCode's default location and verify
 * that OpenCode can actually open it. OpenCode returns an opaque 500 for
 * relative or missing locations, so fail with a readable message instead.
 */
async function resolveSessionDirectory(
  directory: string | undefined,
  fallback: string | undefined,
): Promise<string | undefined> {
  const requested = directory?.trim();
  if (!requested) return undefined;
  const absolute = resolveDirectoryPath(requested, fallback?.trim());
  if (fallback && normalizeDirectory(absolute) === normalizeDirectory(fallback)) {
    return undefined;
  }
  try {
    await upstreamJson(`/api/fs/list?path=${encodeURIComponent(absolute)}`, {
      timeoutMs: 5_000,
    });
  } catch (error) {
    if (error instanceof UpstreamError) {
      throw new UpstreamError(
        `OpenCode cannot open this folder: ${absolute}`,
        400,
      );
    }
    throw error;
  }
  return absolute;
}

export async function createSession(
  title?: string,
  directory?: string,
): Promise<Session> {
  if ((await apiFlavor()) === "v2") {
    const body: Record<string, unknown> = {};
    if (directory?.trim()) {
      const fallback = (await getPathInfo())?.directory?.trim();
      const requested = await resolveSessionDirectory(directory, fallback);
      if (requested) body.location = { directory: requested };
    }
    const result = await upstreamJson<Raw>("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const created = toSession(result.data);
    const cleanTitle = title?.trim();
    if (cleanTitle) {
      try {
        return await updateSessionTitle(created.id, cleanTitle);
      } catch {
        // The session exists; a failed rename should not fail creation.
      }
    }
    return created;
  }
  return upstreamJson<Session>("/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(title ? { title } : {}),
  });
}

export async function updateSessionTitle(id: string, title: string): Promise<Session> {
  if ((await apiFlavor()) === "v2") {
    await upstreamJson(`/api/session/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    });
    return getSession(id);
  }
  return upstreamJson<Session>(`/session/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title }),
  });
}

export async function deleteSession(id: string): Promise<void> {
  const path =
    (await apiFlavor()) === "v2"
      ? `/api/session/${encodeURIComponent(id)}`
      : `/session/${encodeURIComponent(id)}`;
  await upstreamJson(path, { method: "DELETE" });
}

export {
  upstreamFetch,
  upstreamJson,
  apiFlavor,
  serverAuthHeader,
};
