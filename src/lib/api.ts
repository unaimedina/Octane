import { CSRF_COOKIE, CSRF_HEADER } from "./constants";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function readCsrfCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${CSRF_COOKIE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

let csrfPromise: Promise<string | null> | null = null;

/** Make sure the double-submit CSRF cookie exists before a mutation. */
export async function ensureCsrfToken(): Promise<string | null> {
  const existing = readCsrfCookie();
  if (existing) return existing;
  if (!csrfPromise) {
    csrfPromise = fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { csrfToken?: string } | null) => data?.csrfToken ?? readCsrfCookie())
      .catch(() => null)
      .finally(() => {
        csrfPromise = null;
      });
  }
  return csrfPromise;
}

async function errorFromResponse(response: Response): Promise<ApiError> {
  let message = `Request failed (${response.status})`;
  let code: string | undefined;
  try {
    const text = await response.text();
    if (text) {
      try {
        const data = JSON.parse(text) as { message?: string; error?: string };
        message = data.message ?? data.error ?? message;
        code = data.error;
      } catch {
        message = text.slice(0, 300);
      }
    }
  } catch {
    // keep the generic message
  }
  return new ApiError(message, response.status, code);
}

/** Fetch an OpenCode API path through the authenticated same-origin proxy. */
export async function api(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (!SAFE_METHODS.has(method)) {
    const csrf = await ensureCsrfToken();
    if (csrf) headers.set(CSRF_HEADER, csrf);
  }
  if (
    init.body &&
    typeof init.body === "string" &&
    !headers.has("content-type")
  ) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`/api${path}`, {
    ...init,
    method,
    headers,
    cache: "no-store",
  });

  if (response.status === 401 && typeof window !== "undefined") {
    const next = `${window.location.pathname}${window.location.search}`;
    // Full reload clears any stale client state after the cookie expires.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/login?next=${encodeURIComponent(next)}`);
    throw new ApiError("Session expired", 401, "unauthorized");
  }

  if (response.status === 403 && retry) {
    await fetch("/api/auth/session", { cache: "no-store" });
    return api(path, init, false);
  }

  if (!response.ok) throw await errorFromResponse(response);
  return response;
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await api(path, init);
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export function jsonBody(value: unknown): { body: string; headers: HeadersInit } {
  return {
    body: JSON.stringify(value),
    headers: { "content-type": "application/json" },
  };
}
