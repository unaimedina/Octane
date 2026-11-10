import { discordConfigured } from "./env";

const DISCORD_API = "https://discord.com/api/v10";
const DISCORD_AUTHORIZE = "https://discord.com/oauth2/authorize";

export type DiscordConfig = {
  clientId: string;
  clientSecret: string;
  botToken: string;
  guildId: string;
  roleId: string;
  redirectUri: string;
};

export type DiscordUser = {
  id: string;
  username: string;
  global_name?: string | null;
};

export type DiscordAuthErrorCode =
  | "not_configured"
  | "discord_error"
  | "not_member"
  | "role_required"
  | "guild_not_found"
  | "bot_error";

export class DiscordAuthError extends Error {
  readonly code: DiscordAuthErrorCode;
  readonly status?: number;
  /** Discord's own JSON error code (e.g. 10004 Unknown Guild, 10007 Unknown Member). */
  readonly discordCode?: number;

  constructor(
    code: DiscordAuthErrorCode,
    message: string,
    status?: number,
    discordCode?: number,
  ) {
    super(message);
    this.name = "DiscordAuthError";
    this.code = code;
    this.status = status;
    this.discordCode = discordCode;
  }
}

export function discordConfig(): DiscordConfig {
  return {
    clientId: process.env.DISCORD_CLIENT_ID ?? "",
    clientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
    botToken: process.env.DISCORD_BOT_TOKEN ?? "",
    guildId: process.env.DISCORD_GUILD_ID ?? "",
    roleId: process.env.DISCORD_ROLE_ID ?? "",
    redirectUri: process.env.DISCORD_REDIRECT_URI ?? "",
  };
}

/**
 * Public origin of the request. Reverse proxies terminate TLS and forward the
 * scheme/host, so `request.url` is not reliable behind them.
 */
export function publicOrigin(request: Request): string {
  let fallbackProtocol = "http:";
  let fallbackHost = "localhost";
  try {
    const url = new URL(request.url);
    fallbackProtocol = url.protocol;
    fallbackHost = url.host;
  } catch {
    // keep defaults
  }
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ||
    fallbackProtocol.replace(":", "");
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0].trim() ||
    request.headers.get("host") ||
    fallbackHost;
  return `${proto}://${host}`;
}

/** The redirect URI must match exactly in the authorize and token requests. */
export function discordRedirectUri(request: Request): string {
  const configured = discordConfig().redirectUri;
  return configured || `${publicOrigin(request)}/api/auth/discord/callback`;
}

export function discordAuthorizeUrl(state: string, redirectUri: string): string {
  const url = new URL(DISCORD_AUTHORIZE);
  url.searchParams.set("client_id", discordConfig().clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "identify");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

async function discordFetch(
  path: string,
  init: RequestInit,
  failureCode: DiscordAuthErrorCode,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${DISCORD_API}${path}`, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new DiscordAuthError(
      "discord_error",
      "Discord could not be reached. Try again in a moment.",
    );
  }
  if (!response.ok) {
    let discordCode: number | undefined;
    try {
      const body = (await response.json()) as { code?: unknown };
      if (typeof body.code === "number") discordCode = body.code;
    } catch {
      // non-JSON error body
    }
    throw new DiscordAuthError(
      failureCode,
      `Discord request failed with status ${response.status}.`,
      response.status,
      discordCode,
    );
  }
  return response;
}

export async function exchangeDiscordCode(
  code: string,
  redirectUri: string,
): Promise<string> {
  const config = discordConfig();
  if (!discordConfigured()) {
    throw new DiscordAuthError("not_configured", "Discord sign-in is not configured.");
  }
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  const response = await discordFetch(
    "/oauth2/token",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    },
    "discord_error",
  );
  const data = (await response.json().catch(() => null)) as
    | { access_token?: unknown }
    | null;
  const accessToken = typeof data?.access_token === "string" ? data.access_token : "";
  if (!accessToken) {
    throw new DiscordAuthError("discord_error", "Discord did not return an access token.");
  }
  return accessToken;
}

export async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
  const response = await discordFetch(
    "/users/@me",
    { headers: { authorization: `Bearer ${accessToken}` } },
    "discord_error",
  );
  const data = (await response.json().catch(() => null)) as
    | { id?: unknown; username?: unknown; global_name?: unknown }
    | null;
  if (typeof data?.id !== "string" || !data.id) {
    throw new DiscordAuthError("discord_error", "Discord did not return a user id.");
  }
  return {
    id: data.id,
    username: typeof data.username === "string" ? data.username : "Discord user",
    global_name: typeof data.global_name === "string" ? data.global_name : null,
  };
}

/** Uses the bot token to read the member's roles in the configured guild. */
export async function fetchGuildMemberRoles(userId: string): Promise<string[]> {
  const config = discordConfig();
  const response = await discordFetch(
    `/guilds/${encodeURIComponent(config.guildId)}/members/${encodeURIComponent(userId)}`,
    { headers: { authorization: `Bot ${config.botToken}` } },
    "bot_error",
  );
  const data = (await response.json().catch(() => null)) as
    | { roles?: unknown }
    | null;
  return Array.isArray(data?.roles)
    ? data.roles.filter((role): role is string => typeof role === "string")
    : [];
}

export async function requireDiscordRole(userId: string): Promise<void> {
  const config = discordConfig();
  let roles: string[];
  try {
    roles = await fetchGuildMemberRoles(userId);
  } catch (error) {
    if (error instanceof DiscordAuthError) {
      // 10004 = Unknown Guild: the bot is not in the guild or the id is wrong.
      if (error.discordCode === 10004) {
        throw new DiscordAuthError(
          "guild_not_found",
          "The configured bot cannot see the Discord guild. Check DISCORD_GUILD_ID and invite the bot.",
          error.status,
          error.discordCode,
        );
      }
      // 10007 = Unknown Member: the user is not in the guild.
      if (error.discordCode === 10007 || error.status === 404) {
        throw new DiscordAuthError(
          "not_member",
          "Join the Discord server before signing in.",
          error.status,
          error.discordCode,
        );
      }
    }
    throw error;
  }
  if (!roles.includes(config.roleId)) {
    throw new DiscordAuthError(
      "role_required",
      "Your Discord account does not have the required role.",
    );
  }
}

export function discordDisplayName(user: DiscordUser): string {
  const name = user.global_name?.trim() || user.username.trim();
  return name || `discord:${user.id}`;
}
