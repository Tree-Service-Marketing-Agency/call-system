import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  chatConversations,
  chatMessages,
  textAgents,
  type CatalogField,
} from "@/lib/db/schema";
import type { ChatRole } from "./persistence";

// CRM-facing selection consumed by n8n (ADR-013: extraction lives in n8n).
// Only `pending` AND `source = widget` conversations are eligible — playground
// tests never reach the CRM.

export type PendingChat = {
  id: string;
  companyId: string;
  status: "pending";
  lastInteractionAt: Date | null;
  createdAt: Date;
  catalog: CatalogField[];
  messages: { role: ChatRole; content: string; createdAt: Date }[];
};

export async function listPendingChats(opts: {
  companyId?: string;
  inactiveMinutes?: number;
}): Promise<PendingChat[]> {
  const conds = [
    eq(chatConversations.status, "pending"),
    eq(chatConversations.source, "widget"),
  ];
  if (opts.companyId) {
    conds.push(eq(chatConversations.companyId, opts.companyId));
  }
  if (opts.inactiveMinutes && opts.inactiveMinutes > 0) {
    const cutoff = new Date(Date.now() - opts.inactiveMinutes * 60_000);
    conds.push(lte(chatConversations.lastInteractionAt, cutoff));
  }

  const convs = await db.query.chatConversations.findMany({
    where: and(...conds),
    orderBy: [asc(chatConversations.lastInteractionAt)],
    with: {
      messages: {
        orderBy: [asc(chatMessages.createdAt), asc(chatMessages.id)],
        columns: { role: true, content: true, createdAt: true },
      },
    },
  });
  if (convs.length === 0) return [];

  // Catalog per company (one query, mapped onto each conversation).
  const companyIds = [...new Set(convs.map((c) => c.companyId))];
  const agents = await db.query.textAgents.findMany({
    where: inArray(textAgents.companyId, companyIds),
    columns: { companyId: true, catalog: true },
  });
  const catalogMap = new Map(agents.map((a) => [a.companyId, a.catalog]));

  return convs.map((c) => ({
    id: c.id,
    companyId: c.companyId,
    status: "pending" as const,
    lastInteractionAt: c.lastInteractionAt,
    createdAt: c.createdAt,
    catalog: catalogMap.get(c.companyId) ?? [],
    messages: c.messages.map((m) => ({
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    })),
  }));
}

// Idempotent status move (n8n marks a chat `sent` once the Lead is delivered).
// Terminal: once `sent`, later messages append but never reopen it.
export async function setChatStatus(
  id: string,
  status: "pending" | "sent"
): Promise<{ ok: true } | { ok: false; reason: "not_found" }> {
  const [updated] = await db
    .update(chatConversations)
    .set({ status })
    .where(eq(chatConversations.id, id))
    .returning({ id: chatConversations.id });
  if (!updated) return { ok: false, reason: "not_found" };
  return { ok: true };
}
