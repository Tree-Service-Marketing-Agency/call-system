import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { PageBody } from "@/components/layout/page-body";
import { BusinessModelClient } from "./business-model-client";

export default async function BusinessModelPage() {
  const session = await auth();
  if (!session) redirect("/login");

  if (session.user.role !== "root") {
    redirect("/calls");
  }

  return (
    <>
      <PageHeader
        title="Business model"
        subtitle="Price per call and the global billing threshold."
      />
      <PageBody>
        <BusinessModelClient />
      </PageBody>
    </>
  );
}
