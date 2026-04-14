import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { UsersClient } from "./users-client";

export default async function UsersPage() {
  const session = await auth();
  if (!session) redirect("/login");

  if (session.user.role === "staff") {
    redirect("/calls");
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">Users</h1>
      <UsersClient user={session.user} />
    </div>
  );
}
