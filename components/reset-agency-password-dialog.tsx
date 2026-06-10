"use client";

import { useState } from "react";
import {
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  RefreshCwIcon,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generatePassword } from "@/lib/password";

type AgencyPasswordTarget = {
  id: string;
  email: string;
  role: "root" | "admin";
};

export function ResetAgencyPasswordDialog({
  open,
  onOpenChange,
  target,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: AgencyPasswordTarget;
}) {
  const [password, setPassword] = useState(() => generatePassword());
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedPassword, setConfirmedPassword] = useState<string | null>(
    null,
  );

  function resetState() {
    setPassword(generatePassword());
    setShowPassword(false);
    setLoading(false);
    setError(null);
    setConfirmedPassword(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) resetState();
    onOpenChange(nextOpen);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch(`/api/users/${target.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to reset password");
      return;
    }

    setConfirmedPassword(password);
  }

  if (confirmedPassword) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Password reset complete</DialogTitle>
            <DialogDescription>
              Save this temporary password now. It will not be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Email</Label>
              <p className="font-mono text-sm">{target.email}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Temporary password</Label>
              <p className="rounded-lg bg-muted px-2.5 py-2 font-mono text-sm">
                {confirmedPassword}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => handleOpenChange(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset agency password</DialogTitle>
          <DialogDescription>
            This will replace the login password for {target.email}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="agency-password-reset">Temporary password</Label>
            <div className="flex gap-2">
              <Input
                id="agency-password-reset"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                <span className="sr-only">
                  {showPassword ? "Hide password" : "Show password"}
                </span>
              </Button>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setPassword(generatePassword());
                setShowPassword(true);
              }}
            >
              <RefreshCwIcon data-icon="inline-start" />
              Regenerate
            </Button>
            <Button type="submit" disabled={loading}>
              <KeyRoundIcon data-icon="inline-start" />
              {loading ? "Resetting..." : "Reset password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
