"use client";

import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
} from "@/components/ui/select";

interface Company {
  id: string;
  name: string;
}

export function CompanyFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [companies, setCompanies] = useState<Company[]>([]);

  useEffect(() => {
    fetch("/api/companies?minimal=true")
      .then((res) => res.json())
      .then((data) => setCompanies(data.data ?? []));
  }, []);

  const nameById = new Map(companies.map((c) => [c.id, c.name]));

  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? "")}>
      <SelectTrigger className="w-64">
        <SelectValue placeholder="All companies">
          {(v) => {
            if (!v || v === "all") return "All companies";
            return nameById.get(String(v)) ?? "All companies";
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="all">All companies</SelectItem>
          {companies.map((company) => (
            <SelectItem key={company.id} value={company.id}>
              {company.name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
