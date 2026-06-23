// ADR-014: validation + matching for the per-company embed/origin allowlist
// (`text_agents.allowed_origins`). Pure and unit-testable — no DB, no HTTP.
//
// The stored/compared value is always `URL.origin` (scheme://host[:port], no
// path/query/fragment). Only http(s) origins are accepted.

export const MAX_ALLOWED_ORIGINS = 20;
const MAX_ORIGIN_LENGTH = 200;

// Normalize "https://Example.com/" → "https://example.com". Lowercases the
// host (via URL), strips any path/query/fragment, keeps an explicit port.
// Returns null if not a valid http(s) origin (incl. "javascript:", a path
// beyond "/", or opaque "null" origins).
export function normalizeOrigin(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_ORIGIN_LENGTH) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  // Reject anything carrying a path/query/fragment beyond a bare host.
  if ((url.pathname && url.pathname !== "/") || url.search || url.hash) {
    return null;
  }
  // Opaque origins serialize to "null".
  if (url.origin === "null") return null;

  return url.origin;
}

// Validate a user-supplied list. Trims, drops empties, normalizes, dedupes,
// caps at MAX_ALLOWED_ORIGINS. Rejects non-http(s) or malformed entries.
export function validateAllowedOrigins(
  raw: unknown
):
  | { ok: true; value: string[] }
  | { ok: false; error: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, error: "allowedOrigins must be an array" };
  }

  const seen = new Set<string>();
  const value: string[] = [];

  for (const entry of raw) {
    if (typeof entry !== "string") {
      return { ok: false, error: "each origin must be a string" };
    }
    const trimmed = entry.trim();
    if (trimmed.length === 0) continue; // drop empties

    const normalized = normalizeOrigin(trimmed);
    if (!normalized) {
      return { ok: false, error: `invalid origin: ${trimmed}` };
    }
    if (seen.has(normalized)) continue; // dedupe
    seen.add(normalized);
    value.push(normalized);
  }

  if (value.length > MAX_ALLOWED_ORIGINS) {
    return {
      ok: false,
      error: `too many origins (max ${MAX_ALLOWED_ORIGINS})`,
    };
  }

  return { ok: true, value };
}

// True if `origin` matches one of `allowed` (both normalized). A null/empty
// origin is never a match (same-origin handling is the caller's concern).
export function originAllowed(
  origin: string | null,
  allowed: string[]
): boolean {
  if (!origin) return false;
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  for (const a of allowed) {
    if (normalizeOrigin(a) === normalized) return true;
  }
  return false;
}
