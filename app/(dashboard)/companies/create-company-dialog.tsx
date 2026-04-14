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
import { PlusIcon, XIcon } from "lucide-react";

export function CreateCompanyDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [agentIds, setAgentIds] = useState<string[]>([""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const filteredAgentIds = agentIds.filter((id) => id.trim() !== "");
    if (!name.trim() || filteredAgentIds.length === 0) {
      setError("Company name and at least one agent ID are required");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), agentIds: filteredAgentIds }),
    });

    setLoading(false);

    if (res.ok) {
      const company = await res.json();
      setName("");
      setAgentIds([""]);
      onCreated(company.id);
    } else {
      const data = await res.json();
      setError(data.error ?? "Failed to create company");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Company</DialogTitle>
          <DialogDescription>
            Add a new company and associate Retell agent IDs.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="company-name">Company Name</Label>
            <Input
              id="company-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Agent IDs</Label>
            {agentIds.map((agentId, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={agentId}
                  onChange={(e) => {
                    const updated = [...agentIds];
                    updated[index] = e.target.value;
                    setAgentIds(updated);
                  }}
                  placeholder="agent_..."
                />
                {agentIds.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setAgentIds(agentIds.filter((_, i) => i !== index))
                    }
                  >
                    <XIcon />
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAgentIds([...agentIds, ""])}
            >
              <PlusIcon data-icon="inline-start" />
              Add Agent ID
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create Company"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
