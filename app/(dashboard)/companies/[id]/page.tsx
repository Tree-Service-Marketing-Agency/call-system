import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CompanyDetailClient } from "./company-detail-client";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  if (session.user.role !== "root" && session.user.role !== "admin") {
    redirect("/calls");
  }

  const { id } = await params;

  return (
    <div className="flex flex-col gap-6 p-6">
      <CompanyDetailClient companyId={id} currentUserRole={session.user.role} />
    </div>
  );
}
