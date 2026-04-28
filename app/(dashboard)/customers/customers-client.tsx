"use client";

import { Fragment, useEffect, useState, useCallback } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { PageBody } from "@/components/layout/page-body";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { DataTablePagination } from "@/components/dashboard/data-table-pagination";
import { CompanyFilter } from "@/components/company-filter";
import { CustomerCallsExpanded } from "./customer-calls-expanded";
import type { SessionUser } from "@/lib/auth-helpers";

interface CustomerRow {
  customerPhone: string;
  customerName: string | null;
  customerAddress: string | null;
  customerCity: string | null;
  totalCalls: number;
}

export function CustomersClient({ user }: { user: SessionUser }) {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [expandedPhone, setExpandedPhone] = useState<string | null>(null);
  const isAgency = user.role === "root" || user.role === "admin";
  const pageSize = 15;

  const fetchCustomers = useCallback(() => {
    const params = new URLSearchParams({ page: page.toString() });
    if (companyFilter && companyFilter !== "all")
      params.set("companyId", companyFilter);

    fetch(`/api/customers?${params}`)
      .then((res) => res.json())
      .then((data) => {
        setCustomers(data.data);
        setTotal(data.total);
      });
  }, [page, companyFilter]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const filtered = search
    ? customers.filter((c) => {
        const q = search.toLowerCase();
        return (
          (c.customerName?.toLowerCase().includes(q) ?? false) ||
          c.customerPhone.toLowerCase().includes(q) ||
          (c.customerCity?.toLowerCase().includes(q) ?? false)
        );
      })
    : customers;

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="People who have called your agents."
      />

      <PageBody>
        <FilterBar
          search={{
            value: search,
            onChange: (v) => {
              setSearch(v);
              setPage(1);
            },
            placeholder: "Search by name, phone or city…",
          }}
          filters={
            isAgency ? (
              <CompanyFilter
                value={companyFilter}
                onChange={(v) => {
                  setCompanyFilter(v);
                  setPage(1);
                }}
              />
            ) : null
          }
        />

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>City</TableHead>
                <TableHead className="text-right">Total calls</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-32 text-center text-sm text-muted-foreground"
                  >
                    No customers found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((customer) => (
                  <Fragment key={customer.customerPhone}>
                    <TableRow
                      data-state={
                        expandedPhone === customer.customerPhone
                          ? "selected"
                          : undefined
                      }
                      className="cursor-pointer"
                      onClick={() =>
                        setExpandedPhone(
                          expandedPhone === customer.customerPhone
                            ? null
                            : customer.customerPhone,
                        )
                      }
                    >
                      <TableCell className="font-medium">
                        {customer.customerName ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-[12.5px] text-muted-foreground">
                        {customer.customerPhone}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {customer.customerAddress ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {customer.customerCity ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {customer.totalCalls}
                      </TableCell>
                    </TableRow>
                    {expandedPhone === customer.customerPhone && (
                      <TableRow>
                        <TableCell colSpan={5} className="bg-muted/40 p-0">
                          <CustomerCallsExpanded
                            phone={customer.customerPhone}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))
              )}
            </TableBody>
          </Table>
          <DataTablePagination
            page={page}
            pageSize={pageSize}
            total={total}
            itemLabel="customers"
            onPageChange={setPage}
          />
        </div>
      </PageBody>
    </>
  );
}
