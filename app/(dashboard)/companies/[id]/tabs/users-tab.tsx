"use client";

import { useState } from "react";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { CreateUserDialog } from "@/components/create-user-dialog";

interface UserRow {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

function emailLocalPart(email: string): string {
  const at = email.indexOf("@");
  return at === -1 ? email : email.slice(0, at);
}

export function UsersTab({
  companyId,
  users,
  onChanged,
}: {
  companyId: string;
  users: UserRow[];
  onChanged: () => void;
}) {
  const [showCreate, setShowCreate] = useState(false);

  async function toggleUserActive(userId: string, isActive: boolean) {
    await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    onChanged();
  }

  async function deleteUser(userId: string) {
    if (!confirm("Are you sure you want to delete this user?")) return;
    await fetch(`/api/users/${userId}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users</CardTitle>
        <CardDescription>
          Members with access to this company.
        </CardDescription>
        <CardAction>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            Add User
          </Button>
        </CardAction>
      </CardHeader>
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
          {users.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={4}
                className="h-24 text-center text-sm text-muted-foreground"
              >
                No users yet
              </TableCell>
            </TableRow>
          ) : (
            users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <span className="flex items-center gap-2.5">
                    <Avatar name={emailLocalPart(u.email)} size="sm" />
                    <span className="font-medium">{u.email}</span>
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{u.role}</Badge>
                </TableCell>
                <TableCell>
                  <Switch
                    checked={u.isActive}
                    onCheckedChange={(checked) =>
                      toggleUserActive(u.id, checked)
                    }
                  />
                </TableCell>
                <TableCell>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteUser(u.id)}
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <CreateUserDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        companyId={companyId}
        onCreated={() => {
          setShowCreate(false);
          onChanged();
        }}
      />
    </Card>
  );
}
