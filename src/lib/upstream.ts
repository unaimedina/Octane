import { serverAuthHeader, serverUrl } from "./env";

export type ApiFlavor = "v1" | "v2";

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

const DEFAULT_TIMEOUT = 20_000;

let flavorCache: { flavor: ApiFlavor; at: number } | null = null;

export function upstreamBase(): string {
  return serverUrl();
}

export function upstreamHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  headers.delete("cookie");
  headers.delete("host");
  headers.delete("authorization");
  const auth = serverAuthHeader();
  if (auth) headers.set("authorization", auth);
  return headers;
}

export async function upstreamFetch(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT, signal, ...rest } = init;
  const clean = path.startsWith("/") ? path : `/${path}`;
  const url = `${upstreamBase()}${clean}`;
  const timeout = timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : null;
  const combined =
    signal && timeout ? AbortSignal.any([signal, timeout]) : (signal ?? timeout);
  return fetch(url, {
    ...rest,
    headers: upstreamHeaders(rest.headers),
    cache: "no-store",
    signal: combined,
  });
}

export async function upstreamJson<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const response = await upstreamFetch(path, init);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new UpstreamError(
      body.slice(0, 600) || `Upstream responded with ${response.status}`,
      response.status,
    );
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new UpstreamError("Upstream returned invalid JSON", 502);
  }
}

/**
 * OpenCode v2 exposes the HttpApi under /api. Older builds expose the flat v1
 * API. Detect once and cache the result; OPENCODE_API_FLAVOR can force either.
 */
export async function apiFlavor(): Promise<ApiFlavor> {
  const forced = process.env.OPENCODE_API_FLAVOR;
  if (forced === "v1" || forced === "v2") return forced;

  if (flavorCache && Date.now() - flavorCache.at < 60_000) {
    return flavorCache.flavor;
  }

  try {
    const response = await upstreamFetch("/api/info", { timeoutMs: 2500 });
    if (response.ok) {
      const data = (await response.json()) as { version?: string; pid?: number };
      if (typeof data.version === "string" || typeof data.pid === "number") {
        flavorCache = { flavor: "v2", at: Date.now() };
        return "v2";
      }
    }
  } catch {
    // fall through to v1 probe
  }

  try {
    const response = await upstreamFetch("/global/health", { timeoutMs: 2500 });
    if (response.ok) {
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const data = (await response.json()) as { healthy?: boolean };
        if (data.healthy) {
          flavorCache = { flavor: "v1", at: Date.now() };
          return "v1";
        }
      }
    }
  } catch {
    // upstream unreachable; default to v2, the current generation
  }

  flavorCache = { flavor: "v2", at: Date.now() };
  return "v2";
}

export function resetFlavorCache(): void {
  flavorCache = null;
}

export type UpstreamProbe = {
  reachable: boolean;
  healthy: boolean;
  version: string | null;
  unauthorized: boolean;
  status: number | null;
};

/** Distinguish "server down" from "server rejected our Basic auth". */
export async function probeUpstream(): Promise<UpstreamProbe> {
  try {
    const flavor = await apiFlavor();
    const response = await upstreamFetch(
      flavor === "v2" ? "/api/info" : "/global/health",
      { timeoutMs: 4000 },
    );
    if (response.status === 401 || response.status === 403) {
      return {
        reachable: true,
        healthy: false,
        version: null,
        unauthorized: true,
        status: response.status,
      };
    }
    if (!response.ok) {
      return {
        reachable: true,
        healthy: false,
        version: null,
        unauthorized: false,
        status: response.status,
      };
    }
    const data = (await response.json()) as { version?: string };
    return {
      reachable: true,
      healthy: true,
      version: data.version ?? (flavor === "v2" ? "2" : null),
      unauthorized: false,
      status: response.status,
    };
  } catch {
    return {
      reachable: false,
      healthy: false,
      version: null,
      unauthorized: false,
      status: null,
    };
  }
}
