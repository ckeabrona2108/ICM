import { NextResponse } from "next/server";

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
}

const globalStore = globalThis as typeof globalThis & {
  __icmRateLimitBuckets?: Map<string, RateLimitBucket>;
};

const buckets = globalStore.__icmRateLimitBuckets ?? new Map<string, RateLimitBucket>();
globalStore.__icmRateLimitBuckets = buckets;

export function getRequestIp(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwarded = request.headers.get("x-forwarded-for")
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return forwarded?.at(-1) || "unknown";
}

export function consumeRateLimit(options: RateLimitOptions, now = Date.now()) {
  const current = buckets.get(options.key);
  if (!current || current.resetAt <= now) {
    buckets.set(options.key, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true, remaining: Math.max(0, options.limit - 1), retryAfterSeconds: 0 };
  }

  current.count += 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  return {
    allowed: current.count <= options.limit,
    remaining: Math.max(0, options.limit - current.count),
    retryAfterSeconds
  };
}

export function enforceRateLimit(options: RateLimitOptions): NextResponse | null {
  const result = consumeRateLimit(options);
  if (result.allowed) return null;

  return NextResponse.json(
    { error: "Слишком много запросов. Повторите попытку позже." },
    {
      status: 429,
      headers: { "Retry-After": String(result.retryAfterSeconds) }
    }
  );
}
