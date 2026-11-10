import { AsyncLocalStorage } from "node:async_hooks";
import { cache } from "react";
import { getSession, type SessionInfo } from "./auth";
import { perUserServers, serverAuthHeader, serverMode, serverUrl, type ServerMode } from "./env";
import { managedServerFor } from "./user-servers";

/** The OpenCode server that should receive the current request. */
export type UpstreamTarget = {
  mode: ServerMode;
  url: string;
  authHeader: string | null;
};

const boundTarget = new AsyncLocalStorage<UpstreamTarget>();

export function sharedTarget(): UpstreamTarget {
  return {
    mode: "shared",
    url: serverUrl(),
    authHeader: serverAuthHeader(),
  };
}

/**
 * Bind a request (or a long-lived SSE stream) to one user's server. Event
 * proxy callbacks run outside the original cookie scope, so they must inherit
 * the target explicitly instead of re-reading the session.
 */
export function runWithUpstream<T>(target: UpstreamTarget, fn: () => T): T {
  return boundTarget.run(target, fn);
}

export function upstreamForSession(session: SessionInfo): Promise<UpstreamTarget> {
  if (!perUserServers()) return Promise.resolve(sharedTarget());
  return managedServerFor(session.subject, session.username).then((server) => ({
    mode: "per-user" as const,
    url: server.url,
    authHeader: server.authHeader,
  }));
}

async function resolveRequestUpstream(): Promise<UpstreamTarget> {
  if (!perUserServers()) return sharedTarget();
  const session = await getSession();
  if (!session) {
    throw new Error("Sign in to reach your OpenCode server.");
  }
  return upstreamForSession(session);
}

/**
 * Per-request target. In per-user mode this starts (or reuses) the signed-in
 * user's server on first use. `cache` deduplicates the work across parallel
 * server-components and route-handler calls in the same request.
 */
export const currentUpstream = cache(async (): Promise<UpstreamTarget> => {
  const explicit = boundTarget.getStore();
  if (explicit) return explicit;
  return resolveRequestUpstream();
});

/** Endpoint shown in Settings, without credentials. */
export async function currentServerDisplay(): Promise<{
  url: string;
  mode: ServerMode;
}> {
  try {
    const target = await currentUpstream();
    const url = new URL(target.url);
    return { url: `${url.protocol}//${url.host}`, mode: target.mode };
  } catch (error) {
    return {
      url: error instanceof Error ? error.message : "unavailable",
      mode: serverMode(),
    };
  }
}
