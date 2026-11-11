"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChartColumn,
  Check,
  ChevronsUpDown,
  FolderGit2,
  FolderKanban,
  FolderTree,
  Loader2,
  LogIn,
  LogOut,
  MessageSquare,
  Monitor,
  Moon,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  Sun,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { useAppData } from "@/components/app-data";
import { Wordmark } from "@/components/brand";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { readCsrfCookie } from "@/lib/api";
import { CSRF_HEADER } from "@/lib/constants";
import type { Session } from "@/lib/types";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/chat", label: "Chats", icon: MessageSquare },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/usage", label: "Usage", icon: ChartColumn },
  { href: "/files", label: "Files", icon: FolderTree },
  { href: "/settings", label: "Settings", icon: Settings2 },
] as const;

function dateBucket(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp);
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startYesterday = startToday - 86_400_000;
  if (timestamp >= startToday) return "Today";
  if (timestamp >= startYesterday) return "Yesterday";
  if (timestamp >= startToday - 7 * 86_400_000) return "Previous 7 days";
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString("en-US", { month: "long" });
  }
  return String(date.getFullYear());
}

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

function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Change theme">
          <Sun className="size-4 dark:hidden" />
          <Moon className="hidden size-4 dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => setTheme("light")}>
          <Sun className="size-4" /> Light
          {theme === "light" ? <Check className="ml-auto size-3.5" /> : null}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("dark")}>
          <Moon className="size-4" /> Dark
          {theme === "dark" ? <Check className="ml-auto size-3.5" /> : null}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("system")}>
          <Monitor className="size-4" /> System
          {theme === "system" ? <Check className="ml-auto size-3.5" /> : null}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SessionRow({
  session,
  active,
  busy,
  onRename,
  onDelete,
}: {
  session: Session;
  active: boolean;
  busy: boolean;
  onRename: (session: Session) => void;
  onDelete: (session: Session) => void;
}) {
  return (
    <div
      className={cn(
        "group/session relative flex w-full min-w-0 items-center gap-1 rounded-[10px] pr-1 transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "hover:bg-muted/50",
      )}
    >
      <Link
        href={`/chat/${session.id}`}
        prefetch={false}
        title={session.directory || session.title}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] px-2.5 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full transition-colors",
            busy
              ? "bg-success pulse-dot"
              : active
                ? "bg-brand"
                : "bg-muted-foreground/30",
          )}
        />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[13px]",
            active ? "font-medium text-sidebar-foreground" : "text-sidebar-foreground/80",
          )}
        >
          {session.title || "Untitled session"}
        </span>
        <span
          className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/60"
          suppressHydrationWarning
        >
          {busy ? "live" : timeAgo(session.time.updated)}
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
            <ShieldAlert className="size-4" /> Copy session ID
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

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const {
    sessions,
    statuses,
    health,
    pathInfo,
    username,
    harnessLabel,
    connected,
    createSession,
    deleteSession,
    renameSession,
    refreshSessions,
  } = useAppData();
  const pathname = usePathname();
  const router = useRouter();
  const searchRef = React.useRef<HTMLInputElement>(null);
  const [query, setQuery] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [renameTarget, setRenameTarget] = React.useState<Session | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Session | null>(null);
  const [titleDraft, setTitleDraft] = React.useState("");
  const newSessionRef = React.useRef<() => void>(() => undefined);

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

  const filtered = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return sessions;
    return sessions.filter(
      (session) =>
        session.title.toLowerCase().includes(term) ||
        session.id.toLowerCase().includes(term),
    );
  }, [query, sessions]);

  const grouped = React.useMemo(() => {
    const groups = new Map<string, Session[]>();
    for (const session of filtered) {
      const bucket = dateBucket(session.time.updated);
      const items = groups.get(bucket) ?? [];
      items.push(session);
      groups.set(bucket, items);
    }
    return [...groups.entries()];
  }, [filtered]);

  async function handleNewSession() {
    if (creating) return;
    setCreating(true);
    try {
      const session = await createSession();
      onNavigate?.();
      router.push(`/chat/${session.id}`);
    } catch (error) {
      toast.error("Could not create session", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setCreating(false);
    }
  }

  React.useEffect(() => {
    newSessionRef.current = () => void handleNewSession();
  });

  async function handleSignOut() {
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

  const directory = pathInfo?.directory?.split(/[\\/]/).filter(Boolean).pop();

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar/85 text-sidebar-foreground">
      <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border/70 px-3">
        <Link href="/chat" onClick={onNavigate} className="rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Wordmark />
        </Link>
      </div>

      <div className="space-y-3 px-3 pb-3">
        <Button
          onClick={handleNewSession}
          disabled={creating}
          className="brand-glow h-9 w-full justify-start gap-2"
        >
          {creating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          New session
          <span className="ml-auto rounded border border-primary-foreground/20 px-1 font-mono text-[9px] opacity-60">
            N
          </span>
        </Button>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search sessions"
            className="h-8 border-border/60 bg-card/40 pl-8 pr-10 text-[13px] shadow-none focus-visible:border-brand/40 focus-visible:bg-white/[0.05]"
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
            <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[8px] uppercase tracking-wider text-muted-foreground/50">
              Ctrl K
            </kbd>
          )}
        </div>
      </div>

      <nav className="space-y-0.5 px-2 pb-2">
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
              className={cn(
                "relative flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] [&_svg]:text-brand"
                  : "text-sidebar-foreground/65 hover:bg-muted/50 hover:text-sidebar-foreground",
              )}
            >
              {active ? (
                <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-brand" />
              ) : null}
              <item.icon className="size-4" />
              {item.label}
              {item.href === "/chat" ? (
                <span className="ml-auto font-mono text-[10px] text-muted-foreground/60">
                  {sessions.length}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="mx-3 border-t border-sidebar-border/70" />

      <div className="flex items-center justify-between px-4 pb-1.5 pt-3">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground/70">
          Sessions
        </span>
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

      <ScrollArea className="sidebar-scroll min-h-0 w-full flex-1">
        <div className="w-full min-w-0 space-y-4 px-2 pb-4">
          {grouped.length === 0 ? (
            <div className="mx-2 mt-2 rounded-lg border border-dashed border-sidebar-border px-3 py-6 text-center text-xs text-muted-foreground">
              {query ? "No sessions match your search." : "No sessions yet. Start a new one."}
            </div>
          ) : (
            grouped.map(([bucket, items]) => (
              <div key={bucket} className="min-w-0 space-y-0.5">
                <div className="px-2.5 pb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/55">
                  {bucket}
                </div>
                {items.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    active={pathname === `/chat/${session.id}`}
                    busy={
                      statuses[session.id]?.type === "busy" ||
                      statuses[session.id]?.type === "retry"
                    }
                    onRename={(target) => {
                      setRenameTarget(target);
                      setTitleDraft(target.title);
                    }}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t border-sidebar-border/70 p-2.5">
        <div className="glass-inset mb-2 flex items-center gap-2 rounded-[10px] px-2.5 py-2">
          <div className="grid size-7 shrink-0 place-items-center rounded-[8px] bg-muted text-muted-foreground">
            <FolderGit2 className="size-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium">
              {directory ?? "Workspace"}
            </div>
            <div className="truncate font-mono text-[10px] text-muted-foreground/70">
              {health?.version
                ? `${harnessLabel.toLowerCase()} ${health.version}`
                : "server offline"}
            </div>
          </div>
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              connected ? "bg-success" : "bg-warning",
            )}
            title={connected ? "Connected" : "Reconnecting"}
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-2 rounded-[10px] px-1.5 py-1.5 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring">
              <div className="grid size-7 shrink-0 place-items-center rounded-[8px] bg-brand text-[11px] font-semibold text-brand-foreground">
                {username.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">{username}</div>
                <div className="text-[10px] text-muted-foreground">Signed in</div>
              </div>
              <ChevronsUpDown className="size-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-52">
            <DropdownMenuLabel className="font-normal">
              <div className="flex items-center gap-2">
                {connected ? (
                  <Wifi className="size-3.5 text-success" />
                ) : (
                  <WifiOff className="size-3.5 text-warning" />
                )}
                <span className="text-xs">
                  {connected ? "Live connection" : "Reconnecting…"}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings#opencode-account">
                <LogIn className="size-4" /> OpenCode account
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings2 className="size-4" /> Server settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={handleSignOut} variant="destructive">
              <LogOut className="size-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
  const pathname = usePathname();
  const { sessions, health, connected, username, harnessLabel } = useAppData();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const title = React.useMemo(() => {
    if (pathname === "/chat") return "New session";
    if (pathname?.startsWith("/chat/")) {
      const id = pathname.split("/")[2];
      return sessions.find((session) => session.id === id)?.title ?? "Session";
    }
    if (pathname?.startsWith("/files")) return "Project files";
    if (pathname?.startsWith("/projects/")) return "Project";
    if (pathname?.startsWith("/projects")) return "Projects";
    if (pathname?.startsWith("/usage")) return "Usage";
    if (pathname?.startsWith("/settings")) return "Settings";
    return "Workspace";
  }, [pathname, sessions]);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-transparent">
      <aside className="hidden w-[320px] shrink-0 border-r border-sidebar-border lg:block">
        <SidebarContent />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[340px] p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass-bar flex h-12 shrink-0 items-center gap-2 border-b px-3 sm:px-4">
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </Button>

          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="hidden text-muted-foreground sm:inline">Workspace</span>
            <span className="hidden text-muted-foreground/40 sm:inline">/</span>
            <span className="truncate font-medium">{title}</span>
          </div>

          <div className="ml-auto flex items-center gap-1">
            <div
              className={cn(
                "mr-1 hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium sm:flex",
                connected
                  ? "border-success/20 bg-success/8 text-success dark:text-success"
                  : "border-warning/20 bg-warning/8 text-warning dark:text-warning",
              )}
              title={health?.version ? `${harnessLabel} ${health.version}` : undefined}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  connected ? "bg-success" : "bg-warning pulse-dot",
                )}
              />
              {connected ? "Live" : "Reconnecting"}
            </div>
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Account">
                  <div className="grid size-6 place-items-center rounded-[8px] bg-brand text-[10px] font-semibold text-brand-foreground">
                    {username.slice(0, 1).toUpperCase()}
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>
                  <div className="text-xs font-medium">{username}</div>
                  <div className="mt-0.5 text-[10px] font-normal text-muted-foreground">
                    {health?.version ? `${harnessLabel} ${health.version}` : "OCTANE"}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <Settings2 className="size-4" /> Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => {
                    void fetch("/api/auth/logout", {
                      method: "POST",
                      headers: { [CSRF_HEADER]: readCsrfCookie() ?? "" },
                      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                    }).finally(() => window.location.assign("/login"));
                  }}
                >
                  <LogOut className="size-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>

      <PermissionCenter />
    </div>
  );
}
