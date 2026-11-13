"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { api, apiJson, jsonBody } from "@/lib/api";
import type {
  Agent,
  Event,
  HarnessId,
  HealthInfo,
  ModelOption,
  Path,
  Permission,
  Project,
  Session,
  SessionStatus,
  Skill,
} from "@/lib/types";
import type { UsageSummary } from "@/lib/usage";
import { normalizeQuestionRequest, type QuestionRequest } from "@/lib/questions";
import { mergePendingPermissions } from "@/lib/permissions";
import { isFinishTransition } from "@/lib/sound-triggers";
import { playSound, unlockAudio } from "@/lib/sounds";

type AppDataValue = {
  sessions: Session[];
  /** Projects of the signed-in user, for grouping sessions in the sidebar. */
  projects: Project[];
  statuses: Record<string, SessionStatus>;
  models: ModelOption[];
  defaultModel: { providerID: string; modelID: string } | null;
  agents: Agent[];
  skills: Skill[];
  pathInfo: Path | null;
  health: HealthInfo | null;
  usage: UsageSummary;
  username: string;
  harness: HarnessId;
  harnessLabel: string;
  connected: boolean;
  /** ms timestamp when every live stream went down; null while connected. */
  streamDownSince: number | null;
  pendingPermissions: Permission[];
  pendingQuestions: QuestionRequest[];
  replyQuestion: (request: QuestionRequest, answers: string[][]) => Promise<void>;
  rejectQuestion: (request: QuestionRequest) => Promise<void>;
  loadQuestions: (sessionID: string) => Promise<void>;
  /** Re-read pending permissions from the server (reconnect, focus, session open). */
  refreshPermissions: (sessionID?: string) => Promise<void>;
  createSession: (options?: { title?: string; directory?: string }) => Promise<Session>;
  renameSession: (id: string, title: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  refreshSessions: () => Promise<void>;
  refreshProjects: () => Promise<void>;
  /** Hide sessions (e.g. task workers) from the session lists. */
  hideSessions: (ids: string[]) => void;
  respondPermission: (permission: Permission, response: "once" | "always" | "reject") => Promise<void>;
  subscribe: (handler: (event: Event) => void) => () => void;
};

const AppDataContext = React.createContext<AppDataValue | null>(null);

function sortSessions(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => b.time.updated - a.time.updated);
}

function tagSession(session: Session): Session {
  return { ...session, harness: "opencode" } as Session;
}

function upsertSession(list: Session[], session: Session): Session[] {
  const tagged = tagSession(session);
  const index = list.findIndex((item) => item.id === tagged.id);
  if (index === -1) return sortSessions([tagged, ...list]);
  const next = [...list];
  next[index] = tagged;
  return sortSessions(next);
}

function errorText(error: unknown): string {
  if (error && typeof error === "object" && "data" in error) {
    const data = (error as { data?: { message?: string } }).data;
    if (data?.message) return data.message;
  }
  if (error instanceof Error) return error.message;
  return "The OpenCode server reported an error.";
}

