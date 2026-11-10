import {
  createHash,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import {
  CSRF_COOKIE,
  SESSION_AUDIENCE,
  SESSION_COOKIE,
  SESSION_ISSUER,
  SESSION_TTL_SECONDS,
} from "./constants";
import { authSecret, authUsername, secureCookies } from "./env";

export type SessionInfo = {
  /** Stable identity: Discord user id, or the configured local username. */
  subject: string;
  username: string;
  issuedAt: number;
  expiresAt: number;
};

export type SessionIdentity = {
  /** Stable provider-specific id, e.g. the Discord user id. */
  subject?: string;
  /** Human readable name shown in the UI. */
  username?: string;
};

const SCRYPT_KEYLEN = 64;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCb(
      password,
      salt,
      keylen,
      { ...options, maxmem: 64 * 1024 * 1024 },
      (error, derived) => (error ? reject(error) : resolve(derived as Buffer)),
    );
  });
}

/** Create a hash suitable for AUTH_PASSWORD_HASH. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join(":");
}

async function verifyPasswordHash(password: string, stored: string): Promise<boolean> {
  // Current format uses ":" (Compose-safe); accept the older "$" format too.
  const [scheme, n, r, p, salt, hash] = stored.includes("$")
    ? stored.split("$")
    : stored.split(":");

  if (scheme !== "scrypt" || !n || !r || !p || !salt || !hash) return false;
  try {
    const expected = Buffer.from(hash, "base64");
    const derived = await scrypt(password, Buffer.from(salt, "base64"), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function verifyPlainPassword(password: string, expected: string): boolean {
  // Hash both sides so the comparison is constant time regardless of length.
  const a = createHash("sha256").update(password).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Verify a submitted password against AUTH_PASSWORD_HASH (preferred) or
 * AUTH_PASSWORD. Fails closed when neither is configured.
 */
export async function verifyLoginPassword(password: string): Promise<boolean> {
  if (typeof password !== "string" || password.length === 0 || password.length > 1024) {
    return false;
  }
  const hash = process.env.AUTH_PASSWORD_HASH;
  if (hash) return verifyPasswordHash(password, hash);
  const plain = process.env.AUTH_PASSWORD;
  if (plain) return verifyPlainPassword(password, plain);
  return false;
}

export async function createSessionToken(
  identity: SessionIdentity = {},
): Promise<{ token: string; expiresAt: number }> {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + SESSION_TTL_SECONDS;
  const subject = identity.subject ?? authUsername();
  const username = identity.username ?? subject;
  const token = await new SignJWT({ v: 1, name: username })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(subject)
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .setJti(randomBytes(18).toString("base64url"))
    .sign(authSecret());
  return { token, expiresAt };
}

export async function verifySessionToken(token: string | undefined): Promise<SessionInfo | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, authSecret(), {
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
      algorithms: ["HS256"],
    });
    return {
      subject:
        typeof payload.sub === "string" && payload.sub
          ? payload.sub
          : authUsername(),
      username:
        typeof payload.name === "string" && payload.name
          ? payload.name
          : (payload.sub ?? authUsername()),
      issuedAt: (payload.iat ?? 0) * 1000,
      expiresAt: (payload.exp ?? 0) * 1000,
    };
  } catch {
    return null;
  }
}

/** Read and verify the session from the incoming request (Server Components / Route Handlers). */
export async function getSession(): Promise<SessionInfo | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/** Use inside protected Server Components and layouts. */
export async function requireSession(): Promise<SessionInfo> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export function newCsrfToken(): string {
  return randomBytes(24).toString("base64url");
}

export type CookieSecure = boolean;

export async function setAuthCookies(
  token: string,
  csrfToken: string,
  secure: CookieSecure,
): Promise<void> {
  const store = await cookies();
  store.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  store.set({
    name: CSRF_COOKIE,
    value: csrfToken,
    httpOnly: false,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearAuthCookies(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(CSRF_COOKIE);
}

/**
 * Determine whether the public request is HTTPS. Reverse proxies terminate TLS
 * and forward the scheme in x-forwarded-proto.
 */
export function requestIsSecure(request: Request): boolean {
  const override = secureCookies();
  if (process.env.AUTH_COOKIE_SECURE === "true") return true;
  if (process.env.AUTH_COOKIE_SECURE === "false") return false;
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) {
    return forwarded.split(",")[0].trim() === "https";
  }
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return override;
  }
}

/** Same-origin check for credentialed state-changing requests. */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // Non-browser clients still need the CSRF header below.
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function tokensMatch(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}
