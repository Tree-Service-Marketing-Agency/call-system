"use client";

import { useEffect, useMemo, useState } from "react";
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
import { CreateAgencyUserDialog } from "@/components/create-agency-user-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { PageBody } from "@/components/layout/page-body";
import { FilterBar } from "@/components/dashboard/filter-bar";
import type { SessionUser } from "@/lib/auth-helpers";

interface AgencyUserRow {
  id: string;
  email: string;
  role: "root" | "admin";
  isActive: boolean;
}

export function UsersClient({ user }: { user: SessionUser }) {
  const [usersList, setUsersList] = useState<AgencyUserRow[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const isRoot = user.role === "root";

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
        u.email.toLowerCase().includes(q) || u.role.toLowerCase().includes(q),
    );
  }, [usersList, search]);

  return (
    <>
      <PageHeader
        title="Agency users"
        subtitle="Internal team members managing the agency dashboard."
        actions={
          <Button onClick={() => setShowCreate(true)}>
            <PlusIcon data-icon="inline-start" />
            Add agency user
          </Button>
        }
      />

      <PageBody>
        <FilterBar
          search={{
            value: search,
            onChange: setSearch,
            placeholder: "Search by email or role…",
          }}
        />

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="h-32 text-center text-sm text-muted-foreground"
                  >
                    No agency users found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((u) => {
                  const canMutate = isRoot && u.role !== "root";
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.email}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{u.role}</Badge>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={u.isActive}
                          onCheckedChange={(checked) =>
                            toggleActive(u.id, checked)
                          }
                          disabled={!canMutate}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        {canMutate && (
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
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <CreateAgencyUserDialog
          open={showCreate}
          onOpenChange={setShowCreate}
          onCreated={() => {
            setShowCreate(false);
            fetchUsers();
          }}
        />
      </PageBody>
    </>
  );
}
