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

export type TextAgentPatch = {
  enabled?: boolean;
  model?: string;
  systemPrompt?: string;
  catalog?: CatalogField[];
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
