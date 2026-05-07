"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { generatePassword } from "@/lib/password";

type AgencyRole = "root" | "admin";

export function CreateAgencyUserDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AgencyRole>("admin");
  const [password, setPassword] = useState(() => generatePassword());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role, password }),
    });

    setLoading(false);

    if (res.ok) {
      const data = await res.json();
      setCreatedPassword(data.generatedPassword);
    } else {
      const data = await res.json();
      setError(data.error ?? "Failed to create user");
    }
  }

  function handleClose() {
    setEmail("");
    setRole("admin");
    setPassword(generatePassword());
    setCreatedPassword(null);
    setError(null);
    onCreated();
  }

  if (createdPassword) {
    return (
      <Dialog open={open} onOpenChange={() => handleClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agency user created</DialogTitle>
            <DialogDescription>
              Save these credentials — the password won&apos;t be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <Label>Email</Label>
              <p className="text-sm font-mono">{email}</p>
            </div>
            <div>
              <Label>Password</Label>
              <p className="text-sm font-mono bg-muted p-2 rounded">
                {createdPassword}
              </p>
            </div>
            <Button onClick={handleClose}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create agency user</DialogTitle>
          <DialogDescription>
            Add a new internal team member with cross-company access.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="agency-user-email">Email</Label>
            <Input
              id="agency-user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="agency-user-role">Role</Label>
            <Select
              value={role}
              onValueChange={(v) => v && setRole(v as AgencyRole)}
            >
              <SelectTrigger id="agency-user-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="root">Root</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="agency-user-password">
              Password (auto-generated)
            </Label>
            <Input
              id="agency-user-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create agency user"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
