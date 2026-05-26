// Builds the Public recording link for a Call. Pure (no DB access).
// Base URL = AUTH_URL (same convention as the Stripe webhook's return_url),
// but robust: trailing slash is stripped and a warning is logged if AUTH_URL
// is missing, instead of silently producing a relative link unusable by n8n.
export function buildPublicRecordingLink(id: string): string {
  const base = (process.env.AUTH_URL ?? "").replace(/\/$/, "");
  if (!base) {
    console.warn(
      "[public-recording-link] AUTH_URL is not set; returning a relative link unusable by n8n",
    );
  }
  return `${base}/audio-call/${id}`;
}
