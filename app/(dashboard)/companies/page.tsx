import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CompaniesClient } from "./companies-client";

export default async function CompaniesPage() {
  const session = await auth();
  if (!session) redirect("/login");

  if (session.user.role !== "root" && session.user.role !== "admin") {
    redirect("/calls");
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">Companies</h1>
      <CompaniesClient />
    </div>
  );
}
