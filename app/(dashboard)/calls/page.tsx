import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CallsClient } from "./calls-client";

export default async function CallsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">Calls</h1>
      <CallsClient user={session.user} />
    </div>
  );
}
