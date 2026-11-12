"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChartColumn,
  ChevronUp,
  Copy,
  FolderKanban,
  FolderTree,
  Loader2,
  LogIn,
  LogOut,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { useAppData } from "@/components/app-data";
import { Wordmark } from "@/components/brand";
import { QuestionCenter } from "@/components/question-center";
import { TopBarSlotProvider, TopBarSlotTarget } from "@/components/top-bar-slot";
import { useConnection } from "@/components/use-connection";
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
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { ApiError, apiJson, readCsrfCookie } from "@/lib/api";
import type { ConnectionState } from "@/lib/connection-state";
import { CSRF_HEADER } from "@/lib/constants";
import { normalizeProjectDirectory } from "@/lib/project-paths";
import type { Project, Session } from "@/lib/types";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/chat", label: "Sessions", icon: MessageSquare },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/files", label: "Files", icon: FolderTree },
  { href: "/usage", label: "Usage", icon: ChartColumn },
] as const;

/** Sessions shown per sidebar group before "Show n more". */
const GROUP_PREVIEW = 8;
const OTHER_GROUP = "__other__";

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 3_600_000;
  const day = 86_400_000;
  if (diff < minute) return "now";
  if (diff < hour) return `${Math.floor(diff / minute)}m`;
  if (diff < day) return `${Math.floor(diff / hour)}h`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d`;
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function basename(path: string | undefined | null): string | undefined {
  return path?.split(/[\\/]/).filter(Boolean).pop();
}

// ---------- Connection status ----------

const connectionSquare: Record<ConnectionState["kind"], string> = {
  connected: "bg-success",
  reconnecting: "bg-warning",
  disconnected: "bg-destructive",
};

function connectionLabel(state: ConnectionState): string {
  if (state.kind === "connected") return "Connected";
  if (state.kind === "reconnecting") return "Reconnecting…";
  return state.reason === "unauthorized"
    ? "OpenCode rejected the server credentials"
    : "Disconnected";
}

function disconnectReason(state: ConnectionState): string | null {
  if (state.kind !== "disconnected") return null;
  switch (state.reason) {
    case "unauthorized":
      return "OpenCode rejected the server credentials";
    case "stream":
      return "Live stream closed";
    case "upstream":
    case "probe":
      return "OpenCode is not responding";
  }
}

function ConnectionStatus({
  state,
  harnessLabel,
}: {
  state: ConnectionState;
  harnessLabel: string;
}) {
  const reason = disconnectReason(state);
  const version = state.kind === "connected" ? state.version : null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex h-8 items-center gap-2 rounded-sm px-1.5 outline-none" tabIndex={0}>
          <span className={cn("status-square", connectionSquare[state.kind])} aria-hidden="true" />
          <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">
            <span role="status" aria-live="polite">
              {state.kind === "disconnected" ? "Disconnected" : connectionLabel(state)}
            </span>
            {state.kind === "connected" ? (
              <span aria-hidden="true"> · {state.latencyMs} ms</span>
            ) : null}
          </span>
          <span className="sr-only sm:hidden">{connectionLabel(state)}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end">
        <span className="flex flex-col gap-0.5">
          <span>{version ? `${harnessLabel} ${version}` : harnessLabel}</span>
          {reason ? <span className="text-muted-foreground">{reason}</span> : null}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

// ---------- Shared actions ----------

function useNewSession(onDone?: () => void) {
  const { createSession, refreshSessions } = useAppData();
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);

  const create = React.useCallback(async () => {
    if (creating) return;
    setCreating(true);
    try {
      const session = await createSession();
      onDone?.();
      router.push(`/chat/${session.id}`);
    } catch (error) {
      toast.error("Could not create session", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setCreating(false);
    }
  }, [createSession, creating, onDone, router]);

  const createInProject = React.useCallback(
    async (project: Project) => {
      if (creating) return;
      setCreating(true);
      try {
        const session = await apiJson<Session>(`/projects/${project.id}/sessions`, {
          method: "POST",
        });
        await refreshSessions();
        onDone?.();
        router.push(`/chat/${session.id}`);
      } catch (error) {
        if (error instanceof ApiError && error.code === "projects_require_v2") {
          toast.error("Project sessions need the OpenCode v2 API");
          setCreating(false);
          await create();
          return;
        }
        toast.error("Could not create a project session", {
          description: error instanceof Error ? error.message : undefined,
        });
      } finally {
        setCreating(false);
      }
    },
    [create, creating, onDone, refreshSessions, router],
  );

  return { create, createInProject, creating };
}

async function signOut() {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { [CSRF_HEADER]: readCsrfCookie() ?? "" },
    });
  } finally {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }
}

// ⌘K on Apple platforms, Ctrl K elsewhere. Server render uses "Ctrl K".
function subscribeNothing() {
  return () => undefined;
}
function useSearchShortcutLabel(): string {
  return React.useSyncExternalStore(
    subscribeNothing,
    () => (/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent) ? "⌘K" : "Ctrl K"),
    () => "Ctrl K",
  );
}

// ---------- Sidebar ----------

function SessionRow({
  session,
  active,
  busy,
  needsInput,
  harnessLabel,
  onNavigate,
  onRename,
  onDelete,
}: {
  session: Session;
  active: boolean;
  busy: boolean;
  needsInput: boolean;
  harnessLabel: string;
  onNavigate?: () => void;
  onRename: (session: Session) => void;
  onDelete: (session: Session) => void;
}) {
  const meta = needsInput ? "needs input" : busy ? "working" : timeAgo(session.time.updated);
  return (
    <div
      className={cn(
        "group/session relative flex w-full min-w-0 items-center gap-1 rounded-md pr-1 transition-colors",
        active ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60",
      )}
    >
      <Link
        href={`/chat/${session.id}`}
        prefetch={false}
        onClick={onNavigate}
        title={session.directory || session.title}
        className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-md px-2.5 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex min-w-0 items-center gap-2">
          {busy || needsInput ? (
            <span className="status-square bg-brand" aria-hidden="true" />
          ) : null}
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[13px]",
              active ? "text-foreground" : "text-foreground/80",
            )}
          >
            {session.title || "Untitled session"}
          </span>
        </span>
        <span
          className="truncate font-mono text-[11px] text-muted-foreground"
          suppressHydrationWarning
        >
          {harnessLabel} · {meta}
        </span>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            className="opacity-0 transition-opacity group-hover/session:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
            aria-label={`Actions for ${session.title}`}
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => onRename(session)}>
            <Pencil className="size-4" /> Rename
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
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => onDelete(session)}>
            <Trash2 className="size-4" /> Delete session
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

type SessionGroup = {
  key: string;
  project: Project | null;
  name: string;
  sessions: Session[];
};

/**
 * Group sessions by project, matching like `projectSessions()` in
 * `src/lib/project-paths.ts`. Groups are ordered by their most recent session;
 * sessions outside every project go to a final group.
 */
function groupSessions(sessions: Session[], projects: Project[], otherName: string): SessionGroup[] {
  const byDirectory = new Map<string, Project>();
  for (const project of projects) {
    byDirectory.set(normalizeProjectDirectory(project.directory).toLowerCase(), project);
  }
  const groups = new Map<string, SessionGroup>();
  const other: SessionGroup = { key: OTHER_GROUP, project: null, name: otherName, sessions: [] };
  // `sessions` is sorted newest first, so insertion order is recency order.
  for (const session of sessions) {
    const project = session.directory
      ? byDirectory.get(normalizeProjectDirectory(session.directory).toLowerCase())
      : undefined;
    if (!project) {
      other.sessions.push(session);
      continue;
    }
    let group = groups.get(project.id);
    if (!group) {
      group = { key: project.id, project, name: project.name, sessions: [] };
      groups.set(project.id, group);
    }
    group.sessions.push(session);
  }
  const ordered = [...groups.values()];
  if (other.sessions.length) ordered.push(other);
  return ordered;
}

function UserMenu({
  connection,
  onNavigate,
}: {
  connection: ConnectionState;
  onNavigate?: () => void;
}) {
  const { username, harnessLabel } = useAppData();
  const { theme, setTheme } = useTheme();
  const version = connection.kind === "connected" ? connection.version : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left outline-none transition-colors hover:bg-sidebar-accent/60 focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-sidebar-accent">
          <span className="grid size-7 shrink-0 place-items-center rounded-sm bg-secondary text-[12px] font-medium text-foreground">
            {username.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px]">{username}</span>
          <ChevronUp className="size-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="text-xs text-muted-foreground">Signed in as {username}</div>
          <div className="mt-1.5 flex items-center gap-2 text-xs text-foreground">
            <span className={cn("status-square", connectionSquare[connection.kind])} aria-hidden="true" />
            <span className="min-w-0 truncate">
              {connectionLabel(connection)}
              {connection.kind === "connected" ? ` · ${connection.latencyMs} ms` : ""}
            </span>
          </div>
          {version ? (
            <div className="mt-1 font-mono text-[11px] text-muted-foreground">
              {harnessLabel} {version}
            </div>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings#opencode-account" onClick={onNavigate}>
            <LogIn className="size-4" /> OpenCode account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings" onClick={onNavigate}>
            <Settings2 className="size-4" /> Settings
          </Link>
        </DropdownMenuItem>
        <div className="flex items-center gap-2 px-1.5 py-1">
          <span className="text-sm">Theme</span>
          <DropdownMenuRadioGroup
            value={theme ?? "system"}
            onValueChange={setTheme}
            className="ml-auto flex rounded-md bg-muted p-0.5"
            aria-label="Theme"
          >
            {(["light", "dark", "system"] as const).map((value) => (
              <DropdownMenuRadioItem
                key={value}
                value={value}
                onSelect={(event) => event.preventDefault()}
                className="h-6 flex-1 justify-center rounded-sm px-2 text-[11px] capitalize text-muted-foreground data-[state=checked]:bg-secondary data-[state=checked]:text-foreground [&>[data-slot=dropdown-menu-radio-item-indicator]]:hidden"
              >
                {value}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()} variant="destructive">
          <LogOut className="size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarContent({
  connection,
  onNavigate,
}: {
  connection: ConnectionState;
  onNavigate?: () => void;
}) {
  const {
    sessions,
    projects,
    statuses,
    pathInfo,
    harnessLabel,
    pendingPermissions,
    pendingQuestions,
    deleteSession,
    renameSession,
    refreshSessions,
  } = useAppData();
  const pathname = usePathname();
  const searchRef = React.useRef<HTMLInputElement>(null);
  const [query, setQuery] = React.useState("");
  const [refreshing, setRefreshing] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
  const [renameTarget, setRenameTarget] = React.useState<Session | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Session | null>(null);
  const [titleDraft, setTitleDraft] = React.useState("");
  const { create, createInProject, creating } = useNewSession(onNavigate);
  const newSessionRef = React.useRef<() => void>(() => undefined);
  const shortcutLabel = useSearchShortcutLabel();

  React.useEffect(() => {
    newSessionRef.current = () => void create();
  }, [create]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (
        event.key.toLowerCase() === "n" &&
        !typing &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        newSessionRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const searching = query.trim().length > 0;

  const filtered = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return sessions;
    return sessions.filter(
      (session) =>
        session.title.toLowerCase().includes(term) ||
        session.id.toLowerCase().includes(term),
    );
  }, [query, sessions]);

  const groups = React.useMemo(
    () => groupSessions(filtered, projects, basename(pathInfo?.directory) ?? "Workspace"),
    [filtered, projects, pathInfo?.directory],
  );

  const needsInput = React.useMemo(() => {
    const ids = new Set<string>();
    for (const permission of pendingPermissions) ids.add(permission.sessionID);
    for (const question of pendingQuestions) ids.add(question.sessionID);
    return ids;
  }, [pendingPermissions, pendingQuestions]);

  function toggleGroup(key: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 px-3">
        <Link
          href="/chat"
          onClick={onNavigate}
          className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Wordmark />
        </Link>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void create()}
              disabled={creating}
              aria-label="New session"
            >
              {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">New session · N</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex items-center gap-1 px-3 pb-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search sessions"
            className="h-8 rounded-md border-input bg-muted pl-8 pr-12 text-[13px] shadow-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] text-muted-foreground">
              {shortcutLabel}
            </kbd>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          disabled={refreshing}
          onClick={async () => {
            setRefreshing(true);
            await refreshSessions();
            setRefreshing(false);
          }}
          aria-label="Refresh sessions"
        >
          <RefreshCw className={cn("size-3", refreshing && "animate-spin")} />
        </Button>
      </div>

      <nav className="space-y-0.5 px-2 pb-2" aria-label="Main">
        {navItems.map((item) => {
          const active =
            item.href === "/chat"
              ? pathname === "/chat" || pathname?.startsWith("/chat/")
              : pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring [&_svg]:text-muted-foreground",
                active
                  ? "bg-sidebar-accent text-foreground"
                  : "text-foreground/75 hover:bg-sidebar-accent/60 hover:text-foreground",
              )}
            >
              <item.icon className="size-4" strokeWidth={1.5} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mx-3 border-t border-border" />

      <ScrollArea className="sidebar-scroll min-h-0 w-full flex-1">
        <div className="w-full min-w-0 space-y-2 px-2 pb-4">
          {groups.length === 0 ? (
            <p className="px-2.5 pt-3 text-xs text-muted-foreground">
              {searching ? "No sessions match your search." : "No sessions yet. Start a new one."}
            </p>
          ) : (
            groups.map((group) => {
              const open = searching || expanded.has(group.key);
              const visible = open ? group.sessions : group.sessions.slice(0, GROUP_PREVIEW);
              const hidden = group.sessions.length - visible.length;
              return (
                <section key={group.key} className="min-w-0" aria-label={group.name}>
                  <div className="flex items-center gap-1 px-2.5 pb-1 pt-3">
                    {group.project ? (
                      <Link
                        href={`/projects/${group.project.id}`}
                        onClick={onNavigate}
                        className="min-w-0 flex-1 truncate rounded-sm text-[12px] font-medium text-foreground/90 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {group.name}
                      </Link>
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground/90">
                        {group.name}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="text-muted-foreground"
                      disabled={creating}
                      onClick={() =>
                        void (group.project ? createInProject(group.project) : create())
                      }
                      aria-label={`New session in ${group.name}`}
                    >
                      <Plus className="size-3" />
                    </Button>
                  </div>
                  <div className="space-y-0.5">
                    {visible.map((session) => (
                      <SessionRow
                        key={session.id}
                        session={session}
                        active={pathname === `/chat/${session.id}`}
                        busy={
                          statuses[session.id]?.type === "busy" ||
                          statuses[session.id]?.type === "retry"
                        }
                        needsInput={needsInput.has(session.id)}
                        harnessLabel={harnessLabel}
                        onNavigate={onNavigate}
                        onRename={(target) => {
                          setRenameTarget(target);
                          setTitleDraft(target.title);
                        }}
                        onDelete={setDeleteTarget}
                      />
                    ))}
                  </div>
                  {!searching && (hidden > 0 || open) && group.sessions.length > GROUP_PREVIEW ? (
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.key)}
                      className="mt-0.5 rounded-sm px-2.5 py-1 text-[12px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {hidden > 0 ? `Show ${hidden} more` : "Show less"}
                    </button>
                  ) : null}
                </section>
              );
            })
          )}
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t border-border p-2">
        <UserMenu connection={connection} onNavigate={onNavigate} />
      </div>

      <Dialog
        open={Boolean(renameTarget)}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename session</DialogTitle>
            <DialogDescription>Choose a short, recognizable title.</DialogDescription>
          </DialogHeader>
          <Input
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
            placeholder="Session title"
            autoFocus
            onKeyDown={(event) => {
              if (event.key === "Enter" && renameTarget && titleDraft.trim()) {
                const target = renameTarget;
                const title = titleDraft.trim();
                setRenameTarget(null);
                void renameSession(target.id, title)
                  .then(() => toast.success("Session renamed"))
                  .catch((error: unknown) =>
                    toast.error("Rename failed", {
                      description:
                        error instanceof Error ? error.message : undefined,
                    }),
                  );
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={!titleDraft.trim()}
              onClick={() => {
                if (!renameTarget) return;
                const target = renameTarget;
                const title = titleDraft.trim();
                setRenameTarget(null);
                void renameSession(target.id, title)
                  .then(() => toast.success("Session renamed"))
                  .catch((error: unknown) =>
                    toast.error("Rename failed", {
                      description:
                        error instanceof Error ? error.message : undefined,
                    }),
                  );
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this session?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.title}” and its messages will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (!deleteTarget) return;
                const target = deleteTarget;
                setDeleteTarget(null);
                void deleteSession(target.id)
                  .then(() => toast.success("Session deleted"))
                  .catch((error: unknown) =>
                    toast.error("Delete failed", {
                      description:
                        error instanceof Error ? error.message : undefined,
                    }),
                  );
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PermissionCenter() {
  const { pendingPermissions, respondPermission } = useAppData();
  const [busy, setBusy] = React.useState<string | null>(null);
  const permission = pendingPermissions[0];
  if (!permission) return null;

  async function respond(response: "once" | "always" | "reject") {
    if (!permission) return;
    setBusy(response);
    try {
      await respondPermission(permission, response);
    } catch (error) {
      toast.error("Could not send permission response", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  }

  const metadata = permission.metadata ?? {};
  const command =
    typeof metadata.command === "string"
      ? metadata.command
      : typeof metadata.description === "string"
        ? metadata.description
        : null;

  return (
    <Dialog open>
      <DialogContent
        className="sm:max-w-lg"
        showCloseButton={false}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <div className="mb-1 flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wider">
              permission
            </Badge>
            <Badge variant="secondary" className="font-mono text-[10px]">
              {permission.type}
            </Badge>
          </div>
          <DialogTitle className="text-balance">{permission.title}</DialogTitle>
          <DialogDescription>
            The agent is asking to perform an action in session{" "}
            <span className="font-mono text-[11px]">{permission.sessionID.slice(0, 16)}…</span>
          </DialogDescription>
        </DialogHeader>

        {command ? (
          <pre className="scrollbar-thin max-h-40 overflow-auto rounded-lg border border-border bg-muted/50 p-3 font-mono text-xs whitespace-pre-wrap">
            {command}
          </pre>
        ) : null}

        {permission.pattern ? (
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Pattern: </span>
            <span className="font-mono">
              {Array.isArray(permission.pattern)
                ? permission.pattern.join(", ")
                : permission.pattern}
            </span>
          </div>
        ) : null}

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="sm:mr-auto"
            disabled={Boolean(busy)}
            onClick={() => void respond("reject")}
          >
            {busy === "reject" ? <Loader2 className="size-4 animate-spin" /> : null}
            Reject
          </Button>
          <Button
            variant="secondary"
            disabled={Boolean(busy)}
            onClick={() => void respond("always")}
          >
            {busy === "always" ? <Loader2 className="size-4 animate-spin" /> : null}
            Allow always
          </Button>
          <Button disabled={Boolean(busy)} onClick={() => void respond("once")}>
            {busy === "once" ? <Loader2 className="size-4 animate-spin" /> : null}
            Allow once
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <TopBarSlotProvider>
      <AppShellFrame>{children}</AppShellFrame>
    </TopBarSlotProvider>
  );
}

function AppShellFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { sessions, harnessLabel, pendingPermissions } = useAppData();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  // One probe loop for the whole app: the top bar and the user menu share it.
  const connection = useConnection();
  const { create, creating } = useNewSession();
  const closeMobile = React.useCallback(() => setMobileOpen(false), []);

  const inChat = pathname === "/chat" || Boolean(pathname?.startsWith("/chat/"));

  const title = React.useMemo(() => {
    if (pathname === "/chat") return "New session";
    if (pathname?.startsWith("/chat/")) {
      const id = pathname.split("/")[2];
      return sessions.find((session) => session.id === id)?.title || "Session";
    }
    if (pathname?.startsWith("/files")) return "Files";
    if (pathname?.startsWith("/projects/")) return "Project";
    if (pathname?.startsWith("/projects")) return "Projects";
    if (pathname?.startsWith("/usage")) return "Usage";
    if (pathname?.startsWith("/settings")) return "Settings";
    return "Workspace";
  }, [pathname, sessions]);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <aside className="hidden w-[260px] shrink-0 lg:block">
        <SidebarContent connection={connection} />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-[300px] max-w-[85vw] p-0"
          showCloseButton={false}
          // Focus the panel itself: auto-focusing the first button would pop its tooltip.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.currentTarget as HTMLElement | null)?.focus();
          }}
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent connection={connection} onNavigate={closeMobile} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 bg-background px-3 sm:px-4">
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-4" />
          </Button>

          {inChat ? (
            <div className="flex min-w-0 items-center gap-1">
              <div className="flex h-8 min-w-0 max-w-[min(420px,50vw)] items-center gap-1 rounded-md border border-border bg-card pl-3 pr-1 text-[13px]">
                <span className="min-w-0 truncate pr-1">{title}</span>
                {pathname !== "/chat" ? (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground"
                    onClick={() => router.push("/chat")}
                    aria-label="Close session"
                  >
                    <X className="size-3.5" />
                  </Button>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                onClick={() => void create()}
                disabled={creating}
                aria-label="New session"
              >
                {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              </Button>
            </div>
          ) : (
            <h1 className="min-w-0 truncate text-[13px] font-medium">{title}</h1>
          )}

          <div className="ml-auto flex min-w-0 items-center gap-1">
            <TopBarSlotTarget className="flex min-w-0 items-center gap-1 empty:hidden" />
            <ConnectionStatus state={connection} harnessLabel={harnessLabel} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>

      <PermissionCenter />
      {pendingPermissions.length === 0 ? <QuestionCenter /> : null}
    </div>
  );
}
