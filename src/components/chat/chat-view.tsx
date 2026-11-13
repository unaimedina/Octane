"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Bot,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  GitPullRequest,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  PanelRight,
  Pencil,
  ShieldAlert,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAppData } from "@/components/app-data";
import { ActivityBar } from "@/components/chat/activity-bar";
import { ContextPanel } from "@/components/chat/context-panel";
import { AsciiEmblem } from "@/components/chat/ascii-emblem";
import {
  PlanFilesImportDialog,
  type PlanFilePreviewItem,
} from "@/components/chat/plan-files-import-dialog";
import { Composer, type ModelSelection, type OutgoingMessage } from "@/components/chat/composer";
import { Markdown } from "@/components/chat/markdown";
import { SubagentPartView } from "@/components/chat/subagent-part";
import { ExploreGroup, ToolCallPart, ToolRootContext } from "@/components/chat/tool-part";
import { currentActivity, groupExploration, isExploreTool } from "@/lib/tool-activity";
import { WorkerDialog } from "@/components/chat/worker-dialog";
import { TopBarActions } from "@/components/top-bar-slot";
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
import { derivePlanSteps } from "@/lib/plan-tasks";
import type { PlanArchiveResult } from "@/lib/plan-file-archive";
import type { TaskRunnerSettings } from "@/lib/tasks";
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
  Permission,
  Session,
  Skill,
  SubagentPart,
  Task,
  TaskInput,
  TextPart,
  UserMessage,
  WorkerRecord,
} from "@/lib/types";
import { diffTouchesPlanFiles, partTouchesPlanFiles } from "@/lib/plan-file-paths";
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

const compactNumber = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

function formatCompact(value: number): string {
  return compactNumber.format(value).toLowerCase();
}

