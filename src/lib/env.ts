/** Server-side environment access. Never import this from client components. */

const DEV_SECRET = "opencode-web-development-secret-change-me";

export function serverUrl(): string {
  return (process.env.OPENCODE_SERVER_URL ?? "http://127.0.0.1:4096").replace(
    /\/+$/,
    "",
  );
}

export function serverDisplayUrl(): string {
  try {
    const url = new URL(serverUrl());
    return `${url.protocol}//${url.host}`;
  } catch {
    return "invalid upstream url";
  }
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
