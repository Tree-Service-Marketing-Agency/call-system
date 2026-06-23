import { NextResponse } from "next/server";
import { verifyExternalApiKey } from "@/lib/external-auth";
import { listPendingChats } from "@/lib/chat/pending";

// GET /api/external/chats/pending — n8n pulls Chat conversations that are
// `pending` AND `source = widget` (playground tests never reach the CRM),
// ordered by last_interaction_at asc, each with its Catalog + messages.
// Optional filters: `companyId`, `inactiveMinutes` (only chats idle ≥ N min).
// ADR-013: extraction happens in n8n, not here.
//
// In F1 there is no widget traffic yet, so this returns [] until F2; the
// contract is validated against seeded data.
export async function GET(request: Request) {
  const unauthorized = verifyExternalApiKey(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const companyId = url.searchParams.get("companyId") ?? undefined;

  let inactiveMinutes: number | undefined;
  const inactiveRaw = url.searchParams.get("inactiveMinutes");
  if (inactiveRaw !== null) {
    const n = Number(inactiveRaw);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json(
        { error: "inactiveMinutes must be a non-negative number" },
        { status: 400 }
      );
    }
    inactiveMinutes = n;
  }

  const chats = await listPendingChats({ companyId, inactiveMinutes });
  return NextResponse.json({
    data: chats.map((c) => ({
      id: c.id,
      companyId: c.companyId,
      status: c.status,
      lastInteractionAt: c.lastInteractionAt,
      createdAt: c.createdAt,
      catalog: c.catalog,
      messages: c.messages,
    })),
  });
}
