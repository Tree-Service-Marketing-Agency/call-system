import { NextResponse } from "next/server";
import { runBillingChargeRun } from "@/lib/billing/charge-cron";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization");
  const provided = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : new URL(request.url).searchParams.get("secret");

  if (provided !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runBillingChargeRun({
    runId: crypto.randomUUID(),
    triggeredBy: "cron",
  });

  return NextResponse.json({ ok: true, ...result });
}
