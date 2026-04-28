import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CustomersClient } from "./customers-client";

export default async function CustomersPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return <CustomersClient user={session.user} />;
}
