// Reads OpenRouter usage accounting from the AI SDK providerMetadata and
// normalizes it for storage. `usage.cost` is in USD (OpenRouter credits); we
// store integer micro-USD for sub-cent precision. Defensive: any missing /
// non-numeric field degrades to null rather than throwing.

export type ExtractedUsage = {
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  costMicroUsd: number | null;
};

export function extractUsage(
  providerMetadata: unknown,
  model: string
): ExtractedUsage {
  const usage = (
    providerMetadata as
      | { openrouter?: { usage?: Record<string, unknown> } }
      | undefined
  )?.openrouter?.usage;

  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  if (!usage) {
    return {
      model,
      promptTokens: null,
      completionTokens: null,
      costMicroUsd: null,
    };
  }

  const cost = num(usage.cost);
  return {
    model,
    promptTokens: num(usage.promptTokens),
    completionTokens: num(usage.completionTokens),
    costMicroUsd: cost === null ? null : Math.round(cost * 1_000_000),
  };
}
