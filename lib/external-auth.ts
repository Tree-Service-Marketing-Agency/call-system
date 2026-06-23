import { timingSafeEqual } from "node:crypto";

// x-api-key auth for /api/external/* consumers (n8n). Constant-time compare
// against EXTERNAL_API_KEY — same check as the by-agent endpoint, factored out.
// Returns null when authorized, or a Response to send back when it isn't (so
// callers can `const r = verifyExternalApiKey(req); if (r) return r;`).
export function verifyExternalApiKey(request: Request): Response | null {
  const expected = process.env.EXTERNAL_API_KEY;
  if (!expected) {
    return Response.json(
      { error: "EXTERNAL_API_KEY not configured" },
      { status: 500 }
    );
  }

  const provided = request.headers.get("x-api-key") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
