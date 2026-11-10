import {
  RATE_LIMIT_BLOCK_MS,
  RATE_LIMIT_MAX_ATTEMPTS,
  RATE_LIMIT_WINDOW_MS,
} from "./constants";

type Bucket = {
  attempts: number;
  windowStart: number;
  blockedUntil: number;
};

/**
 * In-memory, per-instance rate limiter for login attempts.
 *
 * This is deliberately dependency free. For horizontally scaled deployments
 * put Redis (or an edge WAF) in front, or swap this module for a shared store.
 */
const buckets = new Map<string, Bucket>();

function cleanup(now: number) {
  if (buckets.size < 2000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.blockedUntil < now && now - bucket.windowStart > RATE_LIMIT_WINDOW_MS) {
      buckets.delete(key);
    }
  }
}

export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return (
    headers.get("cf-connecting-ip") ??
    headers.get("x-real-ip") ??
    "unknown"
  );
}

export type RateLimitState = {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
};

export function checkRateLimit(key: string): RateLimitState {
  const now = Date.now();
  cleanup(now);
  const bucket = buckets.get(key);
  if (!bucket) {
    return { allowed: true, retryAfterSeconds: 0, remaining: RATE_LIMIT_MAX_ATTEMPTS };
  }
  if (bucket.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((bucket.blockedUntil - now) / 1000),
      remaining: 0,
    };
  }
  if (now - bucket.windowStart > RATE_LIMIT_WINDOW_MS) {
    buckets.delete(key);
    return { allowed: true, retryAfterSeconds: 0, remaining: RATE_LIMIT_MAX_ATTEMPTS };
  }
  return {
    allowed: true,
    retryAfterSeconds: 0,
    remaining: Math.max(0, RATE_LIMIT_MAX_ATTEMPTS - bucket.attempts),
  };
}

export function registerFailure(key: string): RateLimitState {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart > RATE_LIMIT_WINDOW_MS) {
    bucket = { attempts: 0, windowStart: now, blockedUntil: 0 };
    buckets.set(key, bucket);
  }
  bucket.attempts += 1;
  if (bucket.attempts >= RATE_LIMIT_MAX_ATTEMPTS) {
    bucket.blockedUntil = now + RATE_LIMIT_BLOCK_MS;
    bucket.attempts = 0;
    bucket.windowStart = now;
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(RATE_LIMIT_BLOCK_MS / 1000),
      remaining: 0,
    };
  }
  return {
    allowed: true,
    retryAfterSeconds: 0,
    remaining: RATE_LIMIT_MAX_ATTEMPTS - bucket.attempts,
  };
}

export function resetRateLimit(key: string): void {
  buckets.delete(key);
}
