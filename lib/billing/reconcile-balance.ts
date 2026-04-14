import { sql, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { billingLedger, companies } from "@/lib/db/schema";

/**
 * Recompute current_balance_cents for a company from the ledger and compare
 * with the materialized cache. Returns the drift; the caller decides whether
 * to repair it.
 */
export async function reconcileBalance(companyId: string): Promise<{
  stored: number;
  computed: number;
  drift: number;
}> {
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
  });
  if (!company) {
    throw new Error(`Company ${companyId} not found`);
  }

  const result = await db
    .select({
      total: sql<number>`COALESCE(SUM(${billingLedger.amountCents}), 0)`.as(
        "total"
      ),
    })
    .from(billingLedger)
    .where(
      sql`${billingLedger.companyId} = ${companyId} AND ${billingLedger.status} IN ('pending', 'reserved')`
    );

  const computed = Number(result[0]?.total ?? 0);
  const stored = company.currentBalanceCents;
  return { stored, computed, drift: stored - computed };
}

export async function repairBalance(companyId: string): Promise<{
  before: number;
  after: number;
}> {
  const { stored, computed } = await reconcileBalance(companyId);
  if (stored !== computed) {
    await db
      .update(companies)
      .set({ currentBalanceCents: computed, updatedAt: new Date() })
      .where(eq(companies.id, companyId));
  }
  return { before: stored, after: computed };
}
