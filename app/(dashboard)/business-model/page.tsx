import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BusinessModelClient } from "./business-model-client";

export default async function BusinessModelPage() {
  const session = await auth();
  if (!session) redirect("/login");

  if (session.user.role !== "root") {
    redirect("/calls");
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">Business Model</h1>
      <BusinessModelClient />
    </div>
  );
}
