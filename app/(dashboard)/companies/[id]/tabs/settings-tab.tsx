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
import { PencilIcon, PlusIcon, XIcon } from "lucide-react";
import type { UserRole } from "@/lib/auth-helpers";
import { isValidAreaCode } from "@/lib/area-code";
import { canToggleRetellNumber } from "@/lib/retell-numbers";
import { formatUsPhone } from "@/lib/phone";
import {
  NOTE_MAX_LENGTH,
  coerceNotificationPhones,
  type NotificationPhone,
} from "@/lib/notification-phones";

export interface RetellNumberRow {
  id: string;
  agentId: string;
  phoneNumber: string | null;
  enabled: boolean;
}

interface CompanyForSettings {
  id: string;
  name: string;
  areaCode: string | null;
  notificationPhones: NotificationPhone[];
  leadSnapWebhook: string | null;
  retellNumbers: RetellNumberRow[];
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

  const [areaCodeDraft, setAreaCodeDraft] = useState(company.areaCode ?? "");
  const [areaCodeSaving, setAreaCodeSaving] = useState(false);
  const [areaCodeError, setAreaCodeError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const currentPhones = useMemo(
    () => coerceNotificationPhones(company.notificationPhones),
    [company.notificationPhones],
  );
  const currentWebhook = company.leadSnapWebhook ?? "";
  const currentAreaCode = company.areaCode ?? "";

  const cleanedPhones: NotificationPhone[] = phonesDraft
    .map((p) => ({
      phone: p.phone.trim(),
      note: p.note.trim(),
      disabled: p.disabled,
    }))
    .filter((p) => p.phone.length > 0);
  const cleanedWebhook = webhookDraft.trim();
  const cleanedAreaCode = areaCodeDraft.trim();

  const phonesDirty = !phonesEqual(cleanedPhones, currentPhones);
  const webhookDirty = cleanedWebhook !== currentWebhook;
  const areaCodeDirty = cleanedAreaCode !== currentAreaCode;

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

  async function saveAreaCode() {
    if (!isValidAreaCode(cleanedAreaCode)) {
      setAreaCodeError("Area code must be exactly 3 digits");
      return;
    }
    setAreaCodeSaving(true);
    setAreaCodeError(null);
    const { ok, error } = await patchCompany({ areaCode: cleanedAreaCode });
    setAreaCodeSaving(false);
    if (!ok) {
      setAreaCodeError(error ?? "Failed to save");
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
      <RetellNumbersCard
        companyId={company.id}
        numbers={company.retellNumbers}
        currentUserRole={currentUserRole}
        onChanged={onChanged}
      />

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
                    placeholder="+1(716)671-1980"
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
          <CardTitle>Retell</CardTitle>
          <CardDescription>
            Company-level Retell configuration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            <Label htmlFor="area-code">Area code</Label>
            <Input
              id="area-code"
              value={areaCodeDraft}
              placeholder="415"
              onChange={(e) => setAreaCodeDraft(e.target.value)}
            />
            {areaCodeError && (
              <p className="text-sm text-destructive">{areaCodeError}</p>
            )}
            {areaCodeDirty && (
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  onClick={saveAreaCode}
                  disabled={areaCodeSaving}
                >
                  {areaCodeSaving ? "Saving…" : "Save"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setAreaCodeDraft(currentAreaCode);
                    setAreaCodeError(null);
                  }}
                  disabled={areaCodeSaving}
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
              (users, calls, billing history, Retell numbers). This action
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
                    calls, billing history and Retell numbers. This action
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

// ─── Retell numbers ──────────────────────────────────────────

const EMPTY_NUMBER_DRAFT = { agentId: "", phoneNumber: "" };

function RetellNumbersCard({
  companyId,
  numbers,
  currentUserRole,
  onChanged,
}: {
  companyId: string;
  numbers: RetellNumberRow[];
  currentUserRole: UserRole;
  onChanged: () => void;
}) {
  // Optimistic toggle state: overrides win over the server value while a
  // toggle is in flight; a failed toggle removes the override (revert).
  const [enabledOverrides, setEnabledOverrides] = useState<
    Record<string, boolean>
  >({});
  const [pendingToggleIds, setPendingToggleIds] = useState<Set<string>>(
    new Set(),
  );
  const [confirmDisable, setConfirmDisable] = useState<RetellNumberRow | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  // Add / edit inline form. editingId === "new" → add form.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(EMPTY_NUMBER_DRAFT);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  function isEnabled(row: RetellNumberRow) {
    return enabledOverrides[row.id] ?? row.enabled;
  }

  async function performToggle(row: RetellNumberRow, next: boolean) {
    setError(null);
    setEnabledOverrides((prev) => ({ ...prev, [row.id]: next }));
    setPendingToggleIds((prev) => new Set(prev).add(row.id));

    const res = await fetch(
      `/api/companies/${companyId}/retell-numbers/${row.id}/toggle`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      },
    );

    setPendingToggleIds((prev) => {
      const copy = new Set(prev);
      copy.delete(row.id);
      return copy;
    });

    if (!res.ok) {
      // Revert the optimistic move and surface the error.
      setEnabledOverrides((prev) => {
        const copy = { ...prev };
        delete copy[row.id];
        return copy;
      });
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Failed to toggle number");
      return;
    }

    onChanged();
  }

  function handleToggle(row: RetellNumberRow, next: boolean) {
    if (next) {
      // Turning on needs no confirmation.
      void performToggle(row, true);
    } else {
      setConfirmDisable(row);
    }
  }

  function startEdit(row: RetellNumberRow) {
    setEditingId(row.id);
    setDraft({
      agentId: row.agentId,
      phoneNumber: row.phoneNumber ? formatUsPhone(row.phoneNumber) : "",
    });
    setFormError(null);
  }

  function startAdd() {
    setEditingId("new");
    setDraft(EMPTY_NUMBER_DRAFT);
    setFormError(null);
  }

  function cancelForm() {
    setEditingId(null);
    setDraft(EMPTY_NUMBER_DRAFT);
    setFormError(null);
  }

  async function saveForm() {
    const agentId = draft.agentId.trim();
    const phoneNumber = draft.phoneNumber.trim();
    if (agentId.length === 0) {
      setFormError("Agent ID is required");
      return;
    }
    setSaving(true);
    setFormError(null);

    const isNew = editingId === "new";
    const url = isNew
      ? `/api/companies/${companyId}/retell-numbers`
      : `/api/companies/${companyId}/retell-numbers/${editingId}`;
    const res = await fetch(url, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId,
        phoneNumber: phoneNumber.length > 0 ? phoneNumber : null,
      }),
    });
    setSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setFormError(data?.error ?? "Failed to save");
      return;
    }
    cancelForm();
    onChanged();
  }

  async function deleteNumber(row: RetellNumberRow) {
    setError(null);
    setDeletingId(row.id);
    const res = await fetch(
      `/api/companies/${companyId}/retell-numbers/${row.id}`,
      { method: "DELETE" },
    );
    setDeletingId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Failed to delete number");
      return;
    }
    if (editingId === row.id) cancelForm();
    onChanged();
  }

  const canManage = currentUserRole === "root" || currentUserRole === "admin";

  const numberForm = (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="retell-number-agent">Agent ID</Label>
        <Input
          id="retell-number-agent"
          value={draft.agentId}
          placeholder="agent_..."
          onChange={(e) => setDraft({ ...draft, agentId: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="retell-number-phone">Phone number (optional)</Label>
        <Input
          id="retell-number-phone"
          value={draft.phoneNumber}
          placeholder="+1(716)671-1980"
          className="font-mono"
          onChange={(e) =>
            setDraft({ ...draft, phoneNumber: e.target.value })
          }
        />
      </div>
      {formError && <p className="text-sm text-destructive">{formError}</p>}
      <div className="mt-1 flex gap-2">
        <Button size="sm" onClick={saveForm} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={cancelForm}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Retell numbers</CardTitle>
        <CardDescription>
          Number ↔ agent pairs for this company. The switch enables or
          disables inbound routing live on Retell.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          {numbers.length === 0 && editingId !== "new" && (
            <p className="text-sm text-muted-foreground">
              No Retell numbers yet.
            </p>
          )}

          {numbers.map((row) => {
            if (editingId === row.id) {
              return <div key={row.id}>{numberForm}</div>;
            }

            const eligibility = canToggleRetellNumber({
              phoneNumber: row.phoneNumber,
              role: currentUserRole,
            });
            const toggleHint = eligibility.allowed
              ? undefined
              : eligibility.reason === "no_phone"
                ? "Add a phone number to enable toggling"
                : "Only root can toggle";

            return (
              <div
                key={row.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  {row.phoneNumber ? (
                    <span className="font-mono text-sm text-foreground">
                      {formatUsPhone(row.phoneNumber)}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground/60">
                      No phone yet
                    </span>
                  )}
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {row.agentId}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span
                    title={toggleHint}
                    className="flex items-center gap-2"
                  >
                    <span className="text-xs text-muted-foreground">
                      {isEnabled(row) ? "Active" : "Inactive"}
                    </span>
                    <Switch
                      checked={isEnabled(row)}
                      disabled={
                        !eligibility.allowed || pendingToggleIds.has(row.id)
                      }
                      aria-label={
                        toggleHint ??
                        `Toggle ${formatUsPhone(row.phoneNumber)}`
                      }
                      onCheckedChange={(checked) =>
                        handleToggle(row, checked === true)
                      }
                    />
                  </span>
                  {toggleHint && (
                    <span className="sr-only">{toggleHint}</span>
                  )}
                  {canManage && (
                    <span className="flex items-center gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Edit number"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => startEdit(row)}
                      >
                        <PencilIcon />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Delete number"
                        className="text-muted-foreground hover:text-destructive"
                        disabled={deletingId === row.id}
                        onClick={() => deleteNumber(row)}
                      >
                        <XIcon />
                      </Button>
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {editingId === "new" && numberForm}

          {canManage && editingId === null && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={startAdd}
            >
              <PlusIcon data-icon="inline-start" />
              Add number
            </Button>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </CardContent>

      <AlertDialog
        open={confirmDisable !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDisable(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Disable {formatUsPhone(confirmDisable?.phoneNumber) || "number"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Inbound calls to this number will stop being answered until it
              is enabled again. The change is applied live on Retell.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (confirmDisable) {
                  void performToggle(confirmDisable, false);
                }
                setConfirmDisable(null);
              }}
            >
              Disable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
