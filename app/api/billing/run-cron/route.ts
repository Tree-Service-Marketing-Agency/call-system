import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-helpers";
import {
  runBillingChargeRun,
  runBillingChargeForCompany,
} from "@/lib/billing/charge-cron";

/**
 * Manual charge trigger.
 * - No body / no `companyId` → global Charge run ("Run billing now"),
 *   restricted to `root`.
 * - `{ companyId }` → Manual company charge scoped to one company, allowed for
 *   any Agency user (`root` or `admin`). The permission asymmetry is
 *   deliberate and documented in CONTEXT.md: charging one company (with the
 *   full gate intact) is normal agency work; charging every company at once is
 *   reserved to `root`.
 */
export async function POST(request: NextRequest) {
  let companyId: string | undefined;
  try {
    const body = await request.json();
    if (body && typeof body.companyId === "string" && body.companyId) {
      companyId = body.companyId;
    }
  } catch {
    // No JSON body → treat as the global run.
  }

  if (companyId) {
    const auth = await requireRole("root", "admin");
    if (!auth.ok) return auth.response;

    const result = await runBillingChargeForCompany({
      runId: crypto.randomUUID(),
      triggeredBy: "manual",
      companyId,
    });

    return NextResponse.json({
      ok: result.ok,
      outcome: result.outcome,
      invoiceId: result.invoiceId ?? null,
    });
  }

  const auth = await requireRole("root");
  if (!auth.ok) return auth.response;

  const result = await runBillingChargeRun({
    runId: crypto.randomUUID(),
    triggeredBy: "manual",
  });

  return NextResponse.json({ ok: true, ...result });
}
