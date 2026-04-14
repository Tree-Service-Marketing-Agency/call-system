import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-helpers";
import { runBillingChargeRun } from "@/lib/billing/charge-cron";

export async function POST() {
  const auth = await requireRole("root");
  if (!auth.ok) return auth.response;

  const result = await runBillingChargeRun({
    runId: crypto.randomUUID(),
    triggeredBy: "manual",
  });

  return NextResponse.json({ ok: true, ...result });
}
