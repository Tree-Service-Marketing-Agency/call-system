"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, PlusIcon } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { PageBody } from "@/components/layout/page-body";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { StatCard } from "@/components/dashboard/stat-card";
import { CreateCompanyDialog } from "./create-company-dialog";

interface CompanyRow {
  id: string;
  name: string;
  agentCount: number;
  userCount: number;
  monthlyBillingCents: number;
}

export function CompaniesClient() {
  const router = useRouter();
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");

  function fetchCompanies() {
    fetch("/api/companies")
      .then((res) => res.json())
      .then((data) => setCompanies(data.data ?? []));
  }

  useEffect(() => {
    fetchCompanies();
  }, []);

  const filtered = useMemo(() => {
    if (!search) return companies;
    const q = search.toLowerCase();
    return companies.filter((c) => c.name.toLowerCase().includes(q));
  }, [companies, search]);

  const totalAgents = companies.reduce((acc, c) => acc + c.agentCount, 0);
  const totalUsers = companies.reduce((acc, c) => acc + c.userCount, 0);
  const totalBilling = companies.reduce(
    (acc, c) => acc + (c.monthlyBillingCents ?? 0),
    0,
  );

  return (
    <>
      <PageHeader
        title="Companies"
        subtitle="Tenant companies and their billing footprint."
        actions={
          <Button onClick={() => setShowCreate(true)}>
            <PlusIcon data-icon="inline-start" />
            Create company
          </Button>
        }
      />

      <PageBody>
        <StatsGrid>
          <StatCard
            label="Total companies"
            value={companies.length.toLocaleString()}
          />
          <StatCard
            label="Total agents"
            value={totalAgents.toLocaleString()}
          />
          <StatCard label="Total users" value={totalUsers.toLocaleString()} />
          <StatCard
            label="Billing this month"
            value={`$${(totalBilling / 100).toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}`}
          />
        </StatsGrid>

        <FilterBar
          search={{
            value: search,
            onChange: setSearch,
            placeholder: "Search companies…",
          }}
        />

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead className="text-right">Agents</TableHead>
                <TableHead className="text-right">Users</TableHead>
                <TableHead className="text-right">Billing this month</TableHead>
                <TableHead className="w-[80px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-32 text-center text-sm text-muted-foreground"
                  >
                    No companies yet
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((company) => (
                  <TableRow
                    key={company.id}
                    onClick={() => router.push(`/companies/${company.id}`)}
                    className="cursor-pointer"
                  >
                    <TableCell className="font-medium">
                      {company.name}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {company.agentCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {company.userCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      ${(Number(company.monthlyBillingCents ?? 0) / 100).toFixed(2)}
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Link href={`/companies/${company.id}`}>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`View ${company.name}`}
                        >
                          <Eye />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <CreateCompanyDialog
          open={showCreate}
          onOpenChange={setShowCreate}
          onCreated={(id) => {
            setShowCreate(false);
            window.location.href = `/companies/${id}`;
          }}
        />
      </PageBody>
    </>
  );
}
