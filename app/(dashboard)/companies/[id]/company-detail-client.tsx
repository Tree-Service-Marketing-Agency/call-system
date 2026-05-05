"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageBody } from "@/components/layout/page-body";
import { CallsClient } from "@/app/(dashboard)/calls/calls-client";
import type { SessionUser } from "@/lib/auth-helpers";
import { SettingsTab } from "./tabs/settings-tab";
import { UsersTab } from "./tabs/users-tab";
import { BillingTab } from "./tabs/billing-tab";

interface CompanyDetail {
  id: string;
  name: string;
  createdAt: string;
  notificationPhones: string[];
  leadSnapWebhook: string | null;
  agents: { id: string; agentId: string }[];
  users: {
    id: string;
    email: string;
    role: string;
    isActive: boolean;
    createdAt: string;
  }[];
  agentCount: number;
  userCount: number;
  monthlyBillingCents: number;
}

const TAB_VALUES = ["calls", "settings", "users", "billing"] as const;
type TabValue = (typeof TAB_VALUES)[number];
const DEFAULT_TAB: TabValue = "calls";

function isTabValue(v: string | null): v is TabValue {
  return v !== null && (TAB_VALUES as readonly string[]).includes(v);
}

function pluralize(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

export function CompanyDetailClient({
  companyId,
  user,
}: {
  companyId: string;
  user: SessionUser;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [company, setCompany] = useState<CompanyDetail | null>(null);

  const tabParam = searchParams.get("tab");
  const activeTab: TabValue = isTabValue(tabParam) ? tabParam : DEFAULT_TAB;

  const fetchCompany = useCallback(() => {
    fetch(`/api/companies/${companyId}`)
      .then((res) => res.json())
      .then((data: CompanyDetail) => setCompany(data));
  }, [companyId]);

  useEffect(() => {
    fetchCompany();
  }, [fetchCompany]);

  const setTab = useCallback(
    (next: TabValue) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === DEFAULT_TAB) {
        params.delete("tab");
      } else {
        params.set("tab", next);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  if (!company) {
    return (
      <>
        <div className="flex items-end justify-between gap-4 px-7 pt-6 pb-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
              Loading…
            </h1>
          </div>
        </div>
        <PageBody>
          <p className="text-sm text-muted-foreground">Loading company…</p>
        </PageBody>
      </>
    );
  }

  const subtitle = `${pluralize(company.agentCount, "agent")} · ${pluralize(
    company.userCount,
    "user",
  )} · $${(company.monthlyBillingCents / 100).toFixed(2)} this month`;

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => setTab(v as TabValue)}
      className="flex flex-1 flex-col gap-0"
    >
      <div className="flex flex-col gap-3 border-b border-border px-7 pt-6 pb-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/companies">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Back to companies"
              className="-ml-1"
            >
              <ArrowLeftIcon />
            </Button>
          </Link>
          <Link
            href="/companies"
            className="hover:text-foreground"
          >
            Companies
          </Link>
          <span>/</span>
          <span className="text-foreground">{company.name}</span>
        </div>

        <div className="flex items-center gap-3">
          <Avatar name={company.name} size="lg" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
              {company.name}
            </h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>

        <TabsList variant="line" className="mt-1 h-auto gap-4 px-0">
          <TabsTrigger value="calls" className="px-1 pb-2.5">
            Calls
          </TabsTrigger>
          <TabsTrigger value="settings" className="px-1 pb-2.5">
            Settings
          </TabsTrigger>
          <TabsTrigger value="users" className="px-1 pb-2.5">
            Users
          </TabsTrigger>
          <TabsTrigger value="billing" className="px-1 pb-2.5">
            Billing
          </TabsTrigger>
        </TabsList>
      </div>

      <PageBody>
        <TabsContent value="calls" className="flex flex-1 flex-col gap-5">
          <CallsClient
            user={user}
            companyId={companyId}
            showHeader={false}
          />
        </TabsContent>
        <TabsContent value="settings" className="flex flex-1 flex-col gap-5">
          <SettingsTab
            company={company}
            currentUserRole={user.role}
            onChanged={fetchCompany}
          />
        </TabsContent>
        <TabsContent value="users" className="flex flex-1 flex-col gap-5">
          <UsersTab
            companyId={companyId}
            users={company.users}
            onChanged={fetchCompany}
          />
        </TabsContent>
        <TabsContent value="billing" className="flex flex-1 flex-col gap-5">
          <BillingTab companyId={companyId} />
        </TabsContent>
      </PageBody>
    </Tabs>
  );
}
