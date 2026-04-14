import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { StaffAdminBillingClient } from "./staff-admin-billing-client";
import { AgencyBillingClient } from "./agency-billing-client";

export default async function BillingPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const role = session.user.role;
  if (role === "staff") redirect("/calls");

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">Billing</h1>
      {role === "staff_admin" ? (
        <StaffAdminBillingClient />
      ) : (
        <AgencyBillingClient role={role} />
      )}
    </div>
  );
}
