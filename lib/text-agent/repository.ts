import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { textAgents, type CatalogField } from "@/lib/db/schema";
import { DEFAULT_MODEL, isAllowedModel } from "@/lib/ai/models";

export type TextAgent = typeof textAgents.$inferSelect;

function defaultModel(): string {
  const env = process.env.OPENROUTER_MODEL;
  return env && isAllowedModel(env) ? env : DEFAULT_MODEL;
}

// Returns the company's Text agent, lazily creating a default row if none
// exists (every Company has exactly one Text agent — ADR-012). The
// onConflictDoNothing + re-read guards a concurrent lazy create.
export async function getTextAgent(companyId: string): Promise<TextAgent> {
  const existing = await db.query.textAgents.findFirst({
    where: eq(textAgents.companyId, companyId),
  });
  if (existing) return existing;

  await db
    .insert(textAgents)
    .values({ companyId, model: defaultModel() })
    .onConflictDoNothing();

  const created = await db.query.textAgents.findFirst({
    where: eq(textAgents.companyId, companyId),
  });
  if (!created) throw new Error("failed to create text agent");
  return created;
}

// ADR-014: resolve the agent by its public embed_key (the widget flow). Returns
// null on an unknown key — never lazy-creates (there's no company to attach to).
export async function getTextAgentByEmbedKey(
  embedKey: string
): Promise<TextAgent | null> {
  const row = await db.query.textAgents.findFirst({
    where: eq(textAgents.embedKey, embedKey),
  });
  return row ?? null;
}

// Focused lookup for the proxy's dynamic frame-ancestors CSP: only the origin
// allowlist, by embed_key. Returns null when the key is unknown.
export async function getAllowedOriginsByEmbedKey(
  embedKey: string
): Promise<string[] | null> {
  const row = await db.query.textAgents.findFirst({
    where: eq(textAgents.embedKey, embedKey),
    columns: { allowedOrigins: true },
  });
  return row ? row.allowedOrigins : null;
}

// ADR-014: mint a fresh embed_key (agency-only security lever). Invalidates all
// existing embeds for the company — the snippet must be updated afterward.
export async function rotateEmbedKey(companyId: string): Promise<TextAgent> {
  await getTextAgent(companyId);
  const [updated] = await db
    .update(textAgents)
    .set({
      embedKey: crypto.randomUUID().replace(/-/g, ""),
      updatedAt: new Date(),
    })
    .where(eq(textAgents.companyId, companyId))
    .returning();
  return updated;
}

export type TextAgentPatch = {
  enabled?: boolean;
  model?: string;
  systemPrompt?: string;
  catalog?: CatalogField[];
  allowedOrigins?: string[];
};

// Updates the Text agent (lazy-creating first if needed). Authorization is the
// route handler's job — this layer only writes validated data.
export async function updateTextAgent(
  companyId: string,
  patch: TextAgentPatch
): Promise<TextAgent> {
  await getTextAgent(companyId);
  const [updated] = await db
    .update(textAgents)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(textAgents.companyId, companyId))
    .returning();
  return updated;
}
