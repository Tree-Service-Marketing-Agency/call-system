"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { CreateCompanyDialog } from "./create-company-dialog";

interface CompanyRow {
  id: string;
  name: string;
  agentCount: number;
  userCount: number;
  monthlyBillingCents: number;
}

export function CompaniesClient() {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  function fetchCompanies() {
    fetch("/api/companies")
      .then((res) => res.json())
      .then((data) => setCompanies(data.data ?? []));
  }

  useEffect(() => {
    fetchCompanies();
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowCreate(true)}>Create Company</Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Agents</TableHead>
              <TableHead>Users</TableHead>
              <TableHead>Billing (this month)</TableHead>
              <TableHead className="w-[80px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No companies yet
                </TableCell>
              </TableRow>
            ) : (
              companies.map((company) => (
                <TableRow key={company.id}>
                  <TableCell>{company.name}</TableCell>
                  <TableCell>{company.agentCount}</TableCell>
                  <TableCell>{company.userCount}</TableCell>
                  <TableCell>${(Number(company.monthlyBillingCents ?? 0) / 100).toFixed(2)}</TableCell>
                  <TableCell className="text-right">
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
    </div>
  );
}
