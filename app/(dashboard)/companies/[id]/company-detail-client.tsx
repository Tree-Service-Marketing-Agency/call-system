"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ArrowLeftIcon, PlusIcon, XIcon } from "lucide-react";
import { CreateUserDialog } from "@/components/create-user-dialog";
import type { UserRole } from "@/lib/auth-helpers";

interface CompanyDetail {
  id: string;
  name: string;
  createdAt: string;
  notificationPhones: string[];
  leadSnapWebhook: string | null;
  agents: { id: string; agentId: string }[];
  users: {
    id: string;
    email: string;
    role: string;
    isActive: boolean;
    createdAt: string;
  }[];
}

function arraysEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function CompanyDetailClient({
  companyId,
  currentUserRole,
}: {
  companyId: string;
  currentUserRole: UserRole;
}) {
  const router = useRouter();
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Agents draft
  const [agentsDraft, setAgentsDraft] = useState<string[]>([""]);
  const [agentsSaving, setAgentsSaving] = useState(false);
  const [agentsError, setAgentsError] = useState<string | null>(null);

  // Notification phones draft
  const [phonesDraft, setPhonesDraft] = useState<string[]>([""]);
  const [phonesSaving, setPhonesSaving] = useState(false);
  const [phonesError, setPhonesError] = useState<string | null>(null);

  // Lead snap webhook draft
  const [webhookDraft, setWebhookDraft] = useState("");
  const [webhookSaving, setWebhookSaving] = useState(false);
  const [webhookError, setWebhookError] = useState<string | null>(null);

  const fetchCompany = useCallback(() => {
    fetch(`/api/companies/${companyId}`)
      .then((res) => res.json())
      .then((data: CompanyDetail) => {
        setCompany(data);
        setAgentsDraft(
          data.agents.length > 0 ? data.agents.map((a) => a.agentId) : [""]
        );
        setPhonesDraft(
          data.notificationPhones.length > 0 ? data.notificationPhones : [""]
        );
        setWebhookDraft(data.leadSnapWebhook ?? "");
        setAgentsError(null);
        setPhonesError(null);
        setWebhookError(null);
      });
  }, [companyId]);

  useEffect(() => {
    fetchCompany();
  }, [fetchCompany]);

  const currentAgentIds = useMemo(
    () => company?.agents.map((a) => a.agentId) ?? [],
    [company]
  );
  const currentPhones = useMemo(
    () => company?.notificationPhones ?? [],
    [company]
  );
  const currentWebhook = company?.leadSnapWebhook ?? "";

  const cleanedAgents = agentsDraft.map((a) => a.trim()).filter(Boolean);
  const cleanedPhones = phonesDraft.map((p) => p.trim()).filter(Boolean);
  const cleanedWebhook = webhookDraft.trim();

  const agentsDirty = !arraysEqual(cleanedAgents, currentAgentIds);
  const phonesDirty = !arraysEqual(cleanedPhones, currentPhones);
  const webhookDirty = cleanedWebhook !== currentWebhook;

  async function toggleUserActive(userId: string, isActive: boolean) {
    await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    fetchCompany();
  }

  async function deleteUser(userId: string) {
    if (!confirm("Are you sure you want to delete this user?")) return;
    await fetch(`/api/users/${userId}`, { method: "DELETE" });
    fetchCompany();
  }

  async function deleteCompany() {
    setDeleting(true);
    setDeleteError(null);
    const res = await fetch(`/api/companies/${companyId}`, {
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

  async function patchCompany(body: Record<string, unknown>): Promise<{
    ok: boolean;
    error?: string;
  }> {
    const res = await fetch(`/api/companies/${companyId}`, {
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
    fetchCompany();
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
    fetchCompany();
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
    fetchCompany();
  }

  function resetAgents() {
    setAgentsDraft(currentAgentIds.length > 0 ? currentAgentIds : [""]);
    setAgentsError(null);
  }
  function resetPhones() {
    setPhonesDraft(currentPhones.length > 0 ? currentPhones : [""]);
    setPhonesError(null);
  }
  function resetWebhook() {
    setWebhookDraft(currentWebhook);
    setWebhookError(null);
  }

  if (!company) return <p>Loading...</p>;

  return (
    <>
      <div className="flex items-center gap-4">
        <Link href="/companies">
          <Button variant="ghost" size="icon">
            <ArrowLeftIcon />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">{company.name}</h1>
        {currentUserRole === "root" && (
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  variant="destructive"
                  size="sm"
                  className="ml-auto"
                  disabled={deleting}
                >
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
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Agents</CardTitle>
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
                      setAgentsDraft(agentsDraft.filter((_, i) => i !== index))
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
                  onClick={resetAgents}
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
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            {phonesDraft.map((phone, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={phone}
                  placeholder="+1 555 000 0000"
                  onChange={(e) => {
                    const next = [...phonesDraft];
                    next[index] = e.target.value;
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
                      setPhonesDraft(phonesDraft.filter((_, i) => i !== index))
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
              onClick={() => setPhonesDraft([...phonesDraft, ""])}
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
                  onClick={resetPhones}
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
                  onClick={resetWebhook}
                  disabled={webhookSaving}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Users</CardTitle>
          <Button size="sm" onClick={() => setShowCreateUser(true)}>
            Add User
          </Button>
        </CardHeader>
        <CardContent>
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
              {company.users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.email}</TableCell>
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
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CreateUserDialog
        open={showCreateUser}
        onOpenChange={setShowCreateUser}
        companyId={companyId}
        onCreated={() => {
          setShowCreateUser(false);
          fetchCompany();
        }}
      />
    </>
  );
}
