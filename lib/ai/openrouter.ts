import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { DEFAULT_MODEL, isAllowedModel } from "./models";

// OpenRouter as the LLM gateway (Vercel AI SDK v6). The API key is read from
// env; `assertAiConfigured` lets callers fail loudly instead of hitting the
// provider with a placeholder key.
export function assertAiConfigured(): void {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY no está configurada");
  }
}

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY ?? "or-unset",
});

// Returns a language model with OpenRouter usage accounting enabled, so the
// real cost (USD) and token counts surface in
// `providerMetadata.openrouter.usage` on finish (see lib/chat/cost.ts). An
// unknown / disallowed id falls back to DEFAULT_MODEL.
export function chatModel(modelId: string) {
  const id = isAllowedModel(modelId) ? modelId : DEFAULT_MODEL;
  return openrouter.chat(id, { usage: { include: true } });
}
