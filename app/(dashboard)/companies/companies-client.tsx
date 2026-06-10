"use client";

import { useCallback, useRef, useState } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { PageBody } from "@/components/layout/page-body";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { DataTablePagination } from "@/components/dashboard/data-table-pagination";
import { formatUsPhone } from "@/lib/phone";
import type { RetellStatus } from "@/lib/retell-numbers";
import { CreateCompanyDialog } from "./create-company-dialog";

interface CompanyRow {
  id: string;
  name: string;
  retellStatus: RetellStatus;
  phoneNumbers: string[];
}

const STATUS_BADGES: Record<
  Exclude<RetellStatus, "none">,
  { label: string; variant: "success" | "warning" | "secondary" }
> = {
  active: { label: "Active", variant: "success" },
  partial: { label: "Partial", variant: "warning" },
  inactive: { label: "Inactive", variant: "secondary" },
};

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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchCompanies = useCallback(
    (nextPage: number, nextSearch: string) => {
      const params = new URLSearchParams();
      params.set("page", nextPage.toString());
      params.set("pageSize", PAGE_SIZE.toString());
      if (nextSearch) params.set("q", nextSearch);
      fetch(`/api/companies?${params.toString()}`)
        .then((res) => res.json())
        .then((data: CompaniesResponse) => {
          setCompanies(data.data ?? []);
          setTotal(data.total ?? 0);
        });
    },
    [],
  );

  const scheduleFetch = useCallback(
    (nextPage: number, nextSearch: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const urlParams = new URLSearchParams();
        if (nextPage !== 1) urlParams.set("page", nextPage.toString());
        if (nextSearch) urlParams.set("q", nextSearch);
        const qs = urlParams.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        fetchCompanies(nextPage, nextSearch);
      }, FILTER_DEBOUNCE_MS);
    },
    [router, pathname, fetchCompanies],
  );

  useMountEffect(() => {
    fetchCompanies(page, search);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  });

  return (
    <>
      <PageHeader
        title="Companies"
        subtitle="Tenant companies and their Retell numbers."
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
              scheduleFetch(1, v);
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
                <TableHead>Retell number</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
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
                    <TableCell className="tabular-nums">
                      {company.phoneNumbers.length > 0 ? (
                        <span>
                          {formatUsPhone(company.phoneNumbers[0])}
                          {company.phoneNumbers.length > 1 && (
                            <span className="text-muted-foreground">
                              {" "}
                              +{company.phoneNumbers.length - 1}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {company.retellStatus === "none" ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <Badge
                          variant={STATUS_BADGES[company.retellStatus].variant}
                        >
                          {STATUS_BADGES[company.retellStatus].label}
                        </Badge>
                      )}
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
            onPageChange={(p) => {
              setPage(p);
              scheduleFetch(p, search);
            }}
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
