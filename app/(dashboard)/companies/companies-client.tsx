"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { DownloadIcon, PlusIcon } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { PageBody } from "@/components/layout/page-body";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { DataTablePagination } from "@/components/dashboard/data-table-pagination";
import { CreateCompanyDialog } from "./create-company-dialog";

interface CompanyRow {
  id: string;
  name: string;
  agentCount: number;
  userCount: number;
  monthlyBillingCents: number;
}

interface CompaniesResponse {
  data: CompanyRow[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 25;
const FILTER_DEBOUNCE_MS = 250;

export function CompaniesClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initialPage = parseInt(searchParams.get("page") ?? "1", 10) || 1;
  const initialSearch = searchParams.get("q") ?? "";

  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(initialPage);
  const [search, setSearch] = useState(initialSearch);
  const [showCreate, setShowCreate] = useState(false);
  const isFirstSyncRef = useRef(true);

  const fetchCompanies = useCallback((qs: URLSearchParams) => {
    fetch(`/api/companies?${qs.toString()}`)
      .then((res) => res.json())
      .then((data: CompaniesResponse) => {
        setCompanies(data.data ?? []);
        setTotal(data.total ?? 0);
      });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("page", page.toString());
    params.set("pageSize", PAGE_SIZE.toString());
    if (search) params.set("q", search);

    if (isFirstSyncRef.current) {
      isFirstSyncRef.current = false;
      fetchCompanies(params);
      return;
    }

    const handle = setTimeout(() => {
      const urlParams = new URLSearchParams();
      if (page !== 1) urlParams.set("page", page.toString());
      if (search) urlParams.set("q", search);
      const next = urlParams.toString();
      router.replace(next ? `${pathname}?${next}` : pathname, {
        scroll: false,
      });
      fetchCompanies(params);
    }, FILTER_DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [page, search, fetchCompanies, pathname, router]);

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
        <FilterBar
          search={{
            value: search,
            onChange: (v) => {
              setSearch(v);
              setPage(1);
            },
            placeholder: "Search companies…",
          }}
          actions={
            <Button variant="outline" size="sm" disabled>
              <DownloadIcon data-icon="inline-start" />
              Export
            </Button>
          }
        />

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead className="text-right">Agents</TableHead>
                <TableHead className="text-right">Users</TableHead>
                <TableHead className="text-right">Billing this month</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="h-32 text-center text-sm text-muted-foreground"
                  >
                    No companies yet
                  </TableCell>
                </TableRow>
              ) : (
                companies.map((company) => (
                  <TableRow
                    key={company.id}
                    onClick={() => router.push(`/companies/${company.id}`)}
                    className="cursor-pointer"
                  >
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2.5">
                        <Avatar name={company.name} size="sm" />
                        <span>{company.name}</span>
                      </span>
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
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <DataTablePagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            itemLabel="companies"
            onPageChange={setPage}
          />
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
