import type { TranscriptTurn } from "@/lib/db/schema";

// ADR-006: deep module that maps the n8n-normalized `call_ended` payload to
// typed Call fields. It is a pure function with no DB/route knowledge so the
// mapping can be reasoned about (and later tested) in isolation.
//
// n8n owns the contract: it unwraps Retell's `[{...}]` array, renames fields
// (full_name→name, service_needed→service, zip_code→zipcode), always sends
// `phone`, and converts Retell's `"Not provided"` sentinel to null. This
// module never sees that sentinel — a missing value is simply null.

export type MappedCallEnded = {
  event: string | null;
  callStatus: string;
  disconnectionReason: string | null;
  startTimestamp: number | null;
  endTimestamp: number | null;
  durationMs: number | null;
  audioUrl: string | null;
  // USD dollars decimal as string (ADR-003). Null when absent/invalid.
  retellCost: string | null;
  // Derived from start_timestamp (epoch ms → ISO), not from createdAt.
  callDate: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  customerCity: string | null;
  customerZipcode: string | null;
  service: string | null;
  summary: string | null;
  transcript: TranscriptTurn[] | null;
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// ADR-004: keep only `role` and `content` per turn, drop turns with empty
// content. Returns null when input is missing/invalid/empty so the caller
// can preserve the previous DB value.
export function filterTranscript(input: unknown): TranscriptTurn[] | null {
  if (!Array.isArray(input)) return null;
  const turns: TranscriptTurn[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const turn = raw as { role?: unknown; content?: unknown };
    const role = turn.role;
    const content = turn.content;
    if (role !== "agent" && role !== "user") continue;
    if (typeof content !== "string" || content.trim().length === 0) continue;
    turns.push({ role, content });
  }
  return turns.length > 0 ? turns : null;
}

// ADR-006: callDate is the real start of the call, derived from
// start_timestamp (epoch ms). Null when the timestamp is missing/invalid;
// callers fall back to createdAt only for display, never for storage.
export function deriveCallDate(startTimestamp: number | null): string | null {
  if (startTimestamp === null) return null;
  const d = new Date(startTimestamp);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function mapCallEndedPayload(
  payload: Record<string, unknown>
): MappedCallEnded {
  const startTimestamp = num(payload.start_timestamp);
  const callCost = num(payload.call_cost);

  return {
    event: str(payload.event),
    // n8n's payload doesn't always include call_status; the event itself
    // already declares the call ended, so default to "ended" when missing.
    callStatus: str(payload.call_status) ?? "ended",
    disconnectionReason: str(payload.disconnection_reason),
    startTimestamp,
    endTimestamp: num(payload.end_timestamp),
    durationMs: num(payload.duration_ms),
    audioUrl: str(payload.recording_url) ?? str(payload.audio_url),
    // ADR-003: call_cost arrives as a flat decimal in USD dollars
    // (e.g. 0.230749). Anything that isn't a number is ignored.
    retellCost: callCost === null ? null : callCost.toString(),
    callDate: deriveCallDate(startTimestamp),
    customerName: str(payload.name),
    // n8n sends `phone` (= from_number); accept either for resilience.
    customerPhone: str(payload.phone) ?? str(payload.from_number),
    customerAddress: str(payload.address),
    customerCity: str(payload.city),
    customerZipcode: str(payload.zipcode),
    service: str(payload.service),
    summary: str(payload.summary),
    transcript: filterTranscript(payload.transcription_object),
  };
}
