// Curated model allowlist + defaults for the Text agent (ADR-012).
//
// The agency absorbs the model cost (the text feature is non-billable in F1),
// so editors pick from a vetted set instead of free text. Widening the choice
// is a one-line edit here — add an entry and it shows up in the selector and
// passes validation.

export const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";

export type AllowedModel = { id: string; label: string };

export const ALLOWED_MODELS: AllowedModel[] = [
  { id: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5" },
  { id: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6" },
  { id: "openai/gpt-5-mini", label: "GPT 5 mini" },
  { id: "moonshotai/kimi-k2.6", label: "Kimi k2.6" },
];

export function isAllowedModel(id: string): boolean {
  return ALLOWED_MODELS.some((m) => m.id === id);
}

// Used when a Text agent's `system_prompt` is empty. The agent answers in the
// user's language; the per-company prompt (when set) overrides the voice.
export const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful, clear, and concise AI assistant for a service company. " +
  "Have a natural conversation with visitors, answer their questions, and when " +
  "it makes sense, politely ask for the contact details you need. " +
  "Always respond in the same language as the user.";
