import { normalizeUsPhone } from "@/lib/phone";

/**
 * A phone that receives lead-snap alerts for a company.
 *
 * - `phone`:    normalized E.164 US number (`+1XXXXXXXXXX`).
 * - `note`:     free text identifying whose number it is. May be empty,
 *               never longer than {@link NOTE_MAX_LENGTH} characters.
 * - `disabled`: `true` means n8n must not notify this number. This system
 *               only stores and exposes the flag; it never filters on it.
 */
export interface NotificationPhone {
  phone: string;
  note: string;
  disabled: boolean;
}

export const NOTE_MAX_LENGTH = 150;

export type ValidateNotificationPhonesResult =
  | { ok: true; value: NotificationPhone[] }
  | { ok: false; error: string };

/**
 * Validate and normalize a raw `notificationPhones` input into
 * {@link NotificationPhone}s. Pure: no DB, no side effects. Shared by the
 * company PATCH endpoint and onboarding so both behave identically.
 *
 * Rules (ADR-008):
 *   - Each entry must be an object. `phone` is normalized via
 *     {@link normalizeUsPhone}; an entry whose phone is missing/invalid is
 *     discarded entirely (note included) — not an error.
 *   - `note`: optional string, trimmed, empty allowed, at most
 *     {@link NOTE_MAX_LENGTH} characters. Longer ⇒ error.
 *   - `disabled`: optional boolean, defaults to `false`. Non-boolean ⇒ error.
 *   - Two surviving entries with the same normalized `phone` ⇒ error.
 *
 * Note: emptiness is intentionally NOT enforced here — Settings may clear the
 * list; onboarding enforces "at least one" itself.
 */
export function validateNotificationPhones(
  raw: unknown
): ValidateNotificationPhonesResult {
  if (!Array.isArray(raw)) {
    return { ok: false, error: "notificationPhones must be an array" };
  }

  const result: NotificationPhone[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return {
        ok: false,
        error: "each notification phone must be an object",
      };
    }

    const { phone, note, disabled } = entry as {
      phone?: unknown;
      note?: unknown;
      disabled?: unknown;
    };

    const normalized =
      typeof phone === "string" ? normalizeUsPhone(phone) : null;
    if (!normalized) {
      // Invalid/empty phone ⇒ discard the whole entry, note and all.
      continue;
    }

    if (note !== undefined && typeof note !== "string") {
      return { ok: false, error: "note must be a string" };
    }
    const trimmedNote = typeof note === "string" ? note.trim() : "";
    if (trimmedNote.length > NOTE_MAX_LENGTH) {
      return {
        ok: false,
        error: `note must be ${NOTE_MAX_LENGTH} characters or fewer`,
      };
    }

    if (disabled !== undefined && typeof disabled !== "boolean") {
      return { ok: false, error: "disabled must be a boolean" };
    }

    if (seen.has(normalized)) {
      return {
        ok: false,
        error: `Duplicate notification phone: ${normalized}`,
      };
    }
    seen.add(normalized);

    result.push({
      phone: normalized,
      note: trimmedNote,
      disabled: disabled === true,
    });
  }

  return { ok: true, value: result };
}
