"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Bug,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  FlaskConical,
  GitPullRequest,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  PanelRight,
  Pencil,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAppData } from "@/components/app-data";
import { BrandMark } from "@/components/brand";
import { ContextPanel } from "@/components/chat/context-panel";
import { Composer, type ModelSelection, type OutgoingMessage } from "@/components/chat/composer";
import { Markdown } from "@/components/chat/markdown";
import { SubagentPartView } from "@/components/chat/subagent-part";
import { ToolCallPart } from "@/components/chat/tool-part";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiJson, jsonBody } from "@/lib/api";
import { derivePlanTasks } from "@/lib/plan-tasks";
import { buildTranscript } from "@/lib/transcript";
import type {
  Agent,
  Command,
  Event,
  FileDiff,
  FilePart,
  Message,
  MessageWithParts,
  ModelOption,
  Part,
  Session,
  Skill,
  SubagentPart,
  TextPart,
  Todo,
  UserMessage,
} from "@/lib/types";
const INITIAL_VISIBLE_MESSAGES = 50;
const MESSAGE_PAGE = 50;
const PENDING_CONTEXT_PREFIX = "oc.pendingContext.";

type PendingContext = {
  id: string;
  text: string;
  description: string;
};

function loadPendingContexts(sessionID: string): PendingContext[] {
  try {
    const raw = window.localStorage.getItem(PENDING_CONTEXT_PREFIX + sessionID);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Record<string, unknown> =>
        Boolean(item && typeof item === "object"),
      )
      .map((item) => ({
        id: typeof item.id === "string" ? item.id : randomId("ctx"),
        text: typeof item.text === "string" ? item.text : "",
        description:
          typeof item.description === "string" ? item.description : "",
      }))
      .filter((item) => item.text.trim().length > 0);
  } catch {
    return [];
  }
}

