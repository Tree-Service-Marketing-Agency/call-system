import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CustomersClient } from "./customers-client";

export default async function CustomersPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">Customers</h1>
      <CustomersClient user={session.user} />
    </div>
  );
}
