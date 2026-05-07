import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { UsersClient } from "./users-client";

export default async function UsersPage() {
  const session = await auth();
  if (!session) redirect("/login");

  if (session.user.role !== "root" && session.user.role !== "admin") {
    redirect("/calls");
  }

  return <UsersClient user={session.user} />;
}
