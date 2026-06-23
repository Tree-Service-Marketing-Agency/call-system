import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { chatConversations, chatMessages } from "@/lib/db/schema";

// Persistence layer for chat history — decoupled from HTTP and the AI SDK.
// ADR-011: the server owns the conversation id and rebuilds the LLM context
// from the DB; an unknown id is a 404, never an upsert.

export class ConversationNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`conversation not found: ${id}`);
    this.name = "ConversationNotFoundError";
  }
}

export type ConversationSource = "widget" | "playground";
export type ChatRole = "user" | "assistant";
export type HistoryMessage = { role: ChatRole; content: string };

// Resolve-or-create. A null/undefined id mints a new conversation for the
// company (the server owns the id). A provided id must exist AND belong to
// `companyId`; otherwise ConversationNotFoundError → 404 (never upsert, never
// cross-company).
export async function resolveConversation(opts: {
  id?: string | null;
  companyId: string;
  source: ConversationSource;
}): Promise<{ id: string; companyId: string }> {
  const { id, companyId, source } = opts;

  if (id === undefined || id === null) {
    const [conv] = await db
      .insert(chatConversations)
      .values({ companyId, source })
      .returning();
    return { id: conv.id, companyId: conv.companyId };
  }

  const existing = await db.query.chatConversations.findFirst({
    where: eq(chatConversations.id, id),
  });
  if (!existing || existing.companyId !== companyId) {
    throw new ConversationNotFoundError(id);
  }
  return { id: existing.id, companyId: existing.companyId };
}

export async function getConversation(id: string) {
  return db.query.chatConversations.findFirst({
    where: eq(chatConversations.id, id),
  });
}

// Chronological context for the LLM — ordered by createdAt, tie-broken by id
// so the order is stable when two messages share a timestamp.
export async function loadHistory(
  conversationId: string
): Promise<HistoryMessage[]> {
  const rows = await db.query.chatMessages.findMany({
    where: eq(chatMessages.conversationId, conversationId),
    orderBy: [asc(chatMessages.createdAt), asc(chatMessages.id)],
    columns: { role: true, content: true },
  });
  return rows.map((r) => ({ role: r.role, content: r.content }));
}

export type SaveMessageInput = {
  conversationId: string;
  role: ChatRole;
  content: string;
  model?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  costMicroUsd?: number | null;
};

// Persists a message and bumps the conversation's denormalized
// last_interaction_at (n8n reads it to decide when the chat cooled off).
export async function saveMessage(input: SaveMessageInput): Promise<void> {
  await db.insert(chatMessages).values({
    conversationId: input.conversationId,
    role: input.role,
    content: input.content,
    model: input.model ?? null,
    promptTokens: input.promptTokens ?? null,
    completionTokens: input.completionTokens ?? null,
    costMicroUsd: input.costMicroUsd ?? null,
  });
  await db
    .update(chatConversations)
    .set({ lastInteractionAt: new Date() })
    .where(eq(chatConversations.id, input.conversationId));
}

export type ThreadMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: Date;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  costMicroUsd: number | null;
};

// Full thread for the read-only detail view and the playground resume. The
// caller strips cost fields for non-agency users (ADR-003).
export async function loadThread(
  conversationId: string
): Promise<ThreadMessage[]> {
  return db.query.chatMessages.findMany({
    where: eq(chatMessages.conversationId, conversationId),
    orderBy: [asc(chatMessages.createdAt), asc(chatMessages.id)],
    columns: {
      id: true,
      role: true,
      content: true,
      createdAt: true,
      model: true,
      promptTokens: true,
      completionTokens: true,
      costMicroUsd: true,
    },
  });
}

export type ConversationListItem = {
  id: string;
  source: ConversationSource;
  status: "pending" | "sent";
  createdAt: Date;
  lastInteractionAt: Date | null;
  messageCount: number;
  totalCostMicroUsd: number;
  preview: { role: ChatRole; content: string } | null;
};

// Master list for a company's Chats tab. Ordered by last activity. Cost is
// summed here but only surfaced to agency users by the route (ADR-003).
export async function listConversationsByCompany(
  companyId: string
): Promise<ConversationListItem[]> {
  const convs = await db.query.chatConversations.findMany({
    where: eq(chatConversations.companyId, companyId),
    orderBy: [
      desc(
        sql`coalesce(${chatConversations.lastInteractionAt}, ${chatConversations.createdAt})`
      ),
    ],
  });
  if (convs.length === 0) return [];
  const ids = convs.map((c) => c.id);

  // Count + summed cost per conversation.
  const aggregates = await db
    .select({
      conversationId: chatMessages.conversationId,
      count: sql<number>`count(*)::int`,
      cost: sql<number>`coalesce(sum(${chatMessages.costMicroUsd}), 0)::int`,
    })
    .from(chatMessages)
    .where(inArray(chatMessages.conversationId, ids))
    .groupBy(chatMessages.conversationId);
  const aggMap = new Map(aggregates.map((a) => [a.conversationId, a]));

  // Last message per conversation (preview), one query via DISTINCT ON.
  const previewRes = await db.execute(sql`
    select distinct on (conversation_id) conversation_id, role, content
    from chat_messages
    where conversation_id in (${sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `
    )})
    order by conversation_id, created_at desc, id desc
  `);
  const previewRows = previewRes.rows as Array<{
    conversation_id: string;
    role: ChatRole;
    content: string;
  }>;
  const previewMap = new Map(
    previewRows.map((r) => [
      r.conversation_id,
      { role: r.role, content: r.content },
    ])
  );

  return convs.map((c) => {
    const agg = aggMap.get(c.id);
    return {
      id: c.id,
      source: c.source,
      status: c.status,
      createdAt: c.createdAt,
      lastInteractionAt: c.lastInteractionAt,
      messageCount: agg?.count ?? 0,
      totalCostMicroUsd: agg?.cost ?? 0,
      preview: previewMap.get(c.id) ?? null,
    };
  });
}
