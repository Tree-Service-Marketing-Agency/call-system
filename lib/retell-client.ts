// Deep module wrapping the Retell phone-number API. Callers get a simple
// enable/disable pair and a discriminated result — no fetch/HTTP/timeout
// details leak out, and this module never throws.

const RETELL_API_BASE = "https://api.retellai.com";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ERROR_BODY_CHARS = 300;

export type RetellResult = { ok: true } | { ok: false; error: string };

/**
 * Routes inbound calls on `phoneNumber` to `agentId` (latest version,
 * weight 1). `phoneNumber` must be E.164 (e.g. +17163210677).
 */
export async function enableAgentOnNumber(
  phoneNumber: string,
  agentId: string
): Promise<RetellResult> {
  return updatePhoneNumber(phoneNumber, {
    inbound_agents: [
      { agent_id: agentId, agent_version: "latest", weight: 1 },
    ],
  });
}

/** Removes all inbound agents from `phoneNumber` (calls stop being answered). */
export async function disableAgentOnNumber(
  phoneNumber: string
): Promise<RetellResult> {
  return updatePhoneNumber(phoneNumber, { inbound_agents: null });
}

async function updatePhoneNumber(
  phoneNumber: string,
  body: unknown
): Promise<RetellResult> {
  try {
    const res = await fetch(
      `${RETELL_API_BASE}/update-phone-number/${encodeURIComponent(phoneNumber)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${process.env.RETELL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }
    );

    if (!res.ok) {
      const text = (await res.text().catch(() => "")).slice(
        0,
        MAX_ERROR_BODY_CHARS
      );
      return {
        ok: false,
        error: `Retell API error (${res.status})${text ? `: ${text}` : ""}`,
      };
    }
    return { ok: true };
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      return { ok: false, error: "Retell API request timed out" };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Retell API request failed: ${message}` };
  }
}
