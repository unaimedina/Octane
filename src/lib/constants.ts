/** Shared between server and browser. Keep free of secrets. */

export const SESSION_COOKIE = "oc_session";
export const CSRF_COOKIE = "oc_csrf";
export const CSRF_HEADER = "x-oc-csrf";

/** Short-lived cookie carrying the Discord OAuth state and post-login redirect. */
export const DISCORD_STATE_COOKIE = "oc_discord_state";
/** 10 minutes is plenty for a Discord consent screen. */
export const DISCORD_STATE_TTL_SECONDS = 60 * 10;

/** 12 hours. Sessions are stateless signed tokens. */
export const SESSION_TTL_SECONDS = 60 * 60 * 12;

export const SESSION_ISSUER = "opencode-web";
export const SESSION_AUDIENCE = "opencode-web";

export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const RATE_LIMIT_MAX_ATTEMPTS = 8;
export const RATE_LIMIT_BLOCK_MS = 15 * 60 * 1000;
