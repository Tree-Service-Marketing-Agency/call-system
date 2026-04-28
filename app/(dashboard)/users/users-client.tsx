"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PlusIcon } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CreateUserDialog } from "@/components/create-user-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { PageBody } from "@/components/layout/page-body";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { StatCard } from "@/components/dashboard/stat-card";
import type { SessionUser } from "@/lib/auth-helpers";

interface UserRow {
  id: string;
  email: string;
  role: string;
  companyId: string | null;
  companyName: string | null;
  isActive: boolean;
}

export function UsersClient({ user }: { user: SessionUser }) {
  const [usersList, setUsersList] = useState<UserRow[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const isAgency = user.role === "root" || user.role === "admin";

  function fetchUsers() {
    fetch("/api/users")
      .then((res) => res.json())
      .then((data) => setUsersList(data.data ?? []));
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  async function toggleActive(userId: string, isActive: boolean) {
    await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    fetchUsers();
  }

  async function deleteUser(userId: string) {
    await fetch(`/api/users/${userId}`, { method: "DELETE" });
    fetchUsers();
  }

  const filtered = useMemo(() => {
    if (!search) return usersList;
    const q = search.toLowerCase();
    return usersList.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q) ||
        (u.companyName?.toLowerCase().includes(q) ?? false),
    );
  }, [usersList, search]);

  const activeCount = usersList.filter((u) => u.isActive).length;
  const adminCount = usersList.filter((u) =>
    ["root", "admin", "staff_admin"].includes(u.role),
  ).length;
  const staffCount = usersList.filter((u) => u.role === "staff").length;
  const canCreate = user.role === "staff_admin" && Boolean(user.companyId);

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Members with access to your dashboards."
        actions={
          canCreate ? (
            <Button onClick={() => setShowCreate(true)}>
              <PlusIcon data-icon="inline-start" />
              Add user
            </Button>
          ) : null
        }
      />

      <PageBody>
        <StatsGrid>
          <StatCard
            label="Total users"
            value={usersList.length.toLocaleString()}
          />
          <StatCard label="Active" value={activeCount.toLocaleString()} />
          <StatCard label="Admins" value={adminCount.toLocaleString()} />
          <StatCard label="Staff" value={staffCount.toLocaleString()} />
        </StatsGrid>

        <FilterBar
          search={{
            value: search,
            onChange: setSearch,
            placeholder: "Search by email, role or company…",
          }}
        />

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                {isAgency && <TableHead>Company</TableHead>}
                <TableHead>Role</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={isAgency ? 5 : 4}
                    className="h-32 text-center text-sm text-muted-foreground"
                  >
                    No users found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.email}</TableCell>
                    {isAgency && (
                      <TableCell className="text-muted-foreground">
                        {u.companyId && u.companyName ? (
                          <Link
                            href={`/companies/${u.companyId}`}
                            className="hover:text-foreground hover:underline"
                          >
                            {u.companyName}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      <Badge variant="secondary">{u.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={u.isActive}
                        onCheckedChange={(checked) =>
                          toggleActive(u.id, checked)
                        }
                        disabled={u.role === "root"}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      {u.role !== "root" && (
                        <AlertDialog>
                          <AlertDialogTrigger
                            render={
                              <Button variant="destructive" size="sm">
                                Delete
                              </Button>
                            }
                          />
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Delete user &ldquo;{u.email}&rdquo;?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete the user. This
                                action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                variant="destructive"
                                onClick={() => deleteUser(u.id)}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {canCreate && (
          <CreateUserDialog
            open={showCreate}
            onOpenChange={setShowCreate}
            companyId={user.companyId!}
            onCreated={() => {
              setShowCreate(false);
              fetchUsers();
            }}
          />
        )}
      </PageBody>
    </>
  );
}
