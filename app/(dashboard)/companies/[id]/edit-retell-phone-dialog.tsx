"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  currentValue: string | null;
  onSaved: () => void;
}

export function EditRetellPhoneDialog({
  open,
  onOpenChange,
  companyId,
  currentValue,
  onSaved,
}: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Retell phone number</DialogTitle>
          <DialogDescription>
            Update the Retell phone number for this company. Leave it empty to
            clear it.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <EditRetellPhoneForm
            key={currentValue ?? ""}
            companyId={companyId}
            currentValue={currentValue}
            onOpenChange={onOpenChange}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditRetellPhoneForm({
  companyId,
  currentValue,
  onOpenChange,
  onSaved,
}: Omit<DialogProps, "open">) {
  const [value, setValue] = useState(currentValue ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed === (currentValue ?? "")) {
      onOpenChange(false);
      return;
    }

    setSaving(true);
    setError(null);
    const res = await fetch(`/api/companies/${companyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ retellPhoneNumber: trimmed }),
    });
    setSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Failed to save");
      return;
    }
    onSaved();
    onOpenChange(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="retell-phone-edit">Retell phone number</Label>
        <Input
          id="retell-phone-edit"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="+1(716)671-1980"
          className="font-mono"
          autoFocus
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onOpenChange(false)}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Saving…" : "Accept"}
        </Button>
      </div>
    </form>
  );
}
