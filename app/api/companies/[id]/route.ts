import { NextResponse } from "next/server";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { calls, companies, companyAgents, users } from "@/lib/db/schema";
import { getSessionUser, isAgencyRole } from "@/lib/auth-helpers";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user || !isAgencyRole(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, id),
    with: {
      agents: true,
      users: true,
    },
  });

  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(company);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getSessionUser();
  if (!currentUser || !isAgencyRole(currentUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, id),
  });
  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    notificationPhones?: unknown;
    leadSnapWebhook?: unknown;
    agentIds?: unknown;
  };

  const companyUpdates: Record<string, unknown> = {};

  if ("notificationPhones" in body) {
    if (
      !Array.isArray(body.notificationPhones) ||
      !body.notificationPhones.every((p) => typeof p === "string")
    ) {
      return NextResponse.json(
        { error: "notificationPhones must be an array of strings" },
        { status: 400 }
      );
    }
    companyUpdates.notificationPhones = (body.notificationPhones as string[])
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }

  if ("leadSnapWebhook" in body) {
    if (
      body.leadSnapWebhook !== null &&
      typeof body.leadSnapWebhook !== "string"
    ) {
      return NextResponse.json(
        { error: "leadSnapWebhook must be a string or null" },
        { status: 400 }
      );
    }
    const trimmed =
      typeof body.leadSnapWebhook === "string"
        ? body.leadSnapWebhook.trim()
        : null;
    companyUpdates.leadSnapWebhook = trimmed && trimmed.length > 0 ? trimmed : null;
  }

  let nextAgentIds: string[] | null = null;
  if ("agentIds" in body) {
    if (
      !Array.isArray(body.agentIds) ||
      !body.agentIds.every((a) => typeof a === "string")
    ) {
      return NextResponse.json(
        { error: "agentIds must be an array of strings" },
        { status: 400 }
      );
    }
    nextAgentIds = Array.from(
      new Set(
        (body.agentIds as string[])
          .map((a) => a.trim())
          .filter((a) => a.length > 0)
      )
    );
    if (nextAgentIds.length === 0) {
      return NextResponse.json(
        { error: "A company must have at least one agent" },
        { status: 400 }
      );
    }
  }

  try {
    await db.transaction(async (tx) => {
      if (Object.keys(companyUpdates).length > 0) {
        companyUpdates.updatedAt = new Date();
        await tx.update(companies).set(companyUpdates).where(eq(companies.id, id));
      }

      if (nextAgentIds) {
        const existing = await tx
          .select({ agentId: companyAgents.agentId })
          .from(companyAgents)
          .where(eq(companyAgents.companyId, id));
        const currentSet = new Set(existing.map((r) => r.agentId));
        const nextSet = new Set(nextAgentIds);

        const toRemove = [...currentSet].filter((a) => !nextSet.has(a));
        const toAdd = [...nextSet].filter((a) => !currentSet.has(a));

        if (toRemove.length > 0) {
          await tx
            .delete(companyAgents)
            .where(
              and(
                eq(companyAgents.companyId, id),
                inArray(companyAgents.agentId, toRemove)
              )
            );
        }

        if (toAdd.length > 0) {
          const conflicting = await tx
            .select({ agentId: companyAgents.agentId })
            .from(companyAgents)
            .where(
              and(
                inArray(companyAgents.agentId, toAdd),
                notInArray(companyAgents.companyId, [id])
              )
            );
          if (conflicting.length > 0) {
            throw new AgentConflictError(conflicting.map((c) => c.agentId));
          }

          await tx
            .insert(companyAgents)
            .values(toAdd.map((agentId) => ({ companyId: id, agentId })));
        }
      }
    });
  } catch (err) {
    if (err instanceof AgentConflictError) {
      return NextResponse.json(
        {
          error: `Agent IDs already assigned to another company: ${err.agentIds.join(", ")}`,
        },
        { status: 409 }
      );
    }
    throw err;
  }

  const updated = await db.query.companies.findFirst({
    where: eq(companies.id, id),
    with: { agents: true, users: true },
  });
  return NextResponse.json(updated);
}

class AgentConflictError extends Error {
  constructor(public agentIds: string[]) {
    super("agent_conflict");
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getSessionUser();
  if (!currentUser || currentUser.role !== "root") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, id),
  });

  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.transaction(async (tx) => {
    await tx.delete(users).where(eq(users.companyId, id));
    await tx.delete(calls).where(eq(calls.companyId, id));
    await tx.delete(companies).where(eq(companies.id, id));
  });

  return NextResponse.json({ success: true });
}
