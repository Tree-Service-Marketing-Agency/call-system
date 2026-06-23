import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { getSessionUser, isAgencyRole } from "@/lib/auth-helpers";
import { canViewCompany } from "@/lib/text-agent/authz";
import { listConversationsByCompany } from "@/lib/chat/persistence";

// GET — master list of a company's Chat conversations. Agency users see any
// company; company users only their own. Accumulated cost is agency-only
// (ADR-003) and stripped from the payload otherwise — it never reaches the wire.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!canViewCompany(user, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, id),
    columns: { id: true },
  });
  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const showCost = isAgencyRole(user.role);
  const items = await listConversationsByCompany(id);

  return NextResponse.json({
    showCost,
    data: items.map((c) => ({
      id: c.id,
      source: c.source,
      status: c.status,
      createdAt: c.createdAt,
      lastInteractionAt: c.lastInteractionAt,
      messageCount: c.messageCount,
      preview: c.preview,
      ...(showCost ? { totalCostMicroUsd: c.totalCostMicroUsd } : {}),
    })),
  });
}
