import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, companyAgents } from "@/lib/db/schema";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const expected = process.env.EXTERNAL_API_KEY;
  if (!expected) {
    return NextResponse.json(
      { error: "EXTERNAL_API_KEY not configured" },
      { status: 500 }
    );
  }

  const provided = request.headers.get("x-api-key") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agentId } = await params;
  if (!agentId) {
    return NextResponse.json({ error: "agentId is required" }, { status: 400 });
  }

  const mapping = await db.query.companyAgents.findFirst({
    where: eq(companyAgents.agentId, agentId),
  });
  if (!mapping) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const company = await db.query.companies.findFirst({
    where: eq(companies.id, mapping.companyId),
    with: { agents: true, users: true },
  });
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: company.id,
    name: company.name,
    notificationPhones: company.notificationPhones,
    leadSnapWebhook: company.leadSnapWebhook,
    billing: {
      status: company.billingStatus,
      currentBalanceCents: company.currentBalanceCents,
    },
    createdAt: company.createdAt,
    agents: company.agents.map((a) => ({
      id: a.id,
      agentId: a.agentId,
      companyId: a.companyId,
    })),
    users: company.users.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt,
    })),
  });
}