function lastSegment(path: string | null | undefined): string | undefined {
  return path?.split(/[\\/]/).filter(Boolean).pop();
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
      className="group/reasoning"
    >
      <summary className="-mx-1.5 flex cursor-pointer list-none items-center gap-2.5 rounded-sm px-1.5 py-1 text-[13px] text-muted-foreground outline-none transition-colors hover:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <Sparkles className="size-[15px] shrink-0" />
        <span>Reasoning</span>
        {duration ? (
          <span className="font-mono text-[12px]">{(duration / 1000).toFixed(1)}s</span>
        ) : null}
        <ChevronRight className="size-3.5 shrink-0 opacity-0 transition-[transform,opacity] group-open/reasoning:rotate-90 group-open/reasoning:opacity-100 group-hover/reasoning:opacity-100" />
      </summary>
      {open ? (
        <div className="ml-6 mt-1 border-l border-border pl-3 text-[13px] text-muted-foreground">
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
        className="my-2 max-h-72 rounded-md border border-border object-contain"
      />
    );
  }
  return (
    <a
      href={part.url}
      download={part.filename}
      className="my-1 inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 text-xs hover:bg-secondary"
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
          <div className="relative whitespace-pre-wrap break-words text-[14px] leading-[1.65]">
            {part.text}
            <span className="ml-0.5 inline-block h-4 w-[3px] translate-y-0.5 animate-pulse rounded-[1px] bg-brand align-middle" />
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
        <details className="group/subtask">
          <summary className="-mx-1.5 flex cursor-pointer list-none items-center gap-2.5 rounded-sm px-1.5 py-1 text-[13px] outline-none transition-colors hover:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <Sparkles className="size-[15px] shrink-0 text-muted-foreground" />
            <span className="shrink-0 text-foreground/85">Subtask · {part.agent}</span>
            <span className="min-w-0 truncate text-[12px] text-muted-foreground">
              {part.description}
            </span>
            <ChevronRight className="ml-auto size-3.5 shrink-0 text-muted-foreground opacity-0 transition-[transform,opacity] group-open/subtask:rotate-90 group-open/subtask:opacity-100 group-hover/subtask:opacity-100" />
          </summary>
          <p className="ml-6 mt-1 whitespace-pre-wrap border-l border-border pl-3 text-[13px] text-muted-foreground">
            {part.prompt}
          </p>
        </details>
      );
    case "retry":
      return (
        <div className="flex items-center gap-2.5 py-1 text-[13px] text-warning">
          <Loader2 className="size-[15px] animate-spin" />
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
              className="max-w-48 truncate rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[11px]"
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
      <div className="max-w-[85%] rounded-md bg-secondary px-4 py-3 text-[14px] leading-relaxed">
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
                className="mt-1 inline-flex items-center gap-1 rounded-sm bg-background px-1.5 font-mono text-[11px] text-muted-foreground"
              >
                @{part.name}
              </span>
            );
          }
          return null;
        })}
      </div>
      <div className="flex items-center gap-2 pr-1 font-mono text-[11px] text-muted-foreground">
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
    <div>
      <div className="flex min-w-0 items-center gap-2.5 py-1 text-[13px]">
        <BookOpen className="size-[15px] shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate text-foreground/85">
          {description?.trim().startsWith("Context from ")
            ? description
            : `Context from ${description || "a note"}`}
        </span>
        <span className="shrink-0 font-mono text-[12px] text-muted-foreground">
          {text.length.toLocaleString("en-US")} chars
        </span>
        {collapsible ? (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5 text-[12px] text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
            aria-expanded={expanded}
          >
            {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            {expanded ? "Hide" : "Show"}
          </button>
        ) : null}
      </div>
      {!collapsible || expanded ? (
        <div className="ml-6 mt-1 whitespace-pre-wrap break-words border-l border-border pl-3 text-[13px] leading-relaxed">
          {text}
        </div>
      ) : null}
      <div className="ml-6 mt-1 font-mono text-[11px] text-muted-foreground">
        <span suppressHydrationWarning>{formatTime(message.info.time.created)}</span> · not sent
        as a prompt
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
  const { items, lastTextPart } = React.useMemo(() => {
    let lastText: MessageWithParts["parts"][number] | undefined;
    for (let index = message.parts.length - 1; index >= 0; index--) {
      if (message.parts[index].type === "text") {
        lastText = message.parts[index];
        break;
      }
    }
    return {
      items: groupExploration(
        message.parts,
        (part) => part.type === "tool" && isExploreTool(part.tool),
      ),
      lastTextPart: lastText,
    };
  }, [message.parts]);
  if (message.info.role !== "assistant") return null;
  const info = message.info;
  const duration = info.time.completed ? info.time.completed - info.time.created : undefined;
  const error = errorLabel(info.error);

  const tokens = info.tokens.input + info.tokens.output;

  return (
    <div className="min-w-0">
      <div className="mb-2 text-[12px] text-muted-foreground">
        {harnessLabel} · <span className="font-mono">{info.modelID}</span>
      </div>

      <div className="space-y-1.5">
        {items.map((item) =>
          item.type === "explore" ? (
            <ExploreGroup
              key={item.parts[0].id}
              parts={item.parts.filter((part) => part.type === "tool")}
            />
          ) : (
            <AssistantPart
              key={item.part.id}
              part={item.part}
              streaming={streaming && item.part === lastTextPart}
            />
          ),
        )}
      </div>

      {error ? (
        <div className="mt-2 rounded-md border-l-2 border-destructive bg-destructive/8 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}

      <div className="mt-2 font-mono text-[11px] text-muted-foreground">
        {[
          <span key="time" suppressHydrationWarning>
            {formatTime(info.time.created)}
          </span>,
          duration ? <span key="duration">{(duration / 1000).toFixed(1)}s</span> : null,
          info.cost > 0 ? <span key="cost">{formatCost(info.cost)}</span> : null,
          tokens > 0 ? (
            <span key="tokens">
              {formatCompact(info.tokens.input)} in / {formatCompact(info.tokens.output)} out
            </span>
          ) : null,
        ]
          .filter(Boolean)
          .flatMap((node, index) => (index === 0 ? [node] : [<span key={`sep-${index}`}> · </span>, node]))}
      </div>
    </div>
  );
});

const suggestions = [
  {
    title: "Explore this codebase",
    prompt: "Give me a tour of this codebase. What does it do, how is it structured, and where should I start?",
  },
  {
    title: "Find and fix a bug",
    prompt: "Look for the most likely bug in the current uncommitted changes, explain it, and fix it.",
  },
  {
    title: "Write tests",
    prompt: "Identify the most important untested behavior in this project and write focused tests for it.",
  },
  {
    title: "Review changes",
    prompt: "Review the uncommitted changes like a senior engineer. Point out correctness, security and performance issues.",
  },
];

/** Inline permission request for the open session (the modal handles other sessions). */
function InlinePermission({
  permission,
  onRespond,
}: {
  permission: Permission;
  onRespond: (permission: Permission, response: "once" | "always" | "reject") => Promise<void>;
}) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const metadata = permission.metadata ?? {};
  const command =
    typeof metadata.command === "string"
      ? metadata.command
      : typeof metadata.description === "string"
        ? metadata.description
        : null;

  async function respond(response: "once" | "always" | "reject") {
    setBusy(response);
    try {
      await onRespond(permission, response);
    } catch (error) {
      toast.error("Could not send permission response", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="rounded-md border border-border border-l-2 border-l-brand bg-card px-3 py-2.5"
      role="group"
      aria-label="Permission request"
    >
      <div className="flex min-w-0 items-center gap-2">
        <ShieldAlert className="size-3.5 shrink-0 text-brand" />
        <span className="min-w-0 truncate text-[13px]">{permission.title}</span>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{permission.type}</span>
      </div>
      {command ? (
        <pre className="scrollbar-thin mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-muted px-2 py-1.5 font-mono text-[12px]">
          {command}
        </pre>
      ) : null}
      {permission.pattern ? (
        <div className="mt-1.5 text-[12px] text-muted-foreground">
          Pattern:{" "}
          <span className="font-mono text-foreground">
            {Array.isArray(permission.pattern) ? permission.pattern.join(", ") : permission.pattern}
          </span>
        </div>
      ) : null}
      <div className="mt-2.5 flex flex-wrap justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={Boolean(busy)}
          onClick={() => void respond("reject")}
        >
          {busy === "reject" ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Reject
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={Boolean(busy)}
          onClick={() => void respond("always")}
        >
          {busy === "always" ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Always
        </Button>
        <Button size="sm" autoFocus disabled={Boolean(busy)} onClick={() => void respond("once")}>
          {busy === "once" ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Allow once
        </Button>
      </div>
    </div>
  );
}

export function ChatView({
  initialSession,
  initialMessages,
  initialTasks,
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
  autoSend = false,
}: {
  initialSession: Session;
  initialMessages: MessageWithParts[];
  initialTasks: Task[];
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
  /** Send `initialDraft` once on mount (the /chat start box). */
  autoSend?: boolean;
}) {
  const router = useRouter();
  const {
    statuses,
    sessions,
    pathInfo,
    subscribe,
    renameSession,
    deleteSession,
    hideSessions,
    loadQuestions,
    pendingPermissions,
    respondPermission,
  } = useAppData();

  const [session, setSession] = React.useState(initialSession);

  React.useEffect(() => {
    void loadQuestions(session.id);
  }, [loadQuestions, session.id]);
  const [workers, setWorkers] = React.useState<WorkerRecord[]>([]);
  const [openWorkerID, setOpenWorkerID] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState(() =>
    sortMessages(initialMessages),
  );
  const [tasks, setTasks] = React.useState(initialTasks);
  const [runner, setRunner] = React.useState<TaskRunnerSettings>({
    autoRun: false,
    maxParallel: 2,
  });
  const planSteps = React.useMemo(() => derivePlanSteps(messages), [messages]);
  const pendingPlanSteps = React.useMemo(() => {
    const existing = new Set(
      tasks.map((task) => task.title.trim().toLowerCase()),
    );
    return planSteps.filter(
      (step) => !existing.has(step.title.trim().toLowerCase()),
    );
  }, [planSteps, tasks]);
  const [planFilePreview, setPlanFilePreview] = React.useState<{
    plansDir: string | null;
    items: PlanFilePreviewItem[];
    warnings: string[];
  }>({ plansDir: null, items: [], warnings: [] });
  const [planFilesOpen, setPlanFilesOpen] = React.useState(false);
  const [planFilesLoading, setPlanFilesLoading] = React.useState(false);
  const planFilesTimer = React.useRef<number | null>(null);
  /** Pending plan-file refs from the last scan; null until the first scan. */
  const knownPlanFiles = React.useRef<Set<string> | null>(null);
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
  const [modelRestored, setModelRestored] = React.useState(false);
  const autoSent = React.useRef(false);
  const taskRefreshTimer = React.useRef<number | null>(null);

  const createTask = React.useCallback(
    async (input: TaskInput) => {
      const task = await apiJson<Task>(
        `/sessions/${encodeURIComponent(session.id)}/tasks`,
        { method: "POST", ...jsonBody(input) },
      );
      setTasks((current) => [...current, task]);
      return task;
    },
    [session.id],
  );

  const updateTask = React.useCallback(
    async (id: string, input: Partial<TaskInput>) => {
      const task = await apiJson<Task>(
        `/sessions/${encodeURIComponent(session.id)}/tasks/${encodeURIComponent(id)}`,
        { method: "PATCH", ...jsonBody(input) },
      );
      setTasks((current) =>
        current.map((item) => (item.id === task.id ? task : item)),
      );
      return task;
    },
    [session.id],
  );

  const deleteTask = React.useCallback(
    async (id: string) => {
      const result = await apiJson<PlanArchiveResult | undefined>(
        `/sessions/${encodeURIComponent(session.id)}/tasks/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      setTasks((current) => current.filter((item) => item.id !== id));
      if (result?.archived) {
        toast.success("Plan archived", { description: `Moved to ${result.archived}` });
      } else if (result?.warning) {
        toast.warning("Task deleted, plan file kept", { description: result.warning });
      }
    },
    [session.id],
  );

  const importPlanTasks = React.useCallback(async () => {
    if (pendingPlanSteps.length === 0) return;
    const result = await apiJson<{
      tasks: Task[];
      added: number;
      skipped: number;
    }>(`/sessions/${encodeURIComponent(session.id)}/tasks/import`, {
      method: "POST",
      ...jsonBody({
        items: pendingPlanSteps.map((step) => ({
          title: step.title,
          description: "",
          prompt: step.title,
          status: step.completed ? "completed" : "pending",
          priority: "medium",
        })),
      }),
    });
    setTasks((current) => [...current, ...result.tasks]);
    if (result.added > 0) {
      toast.success(
        `Imported ${result.added} plan step${result.added === 1 ? "" : "s"}`,
        result.skipped ? { description: `${result.skipped} already existed.` } : undefined,
      );
    } else {
      toast.message("No new plan steps to import");
    }
  }, [pendingPlanSteps, session.id]);

  /** Look for plan files in the session folder right now. */
  const scanPlanFiles = React.useCallback(
    async (options?: { reportErrors?: boolean }) => {
      if (planFilesTimer.current) {
        window.clearTimeout(planFilesTimer.current);
        planFilesTimer.current = null;
      }
      setPlanFilesLoading(true);
      try {
        const preview = await apiJson<{
          plansDir: string | null;
          items: PlanFilePreviewItem[];
          warnings: string[];
        }>(`/sessions/${encodeURIComponent(session.id)}/tasks/plan-files`);
        setPlanFilePreview(preview);
        // Tell the user when the agent writes new plan files, so they don't
        // have to go looking for the import button.
        const pending = preview.items.filter((item) => !item.imported);
        const previous = knownPlanFiles.current;
        knownPlanFiles.current = new Set(pending.map((item) => item.ref));
        const added = previous
          ? pending.filter((item) => !previous.has(item.ref)).length
          : 0;
        if (added > 0 && preview.plansDir) {
          toast.message(
            `${added} new plan file${added === 1 ? "" : "s"} in ${preview.plansDir}/`,
            {
              id: `plan-files-${session.id}`,
              action: { label: "Import", onClick: () => setPlanFilesOpen(true) },
            },
          );
        }
        return preview;
      } catch (error) {
        if (options?.reportErrors) {
          toast.error("Could not read the plans folder", {
            description: error instanceof Error ? error.message : undefined,
          });
        }
        return null;
      } finally {
        setPlanFilesLoading(false);
      }
    },
    [session.id],
  );

  /** Look for plan files in the session folder. Debounced. */
  const refreshPlanFiles = React.useCallback(() => {
    if (planFilesTimer.current) window.clearTimeout(planFilesTimer.current);
    planFilesTimer.current = window.setTimeout(() => {
      planFilesTimer.current = null;
      void scanPlanFiles();
    }, 500);
  }, [scanPlanFiles]);

  React.useEffect(() => {
    knownPlanFiles.current = null;
    refreshPlanFiles();
    return () => {
      if (planFilesTimer.current) window.clearTimeout(planFilesTimer.current);
    };
  }, [refreshPlanFiles]);

  /** Open the import dialog with a fresh scan of the plans folder. */
  const openPlanFilesImport = React.useCallback(() => {
    setPlanFilesOpen(true);
    void scanPlanFiles({ reportErrors: true });
  }, [scanPlanFiles]);

  const importPlanFiles = React.useCallback(
    async (refs: string[]) => {
      const result = await apiJson<{
        added: number;
        updated: number;
        skipped: number;
        warnings: string[];
        tasks: Task[];
      }>(`/sessions/${encodeURIComponent(session.id)}/tasks/plan-files`, {
        method: "POST",
        ...jsonBody({ refs }),
      });
      // The server returns the full, ordered task list for the session.
      setTasks(result.tasks);
      toast.success(
        `Imported ${result.added} plan file${result.added === 1 ? "" : "s"}`,
        result.warnings.length
          ? { description: result.warnings.join(" ") }
          : undefined,
      );
      refreshPlanFiles();
    },
    [session.id, refreshPlanFiles],
  );

  /** Reload tasks from the server, which settles finished runs. Debounced. */
  const refreshTasks = React.useCallback(() => {
    if (taskRefreshTimer.current) window.clearTimeout(taskRefreshTimer.current);
    taskRefreshTimer.current = window.setTimeout(() => {
      taskRefreshTimer.current = null;
      void apiJson<
        Task[] | { tasks: Task[]; runner?: TaskRunnerSettings; workers?: WorkerRecord[] }
      >(`/sessions/${encodeURIComponent(session.id)}/tasks`)
        .then((result) => {
          setTasks(Array.isArray(result) ? result : result.tasks);
          if (!Array.isArray(result) && result.runner) setRunner(result.runner);
          if (!Array.isArray(result) && result.workers) setWorkers(result.workers);
        })
        .catch(() => undefined);
    }, 500);
  }, [session.id]);

  // The page renders tasks straight from the store. If a run was in flight
  // when the tab was closed, ask the server to settle it now.
  const hadRunningTask = React.useRef(
    initialTasks.some((task) => task.status === "in_progress"),
  );
  React.useEffect(() => {
    if (hadRunningTask.current) {
      hadRunningTask.current = false;
      refreshTasks();
    }
  }, [refreshTasks]);

  /** Manual refresh from the Tasks panel: reload tasks and rescan plans now. */
  const refreshTasksPanel = React.useCallback(() => {
    refreshTasks();
    void scanPlanFiles({ reportErrors: true });
  }, [refreshTasks, scanPlanFiles]);

  const pendingPlanFiles = planFilePreview.items.filter((item) => !item.imported);
  const planFilesProp = pendingPlanFiles.length > 0 && planFilePreview.plansDir
    ? { count: pendingPlanFiles.length, dir: planFilePreview.plansDir }
    : undefined;

  // Workers belong to this chat: drop them from the sidebar as soon as known.
  React.useEffect(() => {
    if (workers.length) hideSessions(workers.map((worker) => worker.sessionID));
  }, [workers, hideSessions]);

  // Load the auto-run settings (GET /tasks also re-arms the server ticker).
  React.useEffect(() => {
    refreshTasks();
  }, [refreshTasks]);

  // Poll while tasks run or auto-run is on; workers finish in other sessions.
  const tasksRunning = tasks.some((task) => task.status === "in_progress");
  const pollTasks = tasksRunning || runner.autoRun;
  React.useEffect(() => {
    if (!pollTasks) return;
    const timer = window.setInterval(refreshTasks, 5_000);
    return () => window.clearInterval(timer);
  }, [pollTasks, refreshTasks]);

  // Refresh as soon as a running task's session changes state.
  const runStatusKey = tasks
    .filter((task) => task.status === "in_progress" && task.run?.sessionID)
    .map((task) => `${task.run?.sessionID}:${statuses[task.run?.sessionID ?? ""]?.type ?? "idle"}`)
    .join(",");
  const lastRunStatusKey = React.useRef(runStatusKey);
  React.useEffect(() => {
    if (lastRunStatusKey.current === runStatusKey) return;
    lastRunStatusKey.current = runStatusKey;
    refreshTasks();
  }, [runStatusKey, refreshTasks]);

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
      setModelRestored(true);
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
  }, [messages, tasks]);

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
            // The agent just wrote a plan file: rescan so the import button
            // shows up without waiting for the turn to end.
            if (partTouchesPlanFiles(part)) refreshPlanFiles();
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
              refreshTasks();
              refreshPlanFiles();
            }
            break;
          case "session.idle":
            flushPending();
            setWorking(false);
            scheduleRefresh();
            refreshTasks();
            refreshPlanFiles();
            break;
          case "session.compacted":
            scheduleRefresh();
            break;
          case "session.error":
            refreshTasks();
            toast.error("Session error", {
              description: errorLabel(event.properties.error) ?? undefined,
            });
            break;
          case "session.diff":
            setDiff(event.properties.diff);
            if (diffTouchesPlanFiles(event.properties.diff)) refreshPlanFiles();
            break;
          default:
            break;
        }
      }),
    [
      subscribe,
      session.id,
      backendSessionID,
      router,
      scheduleRefresh,
      flushPending,
      refreshPlanFiles,
      queueFlush,
      refreshTasks,
    ],
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

  // One-shot send from the /chat start box (`?prompt=…&send=1`). The URL is
  // cleaned first so a reload can't send twice; the ref and the timer (cleared
  // on Strict Mode's simulated unmount) make it run exactly once.
  const modelsSettled = models.length === 0 || modelRestored;
  React.useEffect(() => {
    if (!autoSend || autoSent.current || !initialDraft.trim() || !modelsSettled) return;
    const timer = window.setTimeout(() => {
      if (autoSent.current) return;
      autoSent.current = true;
      router.replace(`/chat/${session.id}`);
      setDraft("");
      void handleSend({ text: initialDraft, attachments: [], skills: [], agent: undefined }).catch(
        (error: unknown) => {
          setDraft(initialDraft);
          toast.error("Message failed", {
            description: error instanceof Error ? error.message : "Unknown error",
          });
        },
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [autoSend, handleSend, initialDraft, modelsSettled, router, session.id]);

  const handleAbort = React.useCallback(async () => {
    await apiJson(`/sessions/${encodeURIComponent(session.id)}/abort`, {
      method: "POST",
    });
    setWorking(false);
    toast.success("Stopped");
    refreshTasks();
  }, [refreshTasks, session.id]);

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
    async (task: Task) => {
      if (busy) {
        toast.error("Wait for the current turn to finish");
        return;
      }
      setAgent(buildAgent);
      try {
        const result = await apiJson<{ task: Task }>(
          `/sessions/${encodeURIComponent(session.id)}/tasks/${encodeURIComponent(task.id)}/run`,
          {
            method: "POST",
            ...jsonBody({
              agent: buildAgent,
              model: model
                ? { providerID: model.providerID, modelID: model.modelID }
                : undefined,
            }),
          },
        );
        setTasks((current) =>
          current.map((item) => (item.id === result.task.id ? result.task : item)),
        );
        scheduleRefresh();
      } catch (error) {
        toast.error("Could not start the task", {
          description: error instanceof Error ? error.message : undefined,
        });
        refreshTasks();
      }
    },
    [busy, buildAgent, model, refreshTasks, scheduleRefresh, session.id],
  );

  const taskModel = React.useMemo(
    () =>
      model ? { providerID: model.providerID, modelID: model.modelID } : undefined,
    [model],
  );

  const handleRunTaskInWorker = React.useCallback(
    async (task: Task) => {
      try {
        const result = await apiJson<{ task: Task }>(
          `/sessions/${encodeURIComponent(session.id)}/tasks/${encodeURIComponent(task.id)}/run`,
          {
            method: "POST",
            ...jsonBody({ mode: "worker", agent: buildAgent, model: taskModel }),
          },
        );
        setTasks((current) =>
          current.map((item) => (item.id === result.task.id ? result.task : item)),
        );
      } catch (error) {
        toast.error("Could not start the worker", {
          description: error instanceof Error ? error.message : undefined,
        });
      }
      refreshTasks();
    },
    [buildAgent, refreshTasks, session.id, taskModel],
  );

  const patchRunner = React.useCallback(
    async (patch: Record<string, unknown>) => {
      const result = await apiJson<{
        runner: TaskRunnerSettings;
        tasks: Task[];
        warning?: string;
      }>(`/sessions/${encodeURIComponent(session.id)}/tasks/runner`, {
        method: "PATCH",
        ...jsonBody(patch),
      });
      setRunner(result.runner);
      setTasks(result.tasks);
      if (result.warning) {
        toast.error("Auto-run could not start tasks yet", {
          description: result.warning,
        });
      }
    },
    [session.id],
  );

  const handleToggleAutoRun = React.useCallback(
    (autoRun: boolean) =>
      patchRunner(autoRun ? { autoRun, model: taskModel ?? null } : { autoRun }),
    [patchRunner, taskModel],
  );

  const handleMaxParallelChange = React.useCallback(
    (maxParallel: number) => patchRunner({ maxParallel }),
    [patchRunner],
  );

  const handleDismissStalled = React.useCallback(() => {
    setRunner((current) => ({ ...current, stalled: undefined }));
    void patchRunner({ stalled: null }).catch(() => undefined);
  }, [patchRunner]);

  const handleRunReady = React.useCallback(async () => {
    const result = await apiJson<{
      started: string[];
      tasks: Task[];
      runner: TaskRunnerSettings;
    }>(`/sessions/${encodeURIComponent(session.id)}/tasks/schedule`, {
      method: "POST",
      ...jsonBody({ agent: buildAgent, model: taskModel }),
    });
    setTasks(result.tasks);
    setRunner(result.runner);
    if (result.started.length === 0) {
      toast.message("No task could start", {
        description: "Every worker slot is busy or nothing is ready.",
      });
    }
  }, [buildAgent, session.id, taskModel]);

  const runningWorkers = workers.filter((worker) => {
    const type = statuses[worker.sessionID]?.type;
    return type === "busy" || type === "retry";
  }).length;
  const openWorker = workers.find((worker) => worker.sessionID === openWorkerID) ?? null;

  const handleStopTask = React.useCallback(
    async (task: Task) => {
      try {
        const result = await apiJson<{ task: Task }>(
          `/sessions/${encodeURIComponent(session.id)}/tasks/${encodeURIComponent(task.id)}/stop`,
          { method: "POST" },
        );
        setTasks((current) =>
          current.map((item) => (item.id === result.task.id ? result.task : item)),
        );
        setWorking(false);
        scheduleRefresh();
      } catch (error) {
        toast.error("Could not stop the task", {
          description: error instanceof Error ? error.message : undefined,
        });
        refreshTasks();
      }
    },
    [refreshTasks, scheduleRefresh, session.id],
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
  const activity = React.useMemo(
    () => (busy ? currentActivity(visibleMessages, session.directory) : null),
    [busy, visibleMessages, session.directory],
  );
  const pendingPermission = pendingPermissions.find(
    (permission) => permission.sessionID === session.id,
  );
  const sessionSummary = [
    session.id,
    totals.cost > 0 ? formatCost(totals.cost) : null,
    diff.length > 0 ? `${diff.length} file${diff.length === 1 ? "" : "s"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const emptyFolder = lastSegment(session.directory || pathInfo?.directory);

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBarActions>
          {status.type === "retry" ? (
            <span className="flex items-center gap-1.5 px-1 text-[12px] text-warning" title="Retrying">
              <Loader2 className="size-3.5 animate-spin" />
              <span className="hidden sm:inline">Retry {status.attempt}</span>
            </span>
          ) : busy ? (
            <span className="flex items-center gap-2 px-1 text-[12px] text-muted-foreground" title="Working">
              <span className="status-square bg-brand" aria-hidden="true" />
              <span className="hidden sm:inline">Working</span>
            </span>
          ) : null}

          {/* TODO(context-meter): plan 016 owner decision #1, needs limit.context in ModelOption. */}
          {workers.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" aria-label="Subagents">
                  <Bot className="size-4" />
                  <span className="hidden sm:inline">Subagents</span>
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    {runningWorkers > 0
                      ? `${runningWorkers}/${workers.length}`
                      : workers.length}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                {workers.map((worker) => {
                  const running =
                    statuses[worker.sessionID]?.type === "busy" ||
                    statuses[worker.sessionID]?.type === "retry";
                  const run = tasks.find((item) => item.id === worker.taskId)?.run;
                  const outcome =
                    run?.sessionID === worker.sessionID ? run.outcome : undefined;
                  const dot = running
                    ? "bg-brand"
                    : outcome === "done"
                      ? "bg-success"
                      : outcome === "blocked" || outcome === "error" || outcome === "aborted"
                        ? "bg-destructive"
                        : "bg-muted-foreground/50";
                  return (
                    <DropdownMenuItem
                      key={worker.sessionID}
                      onSelect={() => setOpenWorkerID(worker.sessionID)}
                    >
                      <span className={`status-square ${dot}`} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{worker.title}</span>
                      <span
                        className="shrink-0 font-mono text-[11px] text-muted-foreground"
                        suppressHydrationWarning
                      >
                        {formatTime(worker.startedAt)}
                      </span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
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
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Session actions"
                title={sessionSummary}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onSelect={() => {
                  setTitleDraft(session.title);
                  setRenameOpen(true);
                }}
              >
                <Pencil className="size-4" /> Rename
              </DropdownMenuItem>
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
          <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
        </TopBarActions>

        <div className="relative min-h-0 flex-1">
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="scrollbar-thin h-full overflow-y-auto"
          >
            <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
              {showEmpty ? (
                <div className="animate-fade flex min-h-[calc(100dvh-16rem)] flex-col justify-center py-10">
                  <AsciiEmblem />
                  <p className="mt-3 text-center font-mono text-[11px] text-muted-foreground">
                    [ idle ]
                  </p>
                  <h2 className="headline mt-8 text-[28px] leading-tight">
                    {emptyFolder ? `What should we build in ${emptyFolder}?` : "What should we build?"}
                  </h2>
                  <ul className="mt-4 space-y-1">
                    {suggestions.map((suggestion) => (
                      <li key={suggestion.title}>
                        <button
                          type="button"
                          onClick={() => setDraft(suggestion.prompt)}
                          className="inline-flex items-center gap-2 rounded-sm py-0.5 text-left text-[13px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                          title={suggestion.prompt}
                        >
                          <ArrowRight className="size-3 shrink-0" />
                          {suggestion.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="space-y-8">
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
                  <ToolRootContext.Provider value={session.directory ?? undefined}>
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
                  </ToolRootContext.Provider>
                  {pendingPermission ? (
                    <InlinePermission
                      key={pendingPermission.id}
                      permission={pendingPermission}
                      onRespond={respondPermission}
                    />
                  ) : null}
                  {busy || pendingPermission ? (
                    <ActivityBar
                      active
                      label={
                        pendingPermission
                          ? "Waiting for permission…"
                          : (activity ?? `${harnessLabel} is working…`)
                      }
                    />
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
                className="pointer-events-auto gap-1.5 rounded-md"
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
          <div className="shrink-0 px-3 pt-2 sm:px-5">
            <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-2">
              {pendingContexts.map((item) => (
                <span
                  key={item.id}
                  className="inline-flex min-w-0 items-center gap-1.5 rounded-sm bg-secondary px-2 py-1 text-[11px]"
                >
                  <BookOpen className="size-3 shrink-0 text-muted-foreground" />
                  <span className="max-w-[220px] truncate" title={item.description || undefined}>
                    Context: {item.description || "note"}
                  </span>
                  <span className="font-mono text-muted-foreground">
                    {item.text.length.toLocaleString("en-US")} chars
                  </span>
                  <button
                    type="button"
                    onClick={() => removePendingContext(item.id)}
                    aria-label="Remove queued context"
                    className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <span className="text-[11px] text-muted-foreground">Sent with your next message</span>
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
        <aside className="hidden w-[320px] shrink-0 py-3 pr-3 xl:block">
          <div className="surface-panel h-full overflow-hidden">
          <ContextPanel
            tasks={tasks}
            diff={diff}
            hasRepo={hasRepo}
            planSteps={pendingPlanSteps.length}
            onRunTask={handleRunTask}
            onRunTaskInWorker={handleRunTaskInWorker}
            runner={runner}
            onToggleAutoRun={handleToggleAutoRun}
            onRunReady={handleRunReady}
            onMaxParallelChange={handleMaxParallelChange}
            onDismissStalled={handleDismissStalled}
            onStopTask={handleStopTask}
            onOpenWorker={setOpenWorkerID}
            onCreateTask={createTask}
            onUpdateTask={updateTask}
            onDeleteTask={deleteTask}
            onImportPlan={importPlanTasks}
            planFiles={planFilesProp}
            onImportPlanFiles={openPlanFilesImport}
            onRefreshTasks={refreshTasksPanel}
            refreshing={planFilesLoading}
            onResolveConflicts={hasRepo ? handleResolveConflicts : undefined}
            busy={busy}
          />
          </div>
        </aside>
      ) : null}

      <Sheet open={contextOpen} onOpenChange={setContextOpen}>
        {/* Own header with a visible close button: the Sheet's default close
            button sat on top of the panel's "More task actions" button. */}
        <SheetContent
          side="right"
          className="w-[340px] gap-0 p-0 sm:max-w-[360px]"
          showCloseButton={false}
        >
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-border pl-3 pr-1.5">
            <SheetTitle className="text-[13px] font-medium">Session context</SheetTitle>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              onClick={() => setContextOpen(false)}
              aria-label="Close context panel"
            >
              <X className="size-4" />
            </Button>
          </div>
          <div className="min-h-0 flex-1">
          <ContextPanel
            tasks={tasks}
            diff={diff}
            hasRepo={hasRepo}
            planSteps={pendingPlanSteps.length}
            onRunTask={handleRunTask}
            onRunTaskInWorker={handleRunTaskInWorker}
            runner={runner}
            onToggleAutoRun={handleToggleAutoRun}
            onRunReady={handleRunReady}
            onMaxParallelChange={handleMaxParallelChange}
            onDismissStalled={handleDismissStalled}
            onStopTask={handleStopTask}
            onOpenWorker={setOpenWorkerID}
            onCreateTask={createTask}
            onUpdateTask={updateTask}
            onDeleteTask={deleteTask}
            onImportPlan={importPlanTasks}
            planFiles={planFilesProp}
            onImportPlanFiles={openPlanFilesImport}
            onRefreshTasks={refreshTasksPanel}
            refreshing={planFilesLoading}
            onResolveConflicts={hasRepo ? handleResolveConflicts : undefined}
            busy={busy}
          />
          </div>
        </SheetContent>
      </Sheet>

      <WorkerDialog
        worker={openWorker}
        task={openWorker ? tasks.find((item) => item.id === openWorker.taskId) : undefined}
        status={openWorker ? statuses[openWorker.sessionID] : undefined}
        onOpenChange={(open) => {
          if (!open) setOpenWorkerID(null);
        }}
        onStop={handleStopTask}
      />

      <PlanFilesImportDialog
        open={planFilesOpen}
        onOpenChange={setPlanFilesOpen}
        dir={planFilePreview.plansDir ?? "plans"}
        items={planFilePreview.items}
        warnings={planFilePreview.warnings}
        onImport={importPlanFiles}
        onRefresh={() => void scanPlanFiles({ reportErrors: true })}
        loading={planFilesLoading}
      />

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
            <div className="space-y-2 rounded-md border border-border p-2.5">
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
                <div className="space-y-2 rounded-md bg-secondary p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <BookOpen className="size-3.5 shrink-0 text-muted-foreground" />
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
                    <pre className="scrollbar-thin max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-background p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
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
