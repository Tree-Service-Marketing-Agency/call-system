import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageBody } from "@/components/layout/page-body";
import { canManageTextAgent } from "@/lib/text-agent/authz";
import type { SessionUser } from "@/lib/auth-helpers";
import { ChatPlaygroundClient } from "./chat-playground-client";

export default async function ChatPlaygroundPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const sp = await searchParams;
  const companyId = typeof sp.companyId === "string" ? sp.companyId : null;

  if (!companyId) {
    return (
      <PageBody>
        <p className="text-sm text-muted-foreground">
          Missing companyId parameter.
        </p>
      </PageBody>
    );
  }

  // The playground is for editors: agency users (any company) or the company's
  // own staff_admin. The /api/chat endpoint enforces this server-side too; this
  // is the UX gate so others see a clean message instead of a shell that 403s.
  if (!canManageTextAgent(session.user as SessionUser, companyId)) {
    return (
      <PageBody>
        <p className="text-sm text-muted-foreground">
          You don&apos;t have access to this company&apos;s playground.
        </p>
      </PageBody>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3 border-b border-border px-7 pt-6 pb-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Back to text agent"
            className="-ml-1"
            render={<Link href={`/companies/${companyId}?tab=text-agent`} />}
          >
            <ArrowLeftIcon />
          </Button>
          <Link
            href={`/companies/${companyId}?tab=text-agent`}
            className="hover:text-foreground"
          >
            Text agent
          </Link>
          <span>/</span>
          <span className="text-foreground">Test</span>
        </div>
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
          Playground
        </h1>
      </div>
      <PageBody>
        <ChatPlaygroundClient companyId={companyId} />
      </PageBody>
    </>
  );
}
