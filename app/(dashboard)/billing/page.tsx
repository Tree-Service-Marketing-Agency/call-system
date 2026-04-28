import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { PageBody } from "@/components/layout/page-body";
import { StaffAdminBillingClient } from "./staff-admin-billing-client";
import { AgencyBillingClient } from "./agency-billing-client";

export default async function BillingPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const role = session.user.role;
  if (role === "staff") redirect("/calls");

  const subtitle =
    role === "staff_admin"
      ? "Your current balance, payment method and invoices."
      : "Manage thresholds and review balances per company.";

  return (
    <>
      <PageHeader title="Billing" subtitle={subtitle} />
      <PageBody>
        {role === "staff_admin" ? (
          <StaffAdminBillingClient />
        ) : (
          <AgencyBillingClient role={role} />
        )}
      </PageBody>
    </>
  );
}