function savePendingContexts(sessionID: string, items: PendingContext[]): void {
  try {
    const key = PENDING_CONTEXT_PREFIX + sessionID;
    if (items.length > 0) {
      window.localStorage.setItem(key, JSON.stringify(items));
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // storage unavailable
  }
}

function randomId(prefix: string): string {
  const bytes =
    typeof crypto !== "undefined" && "getRandomValues" in crypto
      ? crypto.getRandomValues(new Uint8Array(12))
      : Uint8Array.from({ length: 12 }, () => Math.floor(Math.random() * 256));
  return `${prefix}_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function sortMessages(messages: MessageWithParts[]): MessageWithParts[] {
  return [...messages].sort((a, b) => a.info.time.created - b.info.time.created);
}

function upsertMessage(list: MessageWithParts[], info: Message): MessageWithParts[] {
  const index = list.findIndex((item) => item.info.id === info.id);
  if (index === -1) {
    return sortMessages([...list, { info, parts: [] }]);
  }
  const next = [...list];
  next[index] = { ...next[index], info };
  return next;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCost(cost: number): string {
  if (!Number.isFinite(cost) || cost <= 0) return "$0.00";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

function errorLabel(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const value = error as { name?: string; data?: { message?: string } };
  return value.data?.message ?? value.name ?? "Unknown error";
}

function eventSessionId(event: Event): string | undefined {
  const properties = event.properties as Record<string, unknown>;
  if (typeof properties.sessionID === "string") return properties.sessionID;
  if (typeof properties.sessionId === "string") return properties.sessionId as string;
  const part = properties.part as { sessionID?: string } | undefined;
  if (part?.sessionID) return part.sessionID;
  const info = properties.info as { sessionID?: string; id?: string } | undefined;
  if (info?.sessionID) return info.sessionID;
  if (event.type.startsWith("session.")) return info?.id;
  return undefined;
}

const ReasoningBlock = React.memo(function ReasoningBlock({
  text,
  duration,
}: {
  text: string;
  duration?: number;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="group/reasoning my-2 overflow-hidden rounded-lg border border-border/60 bg-muted/20"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
        <Sparkles className="size-3.5" />
        <span className="font-medium">Reasoning</span>
        {duration ? (
          <span className="font-mono text-[10px] text-muted-foreground/60">
            {(duration / 1000).toFixed(1)}s
          </span>
        ) : null}
        <ChevronRight className="ml-auto size-3 transition-transform group-open/reasoning:rotate-90" />
      </summary>
      {open ? (
        <div className="border-t border-border/50 px-3 py-2 text-[13px] text-muted-foreground">
          <div className="md">
            <Markdown text={text} highlight={false} />
          </div>
        </div>
      ) : null}
    </details>
  );
});

function FileAttachment({ part }: { part: FilePart }) {
  if (part.mime.startsWith("image/")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={part.url}
        alt={part.filename ?? "Attached image"}
        className="my-2 max-h-72 rounded-lg border border-border object-contain"
      />
    );
  }
  return (
    <a
      href={part.url}
      download={part.filename}
      className="my-1 inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs hover:bg-muted"
    >
      {part.filename ?? part.mime}
    </a>
  );
}

const AssistantPart = React.memo(function AssistantPart({
  part,
  streaming,
}: {
  part: Part;
  streaming: boolean;
}) {
  if ((part as { type: string }).type === "subagent") {
    return <SubagentPartView part={part as unknown as SubagentPart} />;
  }
  switch (part.type) {
    case "text":
      if (!part.text.trim()) return null;
      if (streaming) {
        return (
          <div className="relative whitespace-pre-wrap break-words text-[14px] leading-relaxed">
            {part.text}
            <span className="ml-0.5 inline-block h-4 w-[3px] translate-y-0.5 animate-pulse rounded-full bg-foreground/70 align-middle" />
          </div>
        );
      }
      return (
        <div className="relative">
          <Markdown text={part.text} />
        </div>
      );
    case "reasoning": {
      const duration = part.time?.end ? part.time.end - part.time.start : undefined;
      return <ReasoningBlock text={part.text} duration={duration} />;
    }
    case "tool":
      return <ToolCallPart part={part} />;
    case "file":
      return <FileAttachment part={part} />;
    case "subtask":
      return (
        <div className="my-2 rounded-lg border border-info/25 bg-info/5 p-3">
          <div className="flex items-center gap-2 text-[11px] font-medium text-info dark:text-info">
            <Sparkles className="size-3.5" /> Subtask · {part.agent}
          </div>
          <div className="mt-1 text-sm">{part.description}</div>
          <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{part.prompt}</p>
        </div>
      );
    case "retry":
      return (
        <div className="my-2 flex items-center gap-2 rounded-lg border border-warning/25 bg-warning/5 px-3 py-2 text-xs text-warning dark:text-warning">
          <Loader2 className="size-3.5 animate-spin" />
          Retrying (attempt {part.attempt})…
        </div>
      );
    case "compaction":
      return (
        <div className="my-3 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          {part.auto ? "Context compacted automatically" : "Context compacted"}
          <span className="h-px flex-1 bg-border" />
        </div>
      );
    case "patch":
      return (
        <div className="my-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <GitPullRequest className="size-3.5" />
          {part.files.length} file{part.files.length === 1 ? "" : "s"} changed
          {part.files.slice(0, 3).map((file) => (
            <span
              key={file}
              className="max-w-48 truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]"
            >
              {file}
            </span>
          ))}
        </div>
      );
    default:
      return null;
  }
});

const UserMessageView = React.memo(function UserMessageView({
  message,
}: {
  message: MessageWithParts;
}) {
  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="max-w-[88%] rounded-2xl rounded-br-lg border border-border/70 bg-card/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        {message.parts.map((part) => {
          if (part.type === "text") {
            return (
              <div
                key={part.id}
                className="whitespace-pre-wrap break-words text-[14px] leading-relaxed"
              >
                {part.text}
              </div>
            );
          }
          if (part.type === "file") return <FileAttachment key={part.id} part={part} />;
          if (part.type === "agent") {
            return (
              <span
                key={part.id}
                className="mt-1 inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground"
              >
                @{part.name}
              </span>
            );
          }
          return null;
        })}
      </div>
      <div className="flex items-center gap-2 pr-1 font-mono text-[10px] text-muted-foreground/75">
        {message.info.role === "user" && message.info.agent ? (
          <span>{message.info.agent}</span>
        ) : null}
        <span suppressHydrationWarning>
          {formatTime(message.info.time.created)}
        </span>
      </div>
    </div>
  );
});

const ContextMessageView = React.memo(function ContextMessageView({
  message,
}: {
  message: MessageWithParts;
}) {
  const textPart = message.parts.find((part) => part.type === "text");
  const description =
    textPart?.type === "text" && typeof textPart.metadata?.contextDescription === "string"
      ? textPart.metadata.contextDescription
      : undefined;
  const text = textPart?.type === "text" ? textPart.text : "";
  const collapsible =
    text.length > 280 || Boolean(description?.trim().startsWith("Context from "));
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="flex gap-3">
      <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border border-success/25 bg-success/8 text-success dark:text-success">
        <BookOpen className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1 rounded-xl border border-dashed border-success/30 bg-success/4 px-3.5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-success dark:text-success">
            <Check className="size-2.5" />
            Context loaded
          </span>
          {description ? (
            <span className="text-[11px] font-medium text-muted-foreground">
              {description}
            </span>
          ) : null}
          {collapsible ? (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="ml-auto inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/70 transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              {expanded ? (
                <ChevronUp className="size-3" />
              ) : (
                <ChevronDown className="size-3" />
              )}
              {expanded ? "Hide" : "Show"} · {text.length.toLocaleString("en-US")} chars
            </button>
          ) : null}
        </div>
        {!collapsible || expanded ? (
          <div className="mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed">
            {text}
          </div>
        ) : null}
        <div className="mt-1.5 font-mono text-[10px] text-muted-foreground/50">
          <span suppressHydrationWarning>{formatTime(message.info.time.created)}</span> ·
          not sent as a prompt
        </div>
      </div>
    </div>
  );
});

const AssistantMessageView = React.memo(function AssistantMessageView({
  message,
  streaming,
  harnessLabel,
}: {
  message: MessageWithParts;
  streaming: boolean;
  harnessLabel: string;
}) {
  if (message.info.role !== "assistant") return null;
  const info = message.info;
  const duration = info.time.completed ? info.time.completed - info.time.created : undefined;
  const error = errorLabel(info.error);
  let lastTextIndex: number | undefined;
  for (let index = message.parts.length - 1; index >= 0; index--) {
    if (message.parts[index].type === "text") {
      lastTextIndex = index;
      break;
    }
  }

  return (
    <div className="flex gap-3">
      <BrandMark className="mt-0.5 size-7 rounded-lg" />
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-[13px] font-semibold tracking-tight">{harnessLabel}</span>
          <span className="font-mono text-[10px] text-muted-foreground/60">
            {info.modelID}
          </span>
          {streaming ? (
            <span className="flex items-center gap-1 rounded-full bg-info/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-info dark:text-info">
              <Loader2 className="size-2.5 animate-spin" /> live
            </span>
          ) : null}
        </div>

        <div className="space-y-2">
          {message.parts.map((part, index) => (
            <AssistantPart
              key={part.id}
              part={part}
              streaming={streaming && index === lastTextIndex}
            />
          ))}
        </div>

        {error ? (
          <div className="mt-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-3 font-mono text-[10px] text-muted-foreground/75">
          <span suppressHydrationWarning>{formatTime(info.time.created)}</span>
          {duration ? <span>{(duration / 1000).toFixed(1)}s</span> : null}
          {info.cost > 0 ? <span>{formatCost(info.cost)}</span> : null}
          {info.tokens.input + info.tokens.output > 0 ? (
            <span>
              {info.tokens.input.toLocaleString()} in /{" "}
              {info.tokens.output.toLocaleString()} out
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
});

const suggestions = [
  {
    icon: Sparkles,
    title: "Explore this codebase",
    prompt: "Give me a tour of this codebase. What does it do, how is it structured, and where should I start?",
  },
  {
    icon: Bug,
    title: "Find and fix a bug",
    prompt: "Look for the most likely bug in the current uncommitted changes, explain it, and fix it.",
  },
  {
    icon: FlaskConical,
    title: "Write tests",
    prompt: "Identify the most important untested behavior in this project and write focused tests for it.",
  },
  {
    icon: GitPullRequest,
    title: "Review changes",
    prompt: "Review the uncommitted changes like a senior engineer. Point out correctness, security and performance issues.",
  },
];

export function ChatView({
  initialSession,
  initialMessages,
  initialTodos,
  initialDiff,
  commands,
  models,
  defaultModel,
  agents,
  skills,
  harnessLabel,
  backendSessionID,
  hasRepo,
  initialDraft = "",
}: {
  initialSession: Session;
  initialMessages: MessageWithParts[];
  initialTodos: Todo[];
  initialDiff: FileDiff[];
  commands: Command[];
  models: ModelOption[];
  defaultModel: ModelSelection | null;
  agents: Agent[];
  skills: Skill[];
  harnessLabel: string;
  backendSessionID: string;
  hasRepo: boolean;
  initialDraft?: string;
}) {
  const router = useRouter();
  const {
    statuses,
    sessions,
    pathInfo,
    subscribe,
    renameSession,
    deleteSession,
  } = useAppData();

  const [session, setSession] = React.useState(initialSession);
  const [messages, setMessages] = React.useState(() =>
    sortMessages(initialMessages),
  );
  const [todos, setTodos] = React.useState(initialTodos);
  const planTasks = React.useMemo(() => derivePlanTasks(messages), [messages]);
  const tasks = todos.length > 0 ? todos : planTasks;
  const [diff, setDiff] = React.useState(initialDiff);
  const [draft, setDraft] = React.useState(initialDraft);
  const [working, setWorking] = React.useState(false);
  const [contextOpen, setContextOpen] = React.useState(false);
  const [showContextDesktop, setShowContextDesktop] = React.useState(true);
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [contextDialogOpen, setContextDialogOpen] = React.useState(false);
  const [contextText, setContextText] = React.useState("");
  const [contextDescription, setContextDescription] = React.useState("");
  const [contextSessionId, setContextSessionId] = React.useState("");
  const [contextLoading, setContextLoading] = React.useState(false);
  const [importedContext, setImportedContext] = React.useState<{
    sessionId: string;
    title: string;
    text: string;
  } | null>(null);
  const [contextPreviewOpen, setContextPreviewOpen] = React.useState(false);
  const [pendingContexts, setPendingContexts] = React.useState<PendingContext[]>([]);
  const [titleDraft, setTitleDraft] = React.useState(initialSession.title);
  const [atBottom, setAtBottom] = React.useState(true);
  const [visibleCount, setVisibleCount] = React.useState(
    INITIAL_VISIBLE_MESSAGES,
  );

  const [model, setModel] = React.useState<ModelSelection | null>(defaultModel);
  const [agent, setAgent] = React.useState(
    agents.find((item) => item.name === "build")?.name ??
      agents.find((item) => item.mode !== "subagent")?.name ??
      "",
  );

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const atBottomRef = React.useRef(true);
  const refreshTimer = React.useRef<number | null>(null);
  const pendingParts = React.useRef(new Map<string, Part>());
  const pendingInfos = React.useRef(new Map<string, Message>());
  const flushTimer = React.useRef<number | null>(null);
  const earlierScrollHeight = React.useRef<number | null>(null);
  const restoredModel = React.useRef(false);

  const status =
    statuses[backendSessionID] ??
    statuses[session.id] ?? { type: "idle" as const };
  const busy = status.type === "busy" || status.type === "retry" || working;
  const streamingMessageId = React.useMemo(() => {
    if (!busy) return undefined;
    for (let index = messages.length - 1; index >= 0; index--) {
      if (messages[index].info.role === "assistant") {
        return messages[index].info.id;
      }
    }
    return undefined;
  }, [busy, messages]);

  const totals = React.useMemo(() => {
    let cost = 0;
    let input = 0;
    let output = 0;
    for (const message of messages) {
      if (message.info.role !== "assistant") continue;
      cost += message.info.cost;
      input += message.info.tokens.input;
      output += message.info.tokens.output;
    }
    return { cost, input, output };
  }, [messages]);

  const importableSessions = React.useMemo(
    () => sessions.filter((item) => item.id !== session.id),
    [sessions, session.id],
  );

  React.useEffect(() => {
    // Restore once per session. Persisting every render would overwrite the
    // user's per-session choice with the server/default model.
    if (restoredModel.current || models.length === 0) return;
    restoredModel.current = true;
    queueMicrotask(() => {
      try {
        const saved =
          window.localStorage.getItem(`oc.model.${session.id}`) ??
          window.localStorage.getItem("oc.defaultModel");
        if (saved) {
          const parsed = JSON.parse(saved) as ModelSelection;
          if (
            models.some(
              (item) =>
                item.providerID === parsed.providerID && item.modelID === parsed.modelID,
            )
          ) {
            setModel(parsed);
          }
        }
      } catch {
        // ignore malformed storage
      }
    });
  }, [models, session.id]);

  React.useEffect(() => {
    queueMicrotask(() => {
      try {
        const saved = window.localStorage.getItem("oc.agent");
        if (saved && agents.some((item) => item.name === saved)) setAgent(saved);
      } catch {
        // ignore malformed storage
      }
    });
  }, [agents]);

  React.useEffect(() => {
    queueMicrotask(() => setPendingContexts(loadPendingContexts(session.id)));
  }, [session.id]);

  React.useEffect(() => {
    if (agent) window.localStorage.setItem("oc.agent", agent);
  }, [agent]);

  const optimisticIds = React.useRef(new Set<string>());

  const refreshMessages = React.useCallback(async () => {
    try {
      const next = await apiJson<MessageWithParts[]>(
        `/sessions/${encodeURIComponent(session.id)}/messages`,
      );
      const server = sortMessages(next);
      setMessages((current) => {
        const serverIds = new Set(server.map((message) => message.info.id));
        for (const id of serverIds) optimisticIds.current.delete(id);
        // Keep messages the server no longer returns (for example after context
        // compaction) so the visible log does not disappear mid-session.
        const archived = current.filter(
          (message) =>
            !serverIds.has(message.info.id) &&
            !optimisticIds.current.has(message.info.id),
        );
        const stillPending = current.filter(
          (message) =>
            optimisticIds.current.has(message.info.id) &&
            !serverIds.has(message.info.id),
        );
        return sortMessages([...archived, ...server, ...stillPending]);
      });
    } catch {
      // transient; SSE will keep the view fresh
    }
  }, [session.id]);

  const scheduleRefresh = React.useCallback(() => {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => {
      void refreshMessages();
    }, 600);
  }, [refreshMessages]);

  /** Coalesce token/progress events so streaming updates at most ~20fps. */
  const flushPending = React.useCallback(() => {
    if (flushTimer.current !== null) {
      window.clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
    const parts = pendingParts.current;
    const infos = pendingInfos.current;
    if (parts.size === 0 && infos.size === 0) return;
    pendingParts.current = new Map();
    pendingInfos.current = new Map();

    setMessages((current) => {
      let next = current;
      let needsRefresh = false;

      for (const info of infos.values()) {
        const index = next.findIndex((item) => item.info.id === info.id);
        if (index === -1) {
          next = upsertMessage(next, info);
          continue;
        }
        const copy = [...next];
        copy[index] = { ...copy[index], info };
        next = copy;
      }

      for (const part of parts.values()) {
        const index = next.findIndex((item) => item.info.id === part.messageID);
        if (index === -1) {
          needsRefresh = true;
          continue;
        }
        const message = next[index];
        const partIndex = message.parts.findIndex((item) => item.id === part.id);
        const nextParts = [...message.parts];
        if (partIndex === -1) nextParts.push(part);
        else nextParts[partIndex] = part;
        const copy = [...next];
        copy[index] = { ...message, parts: nextParts };
        next = copy;
      }

      if (needsRefresh) scheduleRefresh();
      return next;
    });
  }, [scheduleRefresh]);

  const queueFlush = React.useCallback(() => {
    if (flushTimer.current !== null) return;
    flushTimer.current = window.setTimeout(flushPending, 50);
  }, [flushPending]);

  React.useEffect(() => {
    return () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      if (flushTimer.current !== null) window.clearTimeout(flushTimer.current);
    };
  }, []);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    atBottomRef.current = true;
    setAtBottom(true);
  }, [session.id]);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (atBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, todos]);

  function showEarlier() {
    const el = scrollRef.current;
    earlierScrollHeight.current = el?.scrollHeight ?? null;
    setVisibleCount((count) => count + MESSAGE_PAGE);
  }

  React.useLayoutEffect(() => {
    if (earlierScrollHeight.current === null) return;
    const el = scrollRef.current;
    if (el) {
      el.scrollTop += el.scrollHeight - earlierScrollHeight.current;
    }
    earlierScrollHeight.current = null;
  }, [visibleCount]);

  React.useEffect(
    () =>
      subscribe((event) => {
        const id = eventSessionId(event);
        if (
          event.type !== "server.connected" &&
          id &&
          id !== session.id &&
          id !== backendSessionID
        ) {
          return;
        }

        if ((event as { type: string }).type === "session.synthetic") {
          scheduleRefresh();
          return;
        }

        switch (event.type) {
          case "server.connected":
            // Catch up on anything missed while the SSE connection was down.
            scheduleRefresh();
            break;
          case "message.updated":
            pendingInfos.current.set(
              event.properties.info.id,
              event.properties.info,
            );
            queueFlush();
            break;
          case "message.removed": {
            const messageID = event.properties.messageID;
            pendingInfos.current.delete(messageID);
            for (const [partID, part] of pendingParts.current) {
              if (part.messageID === messageID) pendingParts.current.delete(partID);
            }
            setMessages((current) =>
              current.filter((item) => item.info.id !== messageID),
            );
            break;
          }
          case "message.part.updated": {
            const part = event.properties.part;
            pendingParts.current.set(part.id, part);
            queueFlush();
            break;
          }
          case "message.part.removed": {
            const partID = event.properties.partID;
            pendingParts.current.delete(partID);
            setMessages((current) =>
              current.map((item) =>
                item.info.id === event.properties.messageID
                  ? {
                      ...item,
                      parts: item.parts.filter(
                        (part) => part.id !== partID,
                      ),
                    }
                  : item,
              ),
            );
            break;
          }
          case "session.updated": {
            const info = event.properties.info;
            setSession(info);
            setTitleDraft(info.title);
            break;
          }
          case "session.deleted":
            if (
              event.properties.info.id === session.id ||
              event.properties.info.id === backendSessionID
            ) {
              router.push("/chat");
            }
            break;
          case "session.status":
            if (event.properties.status.type === "idle") {
              flushPending();
              setWorking(false);
            }
            break;
          case "session.idle":
            flushPending();
            setWorking(false);
            scheduleRefresh();
            break;
          case "session.compacted":
            scheduleRefresh();
            break;
          case "todo.updated":
            setTodos(event.properties.todos);
            break;
          case "session.diff":
            setDiff(event.properties.diff);
            break;
          default:
            break;
        }
      }),
    [subscribe, session.id, backendSessionID, router, scheduleRefresh, flushPending, queueFlush],
  );

  React.useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [scheduleRefresh]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    atBottomRef.current = nearBottom;
    setAtBottom(nearBottom);
  }

  const handleModelChange = React.useCallback(
    (next: ModelSelection) => {
      setModel(next);
      try {
        window.localStorage.setItem(
          `oc.model.${session.id}`,
          JSON.stringify(next),
        );
      } catch {
        // ignore storage failures
      }
    },
    [session.id],
  );

  const handleSend = React.useCallback(
    async ({
      text,
      attachments,
      skills: skillIds,
      agent: agentOverride,
    }: OutgoingMessage) => {
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;

    // Context loaded from another chat is only sent when the user actually
    // sends their next prompt, never when the tag is created.
    if (pendingContexts.length > 0) {
      let sent = 0;
      try {
        for (const item of pendingContexts) {
          await apiJson(`/sessions/${encodeURIComponent(session.id)}/context`, {
            method: "POST",
            ...jsonBody({
              text: item.text,
              ...(item.description ? { description: item.description } : {}),
            }),
          });
          sent += 1;
        }
      } catch (error) {
        throw new Error(
          `Could not send queued context: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        );
      } finally {
        if (sent > 0) {
          const remaining = pendingContexts.slice(sent);
          setPendingContexts(remaining);
          savePendingContexts(session.id, remaining);
        }
      }
    }

    const messageID = randomId("msg");
    const shell = trimmed.startsWith("!") && trimmed.length > 1;
    const commandMatch = /^\/([\w-]+)(?:\s+([\s\S]*))?$/.exec(trimmed);
    const command =
      commandMatch && !shell
        ? commands.find((item) => item.name === commandMatch[1])
        : undefined;
    const effectiveModel = model;
    const effectiveAgent = agentOverride ?? (agent || agents[0]?.name || "build");

    const optimisticParts: Part[] = [];
    if (trimmed) {
      optimisticParts.push({
        id: randomId("prt"),
        sessionID: session.id,
        messageID,
        type: "text",
        text: trimmed,
      } satisfies TextPart);
    }
    for (const attachment of attachments) {
      optimisticParts.push({
        id: randomId("prt"),
        sessionID: session.id,
        messageID,
        type: "file",
        mime: attachment.mime,
        filename: attachment.filename,
        url: attachment.url,
      } satisfies FilePart);
    }

    const optimisticInfo: UserMessage = {
      id: messageID,
      sessionID: session.id,
      role: "user",
      time: { created: Date.now() },
      agent: effectiveAgent,
      model: effectiveModel ?? { providerID: "", modelID: "" },
    };

    optimisticIds.current.add(messageID);
    setMessages((current) => [
      ...current,
      { info: optimisticInfo, parts: optimisticParts },
    ]);
    setWorking(true);
    atBottomRef.current = true;
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });

    try {
      if (shell) {
        await apiJson(`/sessions/${encodeURIComponent(session.id)}/shell`, {
          method: "POST",
          ...jsonBody({
            messageID,
            agent: effectiveAgent,
            ...(effectiveModel ? { model: effectiveModel } : {}),
            command: trimmed.slice(1).trim(),
          }),
        });
      } else if (command) {
        await apiJson(`/sessions/${encodeURIComponent(session.id)}/command`, {
          method: "POST",
          ...jsonBody({
            messageID,
            command: command.name,
            arguments: (commandMatch?.[2] ?? "").trim(),
            agent: effectiveAgent,
            ...(effectiveModel
              ? { model: `${effectiveModel.providerID}/${effectiveModel.modelID}` }
              : {}),
          }),
        });
      } else {
        const parts: Array<{
          type: "text";
          text: string;
        } | {
          type: "file";
          mime: string;
          filename: string;
          url: string;
        }> = [];
        if (trimmed) parts.push({ type: "text", text: trimmed });
        for (const attachment of attachments) {
          parts.push({
            type: "file",
            mime: attachment.mime,
            filename: attachment.filename,
            url: attachment.url,
          });
        }
        await apiJson(`/sessions/${encodeURIComponent(session.id)}/prompt`, {
          method: "POST",
          ...jsonBody({
            messageID,
            agent: effectiveAgent,
            ...(effectiveModel ? { model: effectiveModel } : {}),
            ...(skillIds.length ? { skills: skillIds } : {}),
            parts,
          }),
        });
      }
      scheduleRefresh();
    } catch (error) {
      optimisticIds.current.delete(messageID);
      setMessages((current) =>
        current.filter((item) => item.info.id !== messageID),
      );
      setWorking(false);
      throw error;
    }
    },
    [agents, agent, commands, model, pendingContexts, scheduleRefresh, session.id],
  );

  const handleAbort = React.useCallback(async () => {
    await apiJson(`/sessions/${encodeURIComponent(session.id)}/abort`, {
      method: "POST",
    });
    setWorking(false);
    toast.success("Stopped");
  }, [session.id]);

  const openContextDialog = React.useCallback(() => {
    setContextDialogOpen(true);
  }, []);

  const buildAgent = React.useMemo(
    () =>
      agents.find((item) => item.name === "build")?.name ??
      agents.find((item) => item.mode !== "subagent" && item.name !== "plan")
        ?.name ??
      "build",
    [agents],
  );

  const handleRunTask = React.useCallback(
    (todo: Todo) => {
      if (busy) {
        toast.error("Wait for the current turn to finish");
        return;
      }
      setAgent(buildAgent);
      void handleSend({
        text: `Execute this planned task:\n\n${todo.content}\n\nWork only on this task and report what you changed.`,
        attachments: [],
        skills: [],
        agent: buildAgent,
      }).catch((error: unknown) => {
        toast.error("Could not start the task", {
          description: error instanceof Error ? error.message : undefined,
        });
      });
    },
    [busy, buildAgent, handleSend],
  );

  const handleResolveConflicts = React.useCallback(() => {
    if (busy) {
      toast.error("Wait for the current turn to finish");
      return;
    }
    void handleSend({
      text:
        "Resolve any git merge conflicts in this workspace. Start with `git status` and `git diff --name-only --diff-filter=U`, inspect each conflicted file, resolve the conflicts, stage the resolved files, and summarize the result. Do not discard unrelated changes.",
      attachments: [],
      skills: [],
    }).catch((error: unknown) => {
      toast.error("Could not start conflict resolution", {
        description: error instanceof Error ? error.message : undefined,
      });
    });
  }, [busy, handleSend]);

  function handleAddContext() {
    const manualText = contextText.trim();
    const importedText = importedContext?.text.trim() ?? "";
    const text = [importedText, manualText].filter(Boolean).join("\n\n");
    if (!text) return;
    const description =
      contextDescription.trim() ||
      (importedContext ? `Context from ${importedContext.title}` : "");
    const next = [
      ...pendingContexts,
      { id: randomId("ctx"), text, description },
    ];
    setPendingContexts(next);
    savePendingContexts(session.id, next);
    setContextDialogOpen(false);
    setContextText("");
    setContextDescription("");
    setContextSessionId("");
    setImportedContext(null);
    setContextPreviewOpen(false);
    toast.success("Context queued for your next message");
  }

  function removePendingContext(id: string) {
    const next = pendingContexts.filter((item) => item.id !== id);
    setPendingContexts(next);
    savePendingContexts(session.id, next);
  }

  function clearImportedContext() {
    setImportedContext(null);
    setContextPreviewOpen(false);
    setContextSessionId("");
    setContextDescription((current) =>
      current.trim().startsWith("Context from ") ? "" : current,
    );
  }

  function handleContextDialogOpenChange(open: boolean) {
    setContextDialogOpen(open);
    if (open) return;
    setImportedContext(null);
    setContextPreviewOpen(false);
    setContextSessionId("");
    setContextDescription((current) =>
      current.trim().startsWith("Context from ") ? "" : current,
    );
  }

  async function importChatAsContext(id: string) {
    if (!id || contextLoading || id === session.id) return;
    setContextSessionId(id);
    setContextLoading(true);
    try {
      const history = await apiJson<MessageWithParts[]>(
        `/sessions/${encodeURIComponent(id)}/messages`,
      );
      const transcript = buildTranscript(history, {
        maxMessages: 30,
        maxChars: 20_000,
      });
      if (!transcript.trim()) {
        toast.error("That chat has no text to import yet");
        setContextSessionId(importedContext?.sessionId ?? "");
        return;
      }
      const source = sessions.find((item) => item.id === id);
      const title = source?.title?.trim() || "another chat";
      setImportedContext({ sessionId: id, title, text: transcript });
      setContextPreviewOpen(false);
      setContextDescription((current) => {
        const trimmed = current.trim();
        return !trimmed || trimmed.startsWith("Context from ")
          ? `Context from ${title}`
          : current;
      });
      toast.success("Chat loaded as context");
    } catch (error) {
      toast.error("Could not import that chat", {
        description: error instanceof Error ? error.message : undefined,
      });
      setContextSessionId(importedContext?.sessionId ?? "");
    } finally {
      setContextLoading(false);
    }
  }

  async function handleFork() {
    try {
      const forked = await apiJson<Session>(
        `/sessions/${encodeURIComponent(session.id)}/fork`,
        { method: "POST", ...jsonBody({}) },
      );
      toast.success("Session forked");
      router.push(`/chat/${forked.id}`);
    } catch (error) {
      toast.error("Could not fork session", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  async function handleSummarize() {
    if (!model) {
      toast.error("Select a model first");
      return;
    }
    try {
      await apiJson(`/sessions/${encodeURIComponent(session.id)}/summarize`, {
        method: "POST",
        ...jsonBody({ model }),
      });
      toast.success("Summarizing session…");
    } catch (error) {
      toast.error("Could not summarize", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  const showEmpty = messages.length === 0;
  const visibleMessages =
    messages.length > visibleCount ? messages.slice(-visibleCount) : messages;
  const hiddenCount = messages.length - visibleMessages.length;

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="glass-bar flex h-14 shrink-0 items-center gap-3 border-b px-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => {
                setTitleDraft(session.title);
                setRenameOpen(true);
              }}
              className="group flex max-w-full items-center gap-1.5 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title="Rename session"
            >
              <h1 className="truncate text-sm font-semibold tracking-tight">
                {session.title || "Untitled session"}
              </h1>
              <Pencil className="size-3 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/60" />
            </button>
            <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-muted-foreground/75">
              <span className="hidden sm:inline">{session.id}</span>
              {totals.cost > 0 ? <span>{formatCost(totals.cost)}</span> : null}
              {diff.length > 0 ? (
                <span>
                  {diff.length} file{diff.length === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>
          </div>

          {status.type === "retry" ? (
            <span className="hidden items-center gap-1.5 rounded-full border border-warning/25 bg-warning/8 px-2.5 py-1 text-[11px] text-warning sm:flex dark:text-warning">
              <Loader2 className="size-3 animate-spin" />
              Retry {status.attempt}
            </span>
          ) : busy ? (
            <span className="hidden items-center gap-1.5 rounded-full border border-info/20 bg-info/8 px-2.5 py-1 text-[11px] text-info sm:flex dark:text-info">
              <span className="size-1.5 rounded-full bg-info pulse-dot" />
              Working
            </span>
          ) : null}

          <Button
            variant="ghost"
            size="icon-sm"
            className="hidden xl:inline-flex"
            onClick={() => setShowContextDesktop((value) => !value)}
            aria-label="Toggle context panel"
          >
            <PanelRight className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="xl:hidden"
            onClick={() => setContextOpen(true)}
            aria-label="Open context panel"
          >
            <PanelRight className="size-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Session actions">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={() => setContextDialogOpen(true)}>
                <BookOpen className="size-4" /> Add context
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  void navigator.clipboard
                    .writeText(session.id)
                    .then(() => toast.success("Session ID copied"));
                }}
              >
                <Copy className="size-4" /> Copy session ID
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleFork()}>
                <GitPullRequest className="size-4" /> Fork session
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleSummarize()}>
                <Wand2 className="size-4" /> Summarize
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setDeleteOpen(true)}
              >
                <Trash2 className="size-4" /> Delete session
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="relative min-h-0 flex-1">
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="scrollbar-thin h-full overflow-y-auto"
          >
            <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
              {showEmpty ? (
                <div className="animate-fade flex min-h-[calc(100dvh-19rem)] flex-col justify-center py-10">
                  <div className="mb-6 flex items-center gap-3">
                    <BrandMark className="size-10 rounded-xl" />
                    <div>
                      <h2 className="text-lg font-semibold tracking-tight">
                        What should we build?
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        {session.directory || pathInfo?.directory || "Workspace"} · new session
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion.title}
                        type="button"
                        onClick={() => setDraft(suggestion.prompt)}
                        className="group flex items-start gap-3 rounded-xl border border-border/60 bg-card/45 p-3.5 text-left transition-[background-color,border-color,transform] hover:-translate-y-px hover:border-brand/30 hover:bg-card/70"
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-[8px] border border-border/60 bg-muted/40 text-muted-foreground transition-colors group-hover:border-brand/20 group-hover:bg-brand/10 group-hover:text-brand">
                          <suggestion.icon className="size-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-medium">
                            {suggestion.title}
                          </span>
                          <span className="mt-0.5 line-clamp-2 block text-[11px] leading-relaxed text-muted-foreground">
                            {suggestion.prompt}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-6 text-center text-[11px] text-muted-foreground/60">
                    Tip: use <span className="font-mono">/</span> for commands and{" "}
                    <span className="font-mono">!</span> to run a shell command.
                  </p>
                </div>
              ) : (
                <div className="space-y-7">
                  {hiddenCount > 0 ? (
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <Button variant="outline" size="sm" onClick={showEarlier}>
                        <ChevronUp className="size-3.5" />
                        Show {Math.min(hiddenCount, MESSAGE_PAGE)} earlier
                        <span className="font-mono text-[10px] text-muted-foreground/60">
                          {hiddenCount} hidden
                        </span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setVisibleCount(messages.length)}
                      >
                        Show full log
                      </Button>
                    </div>
                  ) : null}
                  {visibleMessages.map((message) => (
                    <div key={message.info.id} className="chat-message">
                      {message.info.role === "user" ? (
                        message.info.agent === "context" ? (
                          <ContextMessageView message={message} />
                        ) : (
                          <UserMessageView message={message} />
                        )
                      ) : (
                        <AssistantMessageView
                          message={message}
                          streaming={message.info.id === streamingMessageId}
                          harnessLabel={harnessLabel}
                        />
                      )}
                    </div>
                  ))}
                  {busy ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="flex gap-1">
                        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:-0.2s]" />
                        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:-0.1s]" />
                        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50" />
                      </span>
                      {harnessLabel} is working
                    </div>
                  ) : null}
                  <div className="h-2" />
                </div>
              )}
            </div>
          </div>

          {!atBottom ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
              <Button
                variant="secondary"
                size="sm"
                className="pointer-events-auto gap-1.5 rounded-[10px] border-border/70"
                onClick={() => {
                  const el = scrollRef.current;
                  if (!el) return;
                  el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
                  atBottomRef.current = true;
                  setAtBottom(true);
                }}
              >
                Jump to latest
                <ChevronRight className="size-3 rotate-90" />
              </Button>
            </div>
          ) : null}
        </div>

        {pendingContexts.length > 0 ? (
          <div className="shrink-0 bg-muted/20 px-3 py-2 sm:px-5">
            <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-2">
              {pendingContexts.map((item) => (
                <span
                  key={item.id}
                  className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-[10px] text-success dark:text-success"
                >
                  <Check className="size-3 shrink-0" />
                  <span className="font-mono text-[9px] font-medium uppercase tracking-[0.12em]">
                    Context loaded
                  </span>
                  {item.description ? (
                    <span
                      className="max-w-[220px] truncate text-foreground/80"
                      title={item.description}
                    >
                      {item.description}
                    </span>
                  ) : null}
                  <span className="font-mono text-muted-foreground/60">
                    {item.text.length.toLocaleString("en-US")} chars
                  </span>
                  <button
                    type="button"
                    onClick={() => removePendingContext(item.id)}
                    aria-label="Remove queued context"
                    className="rounded-full p-0.5 transition-colors hover:bg-success/20"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground/50">
                Sent with next message
              </span>
            </div>
          </div>
        ) : null}

        <Composer
          models={models}
          agents={agents}
          skills={skills}
          commands={commands}
          model={model}
          agent={agent}
          draft={draft}
          busy={busy}
          onModelChange={handleModelChange}
          onAgentChange={setAgent}
          onDraftChange={setDraft}
          onSend={handleSend}
          onAbort={handleAbort}
          onAddContext={openContextDialog}
          harnessLabel={harnessLabel}
        />
      </div>

      {showContextDesktop ? (
        <aside className="hidden w-[320px] shrink-0 border-l border-border/60 bg-muted/15 xl:block">
          <ContextPanel
            todos={tasks}
            diff={diff}
            hasRepo={hasRepo}
            onRunTask={handleRunTask}
            onResolveConflicts={hasRepo ? handleResolveConflicts : undefined}
            busy={busy}
          />
        </aside>
      ) : null}

      <Sheet open={contextOpen} onOpenChange={setContextOpen}>
        <SheetContent side="right" className="w-[340px] p-0 sm:max-w-[360px]">
          <SheetTitle className="sr-only">Session context</SheetTitle>
          <ContextPanel
            todos={tasks}
            diff={diff}
            hasRepo={hasRepo}
            onRunTask={handleRunTask}
            onResolveConflicts={hasRepo ? handleResolveConflicts : undefined}
            busy={busy}
          />
        </SheetContent>
      </Sheet>

      <Dialog open={contextDialogOpen} onOpenChange={handleContextDialogOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="size-4" /> Add context
            </DialogTitle>
            <DialogDescription>
              Add reference material to this conversation. It stays queued until
              your next message, without starting a reply.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2 rounded-[10px] border border-border/60 bg-card/30 p-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <MessageSquare className="size-3.5" />
                Import another chat
              </div>
              {importableSessions.length === 0 ? (
                <p className="text-[11px] text-muted-foreground/70">
                  Create another session first, then you can bring its conversation
                  here.
                </p>
              ) : (
                <div className="flex items-center gap-2">
                  <Select
                    value={contextSessionId || undefined}
                    onValueChange={setContextSessionId}
                    disabled={contextLoading}
                  >
                    <SelectTrigger className="h-8 min-w-0 flex-1">
                      <SelectValue placeholder="Choose a conversation…" />
                    </SelectTrigger>
                    <SelectContent>
                      {importableSessions.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.title || item.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => void importChatAsContext(contextSessionId)}
                    disabled={!contextSessionId || contextLoading}
                  >
                    {contextLoading ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <MessageSquare className="size-3.5" />
                    )}
                    Use chat
                  </Button>
                </div>
              )}
              {importedContext ? (
                <div className="space-y-2 rounded-[10px] border border-success/25 bg-success/5 p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-success dark:text-success">
                      <Check className="size-2.5" />
                      Context loaded
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
                      {importedContext.title}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground/60">
                      {importedContext.text.length.toLocaleString("en-US")} chars
                    </span>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setContextPreviewOpen((value) => !value)}
                    >
                      {contextPreviewOpen ? (
                        <ChevronUp className="size-3" />
                      ) : (
                        <ChevronDown className="size-3" />
                      )}
                      {contextPreviewOpen ? "Hide" : "View"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={clearImportedContext}
                      aria-label="Remove imported context"
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                  {contextPreviewOpen ? (
                    <pre className="scrollbar-thin max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-[8px] border border-border/60 bg-background/60 p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                      {importedContext.text}
                    </pre>
                  ) : null}
                </div>
              ) : null}
              <p className="text-[10px] leading-relaxed text-muted-foreground/70">
                The imported chat is queued as context and shown as a compact tag.
                It will be sent with your next message. Tool calls and raw metadata
                are omitted.
              </p>
            </div>

            <Input
              value={contextDescription}
              onChange={(event) => setContextDescription(event.target.value)}
              placeholder="Label (optional) — e.g. API reference"
              maxLength={120}
            />
            <Textarea
              value={contextText}
              onChange={(event) => setContextText(event.target.value)}
              placeholder={
                importedContext
                  ? "Optional extra notes to send with the imported chat…"
                  : "Paste docs, notes, logs, requirements, or anything the agent should keep in mind…"
              }
              rows={importedContext ? 3 : 8}
              className="scrollbar-thin resize-y text-[13px]"
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground">
              This is queued as context, not sent as a user prompt. It will be
              included with your next message and will not start an assistant turn
              by itself.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setContextDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddContext}
              disabled={!contextText.trim() && !importedContext}
            >
              Load context
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename session</DialogTitle>
            <DialogDescription>Choose a short, recognizable title.</DialogDescription>
          </DialogHeader>
          <Input
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
            autoFocus
            onKeyDown={(event) => {
              if (event.key === "Enter" && titleDraft.trim()) {
                const title = titleDraft.trim();
                setRenameOpen(false);
                void renameSession(session.id, title)
                  .then(() => toast.success("Session renamed"))
                  .catch((error: unknown) =>
                    toast.error("Rename failed", {
                      description: error instanceof Error ? error.message : undefined,
                    }),
                  );
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!titleDraft.trim()}
              onClick={() => {
                const title = titleDraft.trim();
                setRenameOpen(false);
                void renameSession(session.id, title)
                  .then(() => toast.success("Session renamed"))
                  .catch((error: unknown) =>
                    toast.error("Rename failed", {
                      description: error instanceof Error ? error.message : undefined,
                    }),
                  );
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this session?</AlertDialogTitle>
            <AlertDialogDescription>
              “{session.title}” and its messages will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() =>
                void deleteSession(session.id)
                  .then(() => {
                    savePendingContexts(session.id, []);
                    toast.success("Session deleted");
                  })
                  .catch((error: unknown) =>
                    toast.error("Delete failed", {
                      description: error instanceof Error ? error.message : undefined,
                    }),
                  )
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
