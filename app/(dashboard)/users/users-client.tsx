"use client";

import { useEffect, useState } from "react";
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
import { CreateUserDialog } from "@/components/create-user-dialog";
import type { SessionUser } from "@/lib/auth-helpers";

interface UserRow {
  id: string;
  email: string;
  role: string;
  companyId: string | null;
  isActive: boolean;
}

export function UsersClient({ user }: { user: SessionUser }) {
  const [usersList, setUsersList] = useState<UserRow[]>([]);
  const [showCreate, setShowCreate] = useState(false);

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
    if (!confirm("Are you sure you want to delete this user?")) return;
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
              <TableHead>Role</TableHead>
              <TableHead>Active</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usersList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No users found
                </TableCell>
              </TableRow>
            ) : (
              usersList.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.email}</TableCell>
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
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteUser(u.id)}
                      >
                        Delete
                      </Button>
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
