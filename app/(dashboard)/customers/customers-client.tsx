"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
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
  const [companyFilter, setCompanyFilter] = useState("");
  const [expandedPhone, setExpandedPhone] = useState<string | null>(null);
  const isAgency = user.role === "root" || user.role === "admin";
  const pageSize = 15;

  const fetchCustomers = useCallback(() => {
    const params = new URLSearchParams({ page: page.toString() });
    if (companyFilter) params.set("companyId", companyFilter);

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

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="flex flex-col gap-4">
      {isAgency && (
        <CompanyFilter value={companyFilter} onChange={setCompanyFilter} />
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Total Calls</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No customers found
                </TableCell>
              </TableRow>
            ) : (
              customers.map((customer) => (
                <>
                  <TableRow
                    key={customer.customerPhone}
                    className="cursor-pointer"
                    onClick={() =>
                      setExpandedPhone(
                        expandedPhone === customer.customerPhone
                          ? null
                          : customer.customerPhone
                      )
                    }
                  >
                    <TableCell>{customer.customerName ?? "—"}</TableCell>
                    <TableCell>{customer.customerPhone}</TableCell>
                    <TableCell>{customer.customerAddress ?? "—"}</TableCell>
                    <TableCell>{customer.customerCity ?? "—"}</TableCell>
                    <TableCell>{customer.totalCalls}</TableCell>
                  </TableRow>
                  {expandedPhone === customer.customerPhone && (
                    <TableRow>
                      <TableCell colSpan={5} className="bg-muted/50 p-0">
                        <CustomerCallsExpanded phone={customer.customerPhone} />
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {customers.length} of {total} customers
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
