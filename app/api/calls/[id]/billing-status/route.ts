import { NextResponse } from "next/server";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { billingLedger, calls, companies } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth-helpers";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole("root");
  if (!auth.ok) return auth.response;
  const { user } = auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = (body as { action?: unknown })?.action;
  if (action !== "void" && action !== "restore") {
    return NextResponse.json(
      { error: "action must be 'void' or 'restore'" },
      { status: 400 }
    );
  }

  const { id } = await params;
  const call = await db.query.calls.findFirst({ where: eq(calls.id, id) });
  if (!call) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ledger = await db.query.billingLedger.findFirst({
    where: eq(billingLedger.callRowId, call.id),
  });
  if (!ledger) {
    return NextResponse.json(
      { error: "Call has no ledger entry" },
      { status: 409 }
    );
  }

  const requiredFromStatus = action === "void" ? "pending" : "void";
  if (ledger.status !== requiredFromStatus) {
    const message =
      action === "void"
        ? "Call is not voidable in its current state"
        : "Call is not in voided state";
    return NextResponse.json({ error: message }, { status: 409 });
  }

  const targetStatus: "void" | "pending" =
    action === "void" ? "void" : "pending";
  const balanceDelta = action === "void"
    ? -ledger.amountCents
    : ledger.amountCents;

  try {
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(billingLedger)
        .set(
          action === "void"
            ? {
                status: "void",
                voidedAt: new Date(),
                voidedBy: user.id,
                updatedAt: new Date(),
              }
            : {
                status: "pending",
                voidedAt: null,
                voidedBy: null,
                updatedAt: new Date(),
              }
        )
        .where(
          and(
            eq(billingLedger.id, ledger.id),
            eq(billingLedger.status, requiredFromStatus)
          )
        )
        .returning({ id: billingLedger.id });

      if (updated.length === 0) {
        throw new Error("ledger_state_changed");
      }

      await tx
        .update(companies)
        .set({
          currentBalanceCents: sql`${companies.currentBalanceCents} + ${balanceDelta}`,
          billingUpdatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(companies.id, ledger.companyId));
    });
  } catch (err) {
    if (err instanceof Error && err.message === "ledger_state_changed") {
      return NextResponse.json(
        { error: "Call state changed; reload and try again" },
        { status: 409 }
      );
    }
    console.error(
      "[calls] billing_status_change_failed",
      JSON.stringify({
        action,
        call_row_id: call.id,
        error: err instanceof Error ? err.message : String(err),
      })
    );
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  console.log(
    "[calls] billing_status_changed",
    JSON.stringify({
      action,
      call_id: call.callId,
      call_row_id: call.id,
      company_id: ledger.companyId,
      amount_cents: ledger.amountCents,
      ledger_id: ledger.id,
      by_user_id: user.id,
      by_user_email: user.email ?? null,
      target_status: targetStatus,
    })
  );

  return NextResponse.json({ ok: true, targetStatus, callId: call.id });
}
