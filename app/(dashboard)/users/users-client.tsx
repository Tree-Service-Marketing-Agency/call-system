"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

  return (
    <div className="flex flex-col gap-4">
      {user.role === "staff_admin" && user.companyId && (
        <div className="flex justify-end">
          <Button onClick={() => setShowCreate(true)}>Add User</Button>
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              {isAgency && <TableHead>Company</TableHead>}
              <TableHead>Role</TableHead>
              <TableHead>Active</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usersList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isAgency ? 5 : 4} className="text-center text-muted-foreground">
                  No users found
                </TableCell>
              </TableRow>
            ) : (
              usersList.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.email}</TableCell>
                  {isAgency && (
                    <TableCell>
                      {u.companyId && u.companyName ? (
                        <Link
                          href={`/companies/${u.companyId}`}
                          className="hover:underline"
                        >
                          {u.companyName}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  )}
                  <TableCell>
                    <Badge variant="outline">{u.role}</Badge>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={u.isActive}
                      onCheckedChange={(checked) => toggleActive(u.id, checked)}
                      disabled={u.role === "root"}
                    />
                  </TableCell>
                  <TableCell>
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

      {user.role === "staff_admin" && user.companyId && (
        <CreateUserDialog
          open={showCreate}
          onOpenChange={setShowCreate}
          companyId={user.companyId}
          onCreated={() => {
            setShowCreate(false);
            fetchUsers();
          }}
        />
      )}
    </div>
  );
}