export function AppDataProvider({
  initialSessions,
  initialProjects,
  initialModels,
  initialDefaultModel,
  initialAgents,
  initialSkills,
  initialPath,
  initialHealth,
  initialUsage,
  initialStatuses,
  initialPermissions,
  username,
  harness,
  harnessLabel,
  hiddenSessionIds,
  children,
}: {
  initialSessions: Session[];
  initialProjects: Project[];
  initialModels: ModelOption[];
  initialDefaultModel: { providerID: string; modelID: string } | null;
  initialAgents: Agent[];
  initialSkills: Skill[];
  initialPath: Path | null;
  initialHealth: HealthInfo | null;
  initialUsage: UsageSummary;
  initialStatuses: Record<string, SessionStatus>;
  initialPermissions: Permission[];
  username: string;
  harness: HarnessId;
  harnessLabel: string;
  hiddenSessionIds: string[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  // A ref, so learning about new hidden sessions never reconnects the event streams.
  const hiddenRef = React.useRef(new Set(hiddenSessionIds));
  const [sessions, setSessions] = React.useState(() => sortSessions(initialSessions));
  const [projects, setProjects] = React.useState(initialProjects);
  const [statuses, setStatuses] = React.useState(initialStatuses);
  const [pendingPermissions, setPendingPermissions] = React.useState<Permission[]>(
    () => initialPermissions,
  );
  const [pendingQuestions, setPendingQuestions] = React.useState<QuestionRequest[]>([]);
  const [connected, setConnected] = React.useState(false);
  const [streamDownSince, setStreamDownSince] = React.useState<number | null>(null);
  const handlers = React.useRef(new Set<(event: Event) => void>());
  const statusRef = React.useRef<Record<string, SessionStatus>>(initialStatuses);
  const sessionsRef = React.useRef(sessions);
  // Permission/question IDs already announced, so each one sounds once.
  // Page-load permissions are seeded here: they were pending before the page
  // existed, so restoring them must not replay the attention sound.
  const announcedRef = React.useRef(new Set<string>(initialPermissions.map((item) => item.id)));
  // id -> ms timestamp a permission arrived by live event (merge race guard).
  const liveArrivalsRef = React.useRef(new Map<string, number>());
  const permissionRefreshRef = React.useRef({ running: false, again: false });
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  const subscribe = React.useCallback((handler: (event: Event) => void) => {
    handlers.current.add(handler);
    return () => {
      handlers.current.delete(handler);
    };
  }, []);

  const hideSessions = React.useCallback((ids: string[]) => {
    let added = false;
    for (const id of ids) {
      if (!hiddenRef.current.has(id)) {
        hiddenRef.current.add(id);
        added = true;
      }
    }
    if (added) {
      setSessions((current) => current.filter((item) => !hiddenRef.current.has(item.id)));
    }
  }, []);

  const refreshSessions = React.useCallback(async () => {
    try {
      const [nextSessions, nextStatuses] = await Promise.all([
        apiJson<Session[]>("/sessions"),
        apiJson<Record<string, SessionStatus>>("/sessions/status").catch(() => ({})),
      ]);
      setSessions(sortSessions(nextSessions.map(tagSession)));
      statusRef.current = nextStatuses;
      setStatuses(nextStatuses);
    } catch {
      // A transient upstream failure should not wipe the sidebar.
    }
  }, []);

  const refreshProjects = React.useCallback(async () => {
    try {
      const data = await apiJson<{ projects: Project[] }>("/projects");
      setProjects(data.projects);
    } catch {
      // Keep the last known projects; grouping falls back gracefully.
    }
  }, []);

  /**
   * Catch-up read of pending permissions. Covers every running session plus an
   * optional session the user just opened, and merges the result so live
   * events keep working. Failures are ignored: this is a safety net.
   */
  const refreshPermissions = React.useCallback(async (sessionID?: string) => {
    const state = permissionRefreshRef.current;
    if (state.running) {
      state.again = true;
      return;
    }
    state.running = true;
    try {
      let nextSession = sessionID;
      do {
        state.again = false;
        const query = nextSession ? `?session=${encodeURIComponent(nextSession)}` : "";
        nextSession = undefined;
        try {
          const data = await apiJson<{ permissions?: Permission[]; scope?: string[] }>(
            `/permissions${query}`,
          );
          if (!mountedRef.current) return;
          const fetched = Array.isArray(data?.permissions) ? data.permissions : [];
          const scope = new Set(Array.isArray(data?.scope) ? data.scope : []);
          // Catch-up items were already pending; do not sound for them.
          for (const item of fetched) announcedRef.current.add(item.id);
          setPendingPermissions((current) =>
            mergePendingPermissions({
              current,
              fetched,
              scope,
              liveArrivals: liveArrivalsRef.current,
              now: Date.now(),
            }),
          );
        } catch {
          // Catch-up only; live events are the main path.
        }
      } while (state.again && mountedRef.current);
    } finally {
      state.running = false;
    }
  }, []);

  // Projects are created/renamed/deleted on /projects; refetch on navigation
  // so the sidebar groups stay current without coupling to those pages.
  const lastPathRef = React.useRef(pathname);
  React.useEffect(() => {
    if (lastPathRef.current === pathname) return;
    lastPathRef.current = pathname;
    void refreshProjects();
  }, [pathname, refreshProjects]);

  React.useEffect(() => {
    const sources: EventSource[] = [];
    let closed = false;
    let openCount = 0;
    let lastAuthCheck = 0;
    // A stream answered with an HTTP error (e.g. OpenCode down) is closed for
    // good by the browser; reopen it ourselves with a growing delay.
    const RETRY_MIN_MS = 2_000;
    const RETRY_MAX_MS = 30_000;
    let retryDelay = RETRY_MIN_MS;
    let retryTimer: number | undefined;

    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);

    // Only sessions the user sees in the sidebar make a finish sound.
    const isAudible = (id: string) => {
      if (hiddenRef.current.has(id)) return false;
      const known = sessionsRef.current.find((item) => item.id === id);
      return Boolean(known) && !known?.parentID;
    };
    const noteStatus = (id: string, next: SessionStatus) => {
      const prev = statusRef.current[id];
      statusRef.current = { ...statusRef.current, [id]: next };
      if (isFinishTransition(prev, next) && isAudible(id)) playSound("done");
    };
    const announce = (id: string) => {
      if (announcedRef.current.has(id)) return;
      announcedRef.current.add(id);
      playSound("attention");
    };

    const handleEvent = (event: Event) => {
      if (!event || typeof event.type !== "string") return;
      // The v1 SDK `Event` union has no question events, so read them loosely.
      const loose = event as unknown as { type: string; properties?: unknown };
      if (loose.type === "question.asked") {
        const request = normalizeQuestionRequest(loose.properties);
        if (request) {
          announce(request.id);
          setPendingQuestions((current) =>
            current.some((item) => item.id === request.id) ? current : [...current, request],
          );
        }
      } else if (loose.type === "question.replied" || loose.type === "question.rejected") {
        const props = (loose.properties ?? {}) as { requestID?: unknown };
        if (typeof props.requestID === "string") {
          setPendingQuestions((current) => current.filter((item) => item.id !== props.requestID));
        }
      }
      switch (event.type) {
        case "server.connected":
          setConnected(true);
          break;
        case "session.created":
        case "session.updated": {
          const incoming = event.properties.info ?? event.properties;
          if (incoming?.id && hiddenRef.current.has(incoming.id)) break;
          setSessions((current) => upsertSession(current, incoming));
          break;
        }
        case "session.deleted": {
          const deleted = event.properties.info;
          setSessions((current) =>
            current.filter((session) => session.id !== deleted.id),
          );
          break;
        }
        case "session.status":
          noteStatus(event.properties.sessionID, event.properties.status);
          setStatuses((current) => ({
            ...current,
            [event.properties.sessionID]: event.properties.status,
          }));
          break;
        case "session.idle":
          noteStatus(event.properties.sessionID, { type: "idle" });
          setStatuses((current) => ({
            ...current,
            [event.properties.sessionID]: { type: "idle" },
          }));
          break;
        case "permission.updated":
          announce(event.properties.id);
          liveArrivalsRef.current.set(event.properties.id, Date.now());
          setPendingPermissions((current) => {
            if (current.some((item) => item.id === event.properties.id)) return current;
            return [...current, event.properties];
          });
          break;
        case "permission.replied":
          liveArrivalsRef.current.delete(event.properties.permissionID);
          setPendingPermissions((current) =>
            current.filter((item) => item.id !== event.properties.permissionID),
          );
          break;
        case "session.error":
          toast.error("Session error", {
            description: errorText(event.properties.error),
          });
          break;
        default:
          break;
      }

      for (const handler of handlers.current) handler(event);
    };

    const connect = () => {
      const source = new EventSource("/api/events");
      sources.push(source);

      source.onopen = () => {
        if (closed) return;
        openCount += 1;
        retryDelay = RETRY_MIN_MS;
        setConnected(true);
        setStreamDownSince(null);
        void refreshSessions();
        void refreshProjects();
        void refreshPermissions();
      };

      source.onerror = () => {
        if (closed) return;
        openCount = Math.max(0, openCount - 1);
        if (openCount === 0) {
          setConnected(false);
          setStreamDownSince((current) => current ?? Date.now());
        }
        if (source.readyState === EventSource.CLOSED) {
          const index = sources.indexOf(source);
          if (index !== -1) sources.splice(index, 1);
          window.clearTimeout(retryTimer);
          retryTimer = window.setTimeout(() => {
            if (!closed) connect();
          }, retryDelay);
          retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
        }
        // EventSource reconnects forever on an expired cookie; detect that and
        // send the user back to the login screen instead of hanging silently.
        const now = Date.now();
        if (now - lastAuthCheck > 10_000) {
          lastAuthCheck = now;
          void fetch("/api/auth/session", { cache: "no-store" })
            .then((response) => (response.ok ? response.json() : null))
            .then((data: { authenticated?: boolean } | null) => {
              if (data && !data.authenticated) {
                // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                window.location.assign("/login");
              }
            })
            .catch(() => undefined);
        }
      };

      source.onmessage = (message) => {
        let event: Event;
        try {
          event = JSON.parse(message.data) as Event;
        } catch {
          return;
        }
        handleEvent(event);
      };
    };

    // Live events from the OpenCode server.
    connect();

    // Guarantees the CSRF cookie exists even for a restored session.
    void fetch("/api/auth/session", { cache: "no-store" }).catch(() => undefined);

    const onFocus = () => {
      if (document.visibilityState !== "visible") return;
      void refreshSessions();
      void refreshProjects();
      void refreshPermissions();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      closed = true;
      window.clearTimeout(retryTimer);
      for (const source of sources) source.close();
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [refreshSessions, refreshProjects, refreshPermissions]);

  const createSession = React.useCallback(
    async (options?: { title?: string; directory?: string }) => {
      let directory = options?.directory?.trim();
      if (!directory) {
        try {
          directory = window.localStorage.getItem("oc.rootFolder") ?? undefined;
        } catch {
          // storage unavailable
        }
      }
      const session = await apiJson<Session>("/sessions", {
        method: "POST",
        ...jsonBody({
          ...(options?.title ? { title: options.title } : {}),
          ...(directory ? { directory } : {}),
        }),
      });
      const tagged = tagSession(session);
      setSessions((current) => upsertSession(current, tagged));
      return tagged;
    },
    [],
  );

  const renameSession = React.useCallback(async (id: string, title: string) => {
    const session = await apiJson<Session>(`/sessions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      ...jsonBody({ title }),
    });
    setSessions((current) => upsertSession(current, session));
  }, []);

  const deleteSession = React.useCallback(
    async (id: string) => {
      await api(`/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
      setSessions((current) => current.filter((session) => session.id !== id));
      if (pathname?.includes(`/chat/${id}`)) router.push("/chat");
    },
    [pathname, router],
  );

  const respondPermission = React.useCallback(
    async (permission: Permission, response: "once" | "always" | "reject") => {
      await api(
        `/sessions/${encodeURIComponent(permission.sessionID)}/permissions/${encodeURIComponent(permission.id)}`,
        { method: "POST", ...jsonBody({ response }) },
      );
      liveArrivalsRef.current.delete(permission.id);
      setPendingPermissions((current) => current.filter((item) => item.id !== permission.id));
    },
    [],
  );

  const replyQuestion = React.useCallback(
    async (request: QuestionRequest, answers: string[][]) => {
      await api(
        `/sessions/${encodeURIComponent(request.sessionID)}/questions/${encodeURIComponent(request.id)}`,
        { method: "POST", ...jsonBody({ answers }) },
      );
      setPendingQuestions((current) => current.filter((item) => item.id !== request.id));
    },
    [],
  );

  const rejectQuestion = React.useCallback(async (request: QuestionRequest) => {
    await api(
      `/sessions/${encodeURIComponent(request.sessionID)}/questions/${encodeURIComponent(request.id)}`,
      { method: "DELETE" },
    );
    setPendingQuestions((current) => current.filter((item) => item.id !== request.id));
  }, []);

  const loadQuestions = React.useCallback(async (sessionID: string) => {
    try {
      const found = await apiJson<QuestionRequest[]>(
        `/sessions/${encodeURIComponent(sessionID)}/questions`,
      );
      if (!Array.isArray(found) || found.length === 0) return;
      // Catch-up questions were already pending; do not sound for them.
      for (const item of found) announcedRef.current.add(item.id);
      setPendingQuestions((current) => {
        const fresh = found.filter((item) => !current.some((known) => known.id === item.id));
        return fresh.length ? [...current, ...fresh] : current;
      });
    } catch {
      // Catch-up only; live events are the main path.
    }
  }, []);

  const value = React.useMemo<AppDataValue>(
    () => ({
      sessions,
      projects,
      statuses,
      models: initialModels,
      defaultModel: initialDefaultModel,
      agents: initialAgents,
      skills: initialSkills,
      pathInfo: initialPath,
      health: initialHealth,
      usage: initialUsage,
      username,
      harness,
      harnessLabel,
      connected,
      streamDownSince,
      pendingPermissions,
      pendingQuestions,
      replyQuestion,
      rejectQuestion,
      loadQuestions,
      refreshPermissions,
      createSession,
      renameSession,
      deleteSession,
      refreshSessions,
      refreshProjects,
      hideSessions,
      respondPermission,
      subscribe,
    }),
    [
      sessions,
      projects,
      statuses,
      initialModels,
      initialDefaultModel,
      initialAgents,
      initialSkills,
      initialPath,
      initialHealth,
      initialUsage,
      username,
      harness,
      harnessLabel,
      connected,
      streamDownSince,
      pendingPermissions,
      pendingQuestions,
      replyQuestion,
      rejectQuestion,
      loadQuestions,
      refreshPermissions,
      createSession,
      renameSession,
      deleteSession,
      refreshSessions,
      refreshProjects,
      hideSessions,
      respondPermission,
      subscribe,
    ],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataValue {
  const context = React.useContext(AppDataContext);
  if (!context) throw new Error("useAppData must be used inside AppDataProvider");
  return context;
}
