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
