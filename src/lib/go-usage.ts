/**
 * OpenCode Go account usage.
 *
 * Server-only. The endpoint and the credential handling below are described in
 * `plans/022-usage-opencode-go-limits.md`.
 *
 * The endpoint is undocumented and may change or disappear. Every failure is a
 * value (`GoUsageResult`), never a throw, so `/usage` always renders.
 *
 * The credential is read-only: it is never logged, cached, written back or
 * returned to the browser. `getGoUsage` only returns normalized percentages.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { opencodeGoApiKey, opencodeUsersDir, perUserServers } from "./env.ts";
import { userKey } from "./user-key.ts";

export const GO_USAGE_URL = "https://opencode.ai/zen/go/v1/usage";
const TIMEOUT_MS = 3_000;

export type GoUsageWindowId = "rolling" | "weekly" | "monthly";

export type GoUsageWindow = {
  id: GoUsageWindowId;
  /** Percentage used, 0..100. */
  percent: number;
  status: "ok" | "rate-limited";
  resetsAt: number | null;
};

export type GoUsageFailure = "no-key" | "unauthorized" | "unreachable" | "invalid";

export type GoUsageResult =
  | { ok: true; windows: GoUsageWindow[] }
  | { ok: false; reason: GoUsageFailure };

/** Trim and strip a leading `Bearer ` from a stored credential. */
export function cleanKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let key = value.trim();
  if (!key) return null;
  const bearer = key.match(/^bearer\s+(.*)$/i);
  if (bearer) {
    key = bearer[1].trim();
  } else if (/^bearer$/i.test(key)) {
    return null;
  }
  return key || null;
}

/**
 * Pick a usable bearer token from an OpenCode `auth.json` payload.
 *
 * - `opencode-go` is preferred over `opencode`.
 * - `api` / `zen` entries carry `key`.
 * - `oauth` / `wellknown` entries carry `access`, valid only before `expires`.
 *
 * `refresh` is never read.
 */
export function pickCredential(auth: unknown, now = Date.now()): string | null {
  if (!auth || typeof auth !== "object") return null;
  const providers = auth as Record<string, unknown>;

  for (const provider of ["opencode-go", "opencode"]) {
    const entry = providers[provider];
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const type = record.type;

    if (type === "api" || type === "zen") {
      const key = cleanKey(record.key);
      if (key) return key;
      continue;
    }

    if (type === "oauth" || type === "wellknown") {
      const expires = record.expires;
      if (typeof expires !== "number" || !(expires > now)) continue;
      const token = cleanKey(record.access);
      if (token) return token;
    }
  }

  return null;
}

/** `<OPENCODE_USERS_DIR>/<userKey>/.local/share/opencode/auth.json` */
export function authFilePath(subject: string): string {
  return path.join(
    opencodeUsersDir(),
    userKey(subject),
    ".local",
    "share",
    "opencode",
    "auth.json",
  );
}

function normalizeWindow(
  id: GoUsageWindowId,
  entry: unknown,
): GoUsageWindow | null {
  if (!entry || typeof entry !== "object") return null;
  const record = entry as Record<string, unknown>;
  const percent = record.percent;
  if (typeof percent !== "number" || !Number.isFinite(percent)) return null;

  const parsed = typeof record.resetsAt === "string" ? Date.parse(record.resetsAt) : Number.NaN;

  return {
    id,
    percent: Math.min(100, Math.max(0, percent)),
    status: record.status === "rate-limited" ? "rate-limited" : "ok",
    resetsAt: Number.isFinite(parsed) ? parsed : null,
  };
}

/**
 * Normalize the documented payload:
 * `{ usage: { rolling, weekly, monthly: { status, percent, resetsAt } } }`.
 *
 * `rolling` and `weekly` are required; `monthly` is optional so the page can
 * degrade when the endpoint omits it.
 */
export function normalizeGoUsage(payload: unknown): GoUsageResult {
  if (!payload || typeof payload !== "object") return { ok: false, reason: "invalid" };
  const usage = (payload as Record<string, unknown>).usage;
  if (!usage || typeof usage !== "object") return { ok: false, reason: "invalid" };
  const windows = usage as Record<string, unknown>;

  const rolling = normalizeWindow("rolling", windows.rolling);
  const weekly = normalizeWindow("weekly", windows.weekly);
  const monthly = normalizeWindow("monthly", windows.monthly);
  if (!rolling || !weekly) return { ok: false, reason: "invalid" };

  return { ok: true, windows: monthly ? [rolling, weekly, monthly] : [rolling, weekly] };
}

async function keyFor(subject: string): Promise<string | null> {
  if (perUserServers()) {
    try {
      const raw = await fs.readFile(authFilePath(subject), "utf8");
      const key = pickCredential(JSON.parse(raw));
      if (key) return key;
    } catch {
      // Missing, unreadable or malformed auth.json is a handled state.
    }
  }
  return cleanKey(opencodeGoApiKey());
}

/**
 * Read the account limits. Never throws and never exposes the credential.
 */
export async function getGoUsage(subject: string): Promise<GoUsageResult> {
  const key = await keyFor(subject);
  if (!key) return { ok: false, reason: "no-key" };

  let response: Response;
  try {
    response = await fetch(GO_USAGE_URL, {
      headers: {
        authorization: `Bearer ${key}`,
        accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // Network error or timeout. Do not include the key in any message.
    return { ok: false, reason: "unreachable" };
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, reason: "unauthorized" };
  }
  if (!response.ok) return { ok: false, reason: "unreachable" };

  try {
    return normalizeGoUsage(await response.json());
  } catch {
    return { ok: false, reason: "invalid" };
  }
}
