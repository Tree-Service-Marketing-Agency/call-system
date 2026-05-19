"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PlusIcon, XIcon } from "lucide-react";
import type { UserRole } from "@/lib/auth-helpers";
import {
  NOTE_MAX_LENGTH,
  coerceNotificationPhones,
  type NotificationPhone,
} from "@/lib/notification-phones";

interface CompanyForSettings {
  id: string;
  name: string;
  notificationPhones: NotificationPhone[];
  leadSnapWebhook: string | null;
  agents: { id: string; agentId: string }[];
}

function arraysEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function phonesEqual(a: NotificationPhone[], b: NotificationPhone[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].phone !== b[i].phone ||
      a[i].note !== b[i].note ||
      a[i].disabled !== b[i].disabled
    ) {
      return false;
    }
  }
  return true;
}

const EMPTY_PHONE: NotificationPhone = {
  phone: "",
  note: "",
  disabled: false,
};

export function SettingsTab({
  company,
  currentUserRole,
  onChanged,
}: {
  company: CompanyForSettings;
  currentUserRole: UserRole;
  onChanged: () => void;
}) {
  const router = useRouter();

  const [agentsDraft, setAgentsDraft] = useState<string[]>(
    company.agents.length > 0 ? company.agents.map((a) => a.agentId) : [""],
  );
  const [agentsSaving, setAgentsSaving] = useState(false);
  const [agentsError, setAgentsError] = useState<string | null>(null);

  const [phonesDraft, setPhonesDraft] = useState<NotificationPhone[]>(() => {
    const coerced = coerceNotificationPhones(company.notificationPhones);
    return coerced.length > 0 ? coerced : [EMPTY_PHONE];
  });
  const [phonesSaving, setPhonesSaving] = useState(false);
  const [phonesError, setPhonesError] = useState<string | null>(null);

  const [webhookDraft, setWebhookDraft] = useState(
    company.leadSnapWebhook ?? "",
  );
  const [webhookSaving, setWebhookSaving] = useState(false);
  const [webhookError, setWebhookError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const currentAgentIds = useMemo(
    () => company.agents.map((a) => a.agentId),
    [company.agents],
  );
  const currentPhones = useMemo(
    () => coerceNotificationPhones(company.notificationPhones),
    [company.notificationPhones],
  );
  const currentWebhook = company.leadSnapWebhook ?? "";

  const cleanedAgents = agentsDraft.map((a) => a.trim()).filter(Boolean);
  const cleanedPhones: NotificationPhone[] = phonesDraft
    .map((p) => ({
      phone: p.phone.trim(),
      note: p.note.trim(),
      disabled: p.disabled,
    }))
    .filter((p) => p.phone.length > 0);
  const cleanedWebhook = webhookDraft.trim();

  const agentsDirty = !arraysEqual(cleanedAgents, currentAgentIds);
  const phonesDirty = !phonesEqual(cleanedPhones, currentPhones);
  const webhookDirty = cleanedWebhook !== currentWebhook;

  async function patchCompany(body: Record<string, unknown>): Promise<{
    ok: boolean;
    error?: string;
  }> {
    const res = await fetch(`/api/companies/${company.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data?.error ?? "Failed to save" };
    }
    return { ok: true };
  }

  async function saveAgents() {
    if (cleanedAgents.length === 0) {
      setAgentsError("At least one agent ID is required");
      return;
    }
    setAgentsSaving(true);
    setAgentsError(null);
    const { ok, error } = await patchCompany({ agentIds: cleanedAgents });
    setAgentsSaving(false);
    if (!ok) {
      setAgentsError(error ?? "Failed to save");
      return;
    }
    onChanged();
  }

  async function savePhones() {
    setPhonesSaving(true);
    setPhonesError(null);
    const { ok, error } = await patchCompany({
      notificationPhones: cleanedPhones,
    });
    setPhonesSaving(false);
    if (!ok) {
      setPhonesError(error ?? "Failed to save");
      return;
    }
    onChanged();
  }

  async function saveWebhook() {
    setWebhookSaving(true);
    setWebhookError(null);
    const { ok, error } = await patchCompany({
      leadSnapWebhook: cleanedWebhook.length > 0 ? cleanedWebhook : null,
    });
    setWebhookSaving(false);
    if (!ok) {
      setWebhookError(error ?? "Failed to save");
      return;
    }
    onChanged();
  }

  async function deleteCompany() {
    setDeleting(true);
    setDeleteError(null);
    const res = await fetch(`/api/companies/${company.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setDeleteError(body?.error ?? "Failed to delete company");
      setDeleting(false);
      return;
    }
    router.push("/companies");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>Agents</CardTitle>
          <CardDescription>
            Agent IDs assigned to this company.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            {agentsDraft.map((agentId, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={agentId}
                  placeholder="agent_..."
                  onChange={(e) => {
                    const next = [...agentsDraft];
                    next[index] = e.target.value;
                    setAgentsDraft(next);
                  }}
                />
                {agentsDraft.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove agent"
                    onClick={() =>
                      setAgentsDraft(
                        agentsDraft.filter((_, i) => i !== index),
                      )
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
              className="w-fit"
              onClick={() => setAgentsDraft([...agentsDraft, ""])}
            >
              <PlusIcon data-icon="inline-start" />
              Add agent
            </Button>
            {agentsError && (
              <p className="text-sm text-destructive">{agentsError}</p>
            )}
            {agentsDirty && (
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={saveAgents} disabled={agentsSaving}>
                  {agentsSaving ? "Saving…" : "Save"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setAgentsDraft(
                      currentAgentIds.length > 0 ? currentAgentIds : [""],
                    );
                    setAgentsError(null);
                  }}
                  disabled={agentsSaving}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notification phones</CardTitle>
          <CardDescription>
            Numbers that receive lead-snap alerts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            {phonesDraft.map((entry, index) => (
              <div
                key={index}
                className="flex flex-col gap-2 rounded-lg border border-border p-3"
              >
                <div className="flex gap-2">
                  <Input
                    value={entry.phone}
                    placeholder="+1 555 000 0000"
                    onChange={(e) => {
                      const next = [...phonesDraft];
                      next[index] = { ...next[index], phone: e.target.value };
                      setPhonesDraft(next);
                    }}
                  />
                  {phonesDraft.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove phone"
                      onClick={() =>
                        setPhonesDraft(
                          phonesDraft.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <XIcon />
                    </Button>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <Textarea
                    value={entry.note}
                    maxLength={NOTE_MAX_LENGTH}
                    rows={2}
                    placeholder="Note — whose number is this? (optional)"
                    onChange={(e) => {
                      const next = [...phonesDraft];
                      next[index] = {
                        ...next[index],
                        note: e.target.value,
                      };
                      setPhonesDraft(next);
                    }}
                  />
                  <span className="self-end text-xs text-muted-foreground">
                    {entry.note.length}/{NOTE_MAX_LENGTH}
                  </span>
                </div>
                <Label className="flex items-center gap-2 text-sm font-normal">
                  <Switch
                    checked={entry.disabled}
                    onCheckedChange={(checked) => {
                      const next = [...phonesDraft];
                      next[index] = {
                        ...next[index],
                        disabled: checked === true,
                      };
                      setPhonesDraft(next);
                    }}
                  />
                  Disabled — exclude from notifications
                </Label>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => setPhonesDraft([...phonesDraft, EMPTY_PHONE])}
            >
              <PlusIcon data-icon="inline-start" />
              Add phone
            </Button>
            {phonesError && (
              <p className="text-sm text-destructive">{phonesError}</p>
            )}
            {phonesDirty && (
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={savePhones} disabled={phonesSaving}>
                  {phonesSaving ? "Saving…" : "Save"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setPhonesDraft(
                      currentPhones.length > 0
                        ? currentPhones
                        : [EMPTY_PHONE],
                    );
                    setPhonesError(null);
                  }}
                  disabled={phonesSaving}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lead snap webhook</CardTitle>
          <CardDescription>
            Token used to authenticate lead-snap deliveries.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            <Input
              value={webhookDraft}
              placeholder="LeadSnap token"
              onChange={(e) => setWebhookDraft(e.target.value)}
            />
            {webhookError && (
              <p className="text-sm text-destructive">{webhookError}</p>
            )}
            {webhookDirty && (
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  onClick={saveWebhook}
                  disabled={webhookSaving}
                >
                  {webhookSaving ? "Saving…" : "Save"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setWebhookDraft(currentWebhook);
                    setWebhookError(null);
                  }}
                  disabled={webhookSaving}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {currentUserRole === "root" && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-destructive">Danger zone</CardTitle>
            <CardDescription>
              Permanently delete this company and everything attached to it
              (users, calls, billing history, agent associations). This action
              cannot be undone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button variant="destructive" size="sm" disabled={deleting}>
                    {deleting ? "Deleting…" : "Delete company"}
                  </Button>
                }
              />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Delete company &ldquo;{company.name}&rdquo;?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the company, all its users,
                    calls, billing history and agent associations. This action
                    cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {deleteError && (
                  <p className="text-sm text-destructive">{deleteError}</p>
                )}
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleting}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={deleteCompany}
                    disabled={deleting}
                  >
                    {deleting ? "Deleting…" : "Delete company"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
