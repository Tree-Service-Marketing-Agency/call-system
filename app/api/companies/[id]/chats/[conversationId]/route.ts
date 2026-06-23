import { NextResponse } from "next/server";
import { getSessionUser, isAgencyRole } from "@/lib/auth-helpers";
import { canViewCompany } from "@/lib/text-agent/authz";
import { getConversation, loadThread } from "@/lib/chat/persistence";

// GET — the full read-only thread of a Chat conversation. Doubles as the
// playground resume source (re-verifies auth + company ownership). Per-message
// cost/usage is agency-only (ADR-003) and stripped otherwise.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; conversationId: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, conversationId } = await params;
  if (!canViewCompany(user, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // The conversation must exist AND belong to this company (no cross-company
  // reads even for agency users hitting the wrong company id).
  const conversation = await getConversation(conversationId);
  if (!conversation || conversation.companyId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const showCost = isAgencyRole(user.role);
  const messages = await loadThread(conversationId);

  return NextResponse.json({
    showCost,
    conversation: {
      id: conversation.id,
      source: conversation.source,
      status: conversation.status,
      createdAt: conversation.createdAt,
      lastInteractionAt: conversation.lastInteractionAt,
    },
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
      ...(showCost
        ? {
            model: m.model,
            promptTokens: m.promptTokens,
            completionTokens: m.completionTokens,
            costMicroUsd: m.costMicroUsd,
          }
        : {}),
    })),
  });
}
