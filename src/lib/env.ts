/** Server-side environment access. Never import this from client components. */

import os from "node:os";
import path from "node:path";

const DEV_SECRET = "opencode-web-development-secret-change-me";

export type ServerMode = "shared" | "per-user";

/**
 * How OpenCode servers are provisioned.
 *
 * - per-user (default): OCTANE spawns a dedicated `opencode serve` process for
 *   every signed-in user, with its own data directory. Sessions, provider keys
 *   and OpenCode Console logins are isolated.
 * - shared: every user talks to the single `OPENCODE_SERVER_URL` server.
 */
export function serverMode(): ServerMode {
  const value = process.env.OPENCODE_SERVER_MODE?.trim().toLowerCase();
  return value === "shared" || value === "single" ? "shared" : "per-user";
}

export function perUserServers(): boolean {
  return serverMode() === "per-user";
}

/** OpenCode server used only in shared mode. */
export function serverUrl(): string {
  return (process.env.OPENCODE_SERVER_URL ?? "http://127.0.0.1:4096").replace(
    /\/+$/,
    "",
  );
}

/** CLI invoked to start a user's OpenCode server. */
export function opencodeBin(): string {
  return process.env.OPENCODE_BIN?.trim() || "opencode";
}

/** Base folder holding one isolated OpenCode data directory per user. */
export function opencodeUsersDir(): string {
  const configured = process.env.OPENCODE_USERS_DIR?.trim();
  if (configured) return path.resolve(configured);
  return path.join(os.homedir(), ".local", "share", "octane", "users");
}

/** Working directory used by per-user OpenCode servers. */
export function opencodeWorkspace(): string {
  const configured = process.env.OPENCODE_WORKSPACE?.trim();
  return configured ? path.resolve(configured) : process.cwd();
}

/** Base folder for OCTANE-owned metadata (projects, tasks, GitHub connections). */
export function octaneDataDir(): string {
  const configured = process.env.OCTANE_DATA_DIR?.trim();
  if (configured) return path.resolve(configured);
  return path.join(os.homedir(), ".local", "share", "octane-data");
}

/** GitHub OAuth App is optional; without it local projects still work. */
export function githubConfigured(): boolean {
  return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}

export function githubScopes(): string {
  return process.env.GITHUB_SCOPES?.trim() || "read:user repo";
}

/** Skills installed from Settings, shared by every user's server. */
export function opencodeSkillsDir(): string | null {
  return process.env.OPENCODE_SKILLS_DIR?.trim() || null;
}

export function serverAuthHeader(): string | null {
  const password = process.env.OPENCODE_SERVER_PASSWORD;
  if (!password) return null;
  const username = process.env.OPENCODE_SERVER_USERNAME ?? "opencode";
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

export function authUsername(): string {
  return process.env.AUTH_USERNAME ?? "opencode";
}

/** Discord sign-in needs the OAuth app and a bot allowed to read guild roles. */
export function discordConfigured(): boolean {
  return Boolean(
    process.env.DISCORD_CLIENT_ID &&
      process.env.DISCORD_CLIENT_SECRET &&
      process.env.DISCORD_BOT_TOKEN &&
      process.env.DISCORD_GUILD_ID &&
      process.env.DISCORD_ROLE_ID,
  );
}

/** Password sign-in uses AUTH_PASSWORD_HASH (preferred) or AUTH_PASSWORD. */
export function passwordConfigured(): boolean {
  return Boolean(process.env.AUTH_PASSWORD_HASH || process.env.AUTH_PASSWORD);
}

/** At least one sign-in method must be configured. */
export function authConfigured(): boolean {
  return discordConfigured() || passwordConfigured();
}

export function authSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length >= 16) {
    return new TextEncoder().encode(secret);
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET is missing or too short. Set AUTH_SECRET to a random string of at least 32 characters.",
    );
  }
  return new TextEncoder().encode(DEV_SECRET);
}

/** Whether cookies should carry the Secure flag. Set explicitly when TLS is terminated upstream. */
export function secureCookies(): boolean {
  const value = process.env.AUTH_COOKIE_SECURE;
  if (value === "true") return true;
  if (value === "false") return false;
  return process.env.NODE_ENV === "production";
}
