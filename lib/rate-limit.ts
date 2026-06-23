import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ADR-014: per-IP+embed_key rate limiting for the public chat widget flow.
// Sliding window via Upstash Redis. Fails OPEN: if Upstash is not configured or
// errors out, requests are allowed — infra issues must not block legit traffic.

let limiter: Ratelimit | null = null;
let warned = false;

function getLimiter(): Ratelimit | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (!warned) {
      console.warn(
        "[rate-limit] Upstash not configured — chat widget rate limiting disabled"
      );
      warned = true;
    }
    return null;
  }
  if (!limiter) {
    limiter = new Ratelimit({
      redis: new Redis({ url, token }),
      limiter: Ratelimit.slidingWindow(30, "60 s"),
      prefix: "chat-widget",
      analytics: false,
    });
  }
  return limiter;
}

// Returns true if allowed. Fails OPEN on missing creds or Upstash errors.
export async function checkChatRateLimit(key: string): Promise<boolean> {
  const l = getLimiter();
  if (!l) return true;
  try {
    const { success } = await l.limit(key);
    return success;
  } catch (err) {
    console.warn("[rate-limit] Upstash error, allowing request:", err);
    return true;
  }
}

export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
