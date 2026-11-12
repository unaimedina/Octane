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
  Session,
  SessionStatus,
  Skill,
} from "@/lib/types";
import type { UsageSummary } from "@/lib/usage";
import { normalizeQuestionRequest, type QuestionRequest } from "@/lib/questions";

type AppDataValue = {
  sessions: Session[];
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
  pendingPermissions: Permission[];
  pendingQuestions: QuestionRequest[];
  replyQuestion: (request: QuestionRequest, answers: string[][]) => Promise<void>;
  rejectQuestion: (request: QuestionRequest) => Promise<void>;
  loadQuestions: (sessionID: string) => Promise<void>;
  createSession: (options?: { title?: string; directory?: string }) => Promise<Session>;
  renameSession: (id: string, title: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  refreshSessions: () => Promise<void>;
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
  initialModels,
  initialDefaultModel,
  initialAgents,
  initialSkills,
  initialPath,
  initialHealth,
  initialUsage,
  initialStatuses,
  username,
  harness,
  harnessLabel,
  hiddenSessionIds,
  children,
}: {
  initialSessions: Session[];
  initialModels: ModelOption[];
  initialDefaultModel: { providerID: string; modelID: string } | null;
  initialAgents: Agent[];
  initialSkills: Skill[];
  initialPath: Path | null;
  initialHealth: HealthInfo | null;
  initialUsage: UsageSummary;
  initialStatuses: Record<string, SessionStatus>;
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
  const [statuses, setStatuses] = React.useState(initialStatuses);
  const [pendingPermissions, setPendingPermissions] = React.useState<Permission[]>([]);
  const [pendingQuestions, setPendingQuestions] = React.useState<QuestionRequest[]>([]);
  const [connected, setConnected] = React.useState(false);
  const handlers = React.useRef(new Set<(event: Event) => void>());

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
      setStatuses(nextStatuses);
    } catch {
      // A transient upstream failure should not wipe the sidebar.
    }
  }, []);

  React.useEffect(() => {
    const sources: EventSource[] = [];
    let closed = false;
    let openCount = 0;
    let lastAuthCheck = 0;

    const handleEvent = (event: Event) => {
      if (!event || typeof event.type !== "string") return;
      // The v1 SDK `Event` union has no question events, so read them loosely.
      const loose = event as unknown as { type: string; properties?: unknown };
      if (loose.type === "question.asked") {
        const request = normalizeQuestionRequest(loose.properties);
        if (request) {
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
          setStatuses((current) => ({
            ...current,
            [event.properties.sessionID]: event.properties.status,
          }));
          break;
        case "session.idle":
          setStatuses((current) => ({
            ...current,
            [event.properties.sessionID]: { type: "idle" },
          }));
          break;
        case "permission.updated":
          setPendingPermissions((current) => {
            if (current.some((item) => item.id === event.properties.id)) return current;
            return [...current, event.properties];
          });
          break;
        case "permission.replied":
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
        setConnected(true);
        void refreshSessions();
      };

      source.onerror = () => {
        if (closed) return;
        openCount = Math.max(0, openCount - 1);
        if (openCount === 0) setConnected(false);
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
      if (document.visibilityState === "visible") void refreshSessions();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      closed = true;
      for (const source of sources) source.close();
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshSessions]);

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
      pendingPermissions,
      pendingQuestions,
      replyQuestion,
      rejectQuestion,
      loadQuestions,
      createSession,
      renameSession,
      deleteSession,
      refreshSessions,
      hideSessions,
      respondPermission,
      subscribe,
    }),
    [
      sessions,
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
      pendingPermissions,
      pendingQuestions,
      replyQuestion,
      rejectQuestion,
      loadQuestions,
      createSession,
      renameSession,
      deleteSession,
      refreshSessions,
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
