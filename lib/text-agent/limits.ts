// Shared limits for the Text agent config. Lives in its own client-safe module
// (no server-only imports) so the PATCH route and the editor UI enforce the
// exact same numbers — no drift between server validation and the input guard.

// Max length of a Text agent's system prompt, in UTF-16 code units (matches
// String.length on the server and maxLength on the <textarea>). The prompt is
// sent to the model on every chat turn and the agency absorbs that cost (the
// text feature is non-billable), so this is a cost guardrail, not a DB limit —
// the `system_prompt` column is unbounded `text`.
export const SYSTEM_PROMPT_MAX = 32000;
