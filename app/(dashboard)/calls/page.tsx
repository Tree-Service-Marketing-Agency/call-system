import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CallsClient } from "./calls-client";

export default async function CallsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return <CallsClient user={session.user} />;
}
