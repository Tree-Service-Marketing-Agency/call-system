import { timingSafeEqual } from "node:crypto";

// ADR-004: shared-secret auth for n8n-driven webhooks (call-data, call-ended).
// Replaces the previous Retell signature verification on call-ended and
// closes the preexisting unauth gap on call-data.
//
// Returns null when the request is authorized; returns a `Response` to send
// back when it isn't (so callers can `return result ?? next()`).
export function verifyN8nSecret(request: Request): Response | null {
  const expected = process.env.N8N_WEBHOOK_SECRET;
  if (!expected) {
    console.error(
      "[webhook-auth] N8N_WEBHOOK_SECRET is not configured; rejecting"
    );
    return Response.json({ error: "Server not configured" }, { status: 500 });
  }

  const header = request.headers.get("authorization");
  const provided = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!provided) {
    return Response.json({ error: "Missing bearer token" }, { status: 401 });
  }

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (
    expectedBuf.length !== providedBuf.length ||
    !timingSafeEqual(expectedBuf, providedBuf)
  ) {
    return Response.json({ error: "Invalid bearer token" }, { status: 401 });
  }

  return null;
}
