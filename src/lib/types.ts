import type {
  Agent,
  AssistantMessage,
  Command,
  Config,
  Event,
  File,
  FileContent,
  FileDiff,
  FileNode,
  FilePart,
  Message,
  Part,
  Path,
  Permission,
  Session,
  SessionStatus,
  TextPart,
  Todo,
  ToolPart,
  ToolState,
  UserMessage,
} from "@opencode-ai/sdk";

export type {
  Agent,
  AssistantMessage,
  Command,
  Config,
  Event,
  File,
  FileContent,
  FileDiff,
  FileNode,
  FilePart,
  Message,
  Part,
  Path,
  Permission,
  Session,
  SessionStatus,
  TextPart,
  Todo,
  ToolPart,
  ToolState,
  UserMessage,
};

export type MessageWithParts = {
  info: Message;
  parts: Part[];
};

export type UiFileDiff = FileDiff & { patch?: string };

/** Agent skill exposed by the v2 API. */
export type Skill = {
  id: string;
  name: string;
  description?: string;
  autoinvoke?: boolean;
  path?: string;
  content?: string;
};

export type IntegrationConnection = {
  type: string;
  id?: string;
  label?: string;
  method?: string;
};

export type IntegrationPrompt = {
  type: "text" | "select" | string;
  key: string;
  title?: string;
  message?: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  default?: string;
  options?: Array<{ label: string; value: string; hint?: string }>;
  when?: { key: string; op: "eq" | "neq"; value: string };
};

export type IntegrationMethodInfo = {
  id?: string;
  type: "oauth" | "key" | "env" | "external" | string;
  label?: string;
  names?: string[];
  prompts?: IntegrationPrompt[];
  form?: IntegrationPrompt[];
};

export type ProviderIntegration = {
  id: string;
  name: string;
  methods: IntegrationMethodInfo[];
  connections: IntegrationConnection[];
};

export type IntegrationAttemptInfo = {
  attemptID: string;
  url: string;
  instructions: string;
  mode: "auto" | "code";
  expires?: number;
};

export type IntegrationAttemptStatus = {
  status: "pending" | "complete" | "failed" | "expired";
  message?: string;
};

export type OpenCodeIntegration = {
  id: string;
  name: string;
  connections: IntegrationConnection[];
  oauthMethodID: string | null;
};

export type OAuthAttempt = {
  attemptID: string;
  url: string;
  instructions: string;
  mode: "auto" | "code";
  expires?: number;
};

export type OAuthStatus = {
  status: "pending" | "complete" | "failed" | "expired";
  message?: string;
};

export type ModelOption = {
  providerID: string;
  providerName: string;
  modelID: string;
  name: string;
  connected: boolean;
  reasoning: boolean;
  attachment: boolean;
};

export type HealthInfo = {
  healthy: boolean;
  version: string;
};

export type HarnessId = "opencode";

export type SubagentStep = {
  id: string;
  kind: "text" | "tool" | "status";
  text?: string;
  tool?: string;
  status?: "running" | "completed" | "error";
  at: number;
};

export type SubagentPart = {
  id: string;
  sessionID: string;
  messageID: string;
  type: "subagent";
  callID: string;
  agent: string;
  description?: string;
  prompt?: string;
  input?: unknown;
  state: {
    status: "running" | "completed" | "error";
    output?: string;
    error?: string;
    time: { start: number; end?: number };
  };
  steps: SubagentStep[];
};

/** Aggregate usage reported by a session. */
export type SessionUsage = {
  cost?: number;
  tokens?: {
    input: number;
    output: number;
    reasoning: number;
    cache: { read: number; write: number };
  };
  model?: { id?: string; providerID?: string; modelID?: string };
};

/** A session returned for the unified ADE session list. */
export type SessionWithHarness = Session & SessionUsage & { harness: HarnessId };

export type ShellData = {
  sessions: Session[];
  pathInfo: Path | null;
  health: HealthInfo | null;
  models: ModelOption[];
  agents: Agent[];
  defaultModel: { providerID: string; modelID: string } | null;
  username: string;
};

export type ServerStatus = {
  mcp: Record<string, unknown>;
  lsp: unknown[];
  formatter: unknown[];
};

/* -------------------------------------------------------------------------- */
/* Session TODO tasks                                                          */
/* -------------------------------------------------------------------------- */

export type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled";
export type TaskPriority = "high" | "medium" | "low";

export type Task = {
  id: string; // "tsk_" + random base64url
  sessionID: string;
  /** Short task name shown in the list. */
  title: string;
  /** Definition/details of the task. */
  description: string;
  /** Prompt sent to the agent when the task is run. */
  prompt: string;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
};

export type TaskInput = {
  title: string;
  description?: string;
  prompt?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
};

/* -------------------------------------------------------------------------- */
/* Projects and GitHub links                                                   */
/* -------------------------------------------------------------------------- */

export type ProjectGithubLink = {
  repo: string; // "owner/name"
  url: string; // https://github.com/owner/name
  defaultBranch?: string;
  private?: boolean;
  description?: string;
  linkedAt: number;
};

export type Project = {
  id: string; // "prj_" + random base64url
  name: string;
  description?: string;
  directory: string; // absolute path inside the OpenCode/workspace environment
  context: string; // global project instructions, "" when empty
  github?: ProjectGithubLink;
  createdAt: number;
  updatedAt: number;
};

export type ProjectAgentsFile = {
  exists: boolean;
  content: string;
  etag: string; // sha256 prefix of the bytes, or "missing"
  path: string;
};

export type ProjectContextFile = {
  name: string;
  size: number;
  updatedAt: number;
  mime: string;
};

export type ProjectInput = {
  name: string;
  description?: string;
  directory: string;
  context?: string;
  github?: { repo: string } | null;
};

export type GithubStatus = {
  configured: boolean;
  connected: boolean;
  login?: string;
  avatarUrl?: string;
};

export type GithubRepo = {
  fullName: string;
  name: string;
  owner: string;
  htmlUrl: string;
  defaultBranch: string;
  private: boolean;
  description?: string;
  updatedAt?: string;
};
