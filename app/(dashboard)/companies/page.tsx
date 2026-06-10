import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CompaniesClient } from "./companies-client";

export default async function CompaniesPage() {
  const session = await auth();
  if (!session) redirect("/login");

  if (session.user.role !== "root" && session.user.role !== "admin") {
    redirect("/calls");
  }

  return <CompaniesClient />;
}
