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
];

export function isAllowedModel(id: string): boolean {
  return ALLOWED_MODELS.some((m) => m.id === id);
}

// Used when a Text agent's `system_prompt` is empty. The agent answers in the
// user's language; the per-company prompt (when set) overrides the voice.
export const DEFAULT_SYSTEM_PROMPT =
  "Eres un asistente de IA útil, claro y conciso para una empresa de servicios. " +
  "Conversa de forma natural con los visitantes, responde sus preguntas y, cuando " +
  "tenga sentido, pide de forma amable los datos de contacto que necesitas. " +
  "Responde siempre en el mismo idioma del usuario.";
