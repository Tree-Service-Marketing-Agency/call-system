"use client";

import { useState } from "react";
import Link from "next/link";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { PlusIcon, XIcon } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ALLOWED_MODELS } from "@/lib/ai/models";
import type { SessionUser } from "@/lib/auth-helpers";

interface CatalogField {
  name: string;
  description: string;
}

interface TextAgent {
  companyId: string;
  enabled: boolean;
  model: string;
  systemPrompt: string;
  catalog: CatalogField[];
  embedKey: string;
  allowedOrigins: string[];
}

interface TextAgentResponse {
  agent: TextAgent;
  canEdit: boolean;
  canManageEmbed: boolean;
}

const EMPTY_FIELD: CatalogField = { name: "", description: "" };

function catalogEqual(a: CatalogField[], b: CatalogField[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].name !== b[i].name || a[i].description !== b[i].description) {
      return false;
    }
  }
  return true;
}

export function TextAgentTab({
  companyId,
}: {
  companyId: string;
  companyName: string;
  user: SessionUser;
}) {
  const [agent, setAgent] = useState<TextAgent | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [canManageEmbed, setCanManageEmbed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Enabled (optimistic toggle).
  const [enabledOverride, setEnabledOverride] = useState<boolean | null>(null);
  const [togglePending, setTogglePending] = useState(false);
  const [enabledError, setEnabledError] = useState<string | null>(null);

  // Model.
  const [modelSaving, setModelSaving] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  // System prompt draft.
  const [promptDraft, setPromptDraft] = useState("");
  const [promptSaving, setPromptSaving] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);

  // Catalog draft.
  const [catalogDraft, setCatalogDraft] = useState<CatalogField[]>([]);
  const [catalogSaving, setCatalogSaving] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useMountEffect(() => {
    let cancelled = false;
    fetch(`/api/companies/${companyId}/text-agent`)
      .then((res) => res.json())
      .then((data: TextAgentResponse) => {
        if (cancelled) return;
        setAgent(data.agent);
        setCanEdit(data.canEdit);
        setCanManageEmbed(data.canManageEmbed);
        setPromptDraft(data.agent.systemPrompt);
        setCatalogDraft(data.agent.catalog);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  });

  async function patchAgent(
    body: Record<string, unknown>,
  ): Promise<{ ok: true; data: TextAgentResponse } | { ok: false; error: string }> {
    const res = await fetch(`/api/companies/${companyId}/text-agent`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data?.error ?? "Could not save" };
    }
    const data = (await res.json()) as TextAgentResponse;
    return { ok: true, data };
  }

  function applyResponse(data: TextAgentResponse) {
    setAgent(data.agent);
    setCanEdit(data.canEdit);
    setCanManageEmbed(data.canManageEmbed);
  }

  async function toggleEnabled(next: boolean) {
    if (!agent) return;
    setEnabledError(null);
    setEnabledOverride(next);
    setTogglePending(true);
    const result = await patchAgent({ enabled: next });
    setTogglePending(false);
    if (!result.ok) {
      setEnabledOverride(null);
      setEnabledError(result.error);
      return;
    }
    setEnabledOverride(null);
    applyResponse(result.data);
  }

  async function saveModel(next: string) {
    if (!agent || next === agent.model) return;
    setModelSaving(true);
    setModelError(null);
    const result = await patchAgent({ model: next });
    setModelSaving(false);
    if (!result.ok) {
      setModelError(result.error);
      return;
    }
    applyResponse(result.data);
  }

  async function savePrompt() {
    setPromptSaving(true);
    setPromptError(null);
    const result = await patchAgent({ systemPrompt: promptDraft });
    setPromptSaving(false);
    if (!result.ok) {
      setPromptError(result.error);
      return;
    }
    applyResponse(result.data);
    setPromptDraft(result.data.agent.systemPrompt);
  }

  async function saveCatalog() {
    const cleaned = catalogDraft
      .map((f) => ({ name: f.name.trim(), description: f.description.trim() }))
      .filter((f) => f.name.length > 0 || f.description.length > 0);
    setCatalogSaving(true);
    setCatalogError(null);
    const result = await patchAgent({ catalog: cleaned });
    setCatalogSaving(false);
    if (!result.ok) {
      setCatalogError(result.error);
      return;
    }
    applyResponse(result.data);
    setCatalogDraft(result.data.agent.catalog);
  }

  if (!loaded || !agent) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Text agent</CardTitle>
          <CardDescription>
            AI chat that captures leads on the company&apos;s website.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-24 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const enabled = enabledOverride ?? agent.enabled;
  const promptDirty = promptDraft !== agent.systemPrompt;
  const catalogDirty = !catalogEqual(
    catalogDraft.map((f) => ({
      name: f.name.trim(),
      description: f.description.trim(),
    })),
    agent.catalog,
  );

  return (
    <div className="flex flex-col gap-5">
    <Card>
      <CardHeader>
        <CardTitle>Agente de texto</CardTitle>
        <CardDescription>
          Chat de IA para captar leads en el sitio de la empresa.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-6">
          {/* Enabled */}
          <div className="flex flex-col gap-2">
            <Label className="flex items-center gap-2 text-sm font-normal">
              <Switch
                checked={enabled}
                disabled={!canEdit || togglePending}
                onCheckedChange={(checked) => toggleEnabled(checked === true)}
              />
              Agent enabled
            </Label>
            {enabledError && (
              <p className="text-sm text-destructive">{enabledError}</p>
            )}
          </div>

          {/* Model */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="text-agent-model">Model</Label>
            <Select
              value={agent.model}
              onValueChange={(v) => {
                if (typeof v === "string") void saveModel(v);
              }}
              disabled={!canEdit || modelSaving}
            >
              <SelectTrigger id="text-agent-model" className="w-64">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {ALLOWED_MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {modelError && (
              <p className="text-sm text-destructive">{modelError}</p>
            )}
          </div>

          {/* System prompt */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="text-agent-prompt">System prompt</Label>
            <Textarea
              id="text-agent-prompt"
              value={promptDraft}
              rows={6}
              disabled={!canEdit}
              className="font-mono"
              placeholder="Leave empty to use the default prompt."
              onChange={(e) => setPromptDraft(e.target.value)}
            />
            {promptError && (
              <p className="text-sm text-destructive">{promptError}</p>
            )}
            {canEdit && promptDirty && (
              <div className="mt-1 flex gap-2">
                <Button size="sm" onClick={savePrompt} disabled={promptSaving}>
                  {promptSaving ? "Saving…" : "Save"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setPromptDraft(agent.systemPrompt);
                    setPromptError(null);
                  }}
                  disabled={promptSaving}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>

          {/* Catalog */}
          <div className="flex flex-col gap-2">
            <Label>Catalog</Label>
            <p className="text-sm text-muted-foreground">
              Fields the agent tries to capture from each visitor.
            </p>
            <div className="flex flex-col gap-2">
              {catalogDraft.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No fields yet.
                </p>
              )}
              {catalogDraft.map((field, index) => (
                <div
                  key={index}
                  className="flex items-start gap-2 rounded-lg border border-border p-3"
                >
                  <div className="flex flex-1 flex-col gap-2">
                    <Input
                      value={field.name}
                      placeholder="Field name (e.g. phone)"
                      disabled={!canEdit}
                      onChange={(e) => {
                        const next = [...catalogDraft];
                        next[index] = { ...next[index], name: e.target.value };
                        setCatalogDraft(next);
                      }}
                    />
                    <Input
                      value={field.description}
                      placeholder="Description (what to ask and why)"
                      disabled={!canEdit}
                      onChange={(e) => {
                        const next = [...catalogDraft];
                        next[index] = {
                          ...next[index],
                          description: e.target.value,
                        };
                        setCatalogDraft(next);
                      }}
                    />
                  </div>
                  {canEdit && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove field"
                      onClick={() =>
                        setCatalogDraft(
                          catalogDraft.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <XIcon />
                    </Button>
                  )}
                </div>
              ))}
              {canEdit && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={() => setCatalogDraft([...catalogDraft, EMPTY_FIELD])}
                >
                  <PlusIcon data-icon="inline-start" />
                  Add field
                </Button>
              )}
            </div>
            {catalogError && (
              <p className="text-sm text-destructive">{catalogError}</p>
            )}
            {canEdit && catalogDirty && (
              <div className="mt-1 flex gap-2">
                <Button
                  size="sm"
                  onClick={saveCatalog}
                  disabled={catalogSaving}
                >
                  {catalogSaving ? "Saving…" : "Save"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setCatalogDraft(agent.catalog);
                    setCatalogError(null);
                  }}
                  disabled={catalogSaving}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>

          {/* Probar */}
          {canEdit && (
            <div className="flex">
              <Button
                variant="secondary"
                render={
                  <Link href={`/chat-playground?companyId=${companyId}`} />
                }
              >
                Test
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>

      <EmbedCard
        companyId={companyId}
        embedKey={agent.embedKey}
        allowedOrigins={agent.allowedOrigins}
        canManageEmbed={canManageEmbed}
        onAllowedOriginsSaved={(origins) =>
          setAgent((prev) => (prev ? { ...prev, allowedOrigins: origins } : prev))
        }
        onKeyRotated={(embedKey) =>
          setAgent((prev) => (prev ? { ...prev, embedKey } : prev))
        }
      />
    </div>
  );
}

// ─── Embed (ADR-014) ─────────────────────────────────────────

const EMBED_DEFAULT_COLOR = "#4f46e5";
const EMBED_DEFAULT_TITLE = "Chat with us";

function originsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function EmbedCard({
  companyId,
  embedKey,
  allowedOrigins,
  canManageEmbed,
  onAllowedOriginsSaved,
  onKeyRotated,
}: {
  companyId: string;
  embedKey: string;
  allowedOrigins: string[];
  canManageEmbed: boolean;
  onAllowedOriginsSaved: (origins: string[]) => void;
  onKeyRotated: (embedKey: string) => void;
}) {
  // Snippet appearance knobs (story 4) — local only, baked into the snippet.
  const [color, setColor] = useState(EMBED_DEFAULT_COLOR);
  const [title, setTitle] = useState(EMBED_DEFAULT_TITLE);
  const [copied, setCopied] = useState(false);

  // Allowed origins editable list.
  const [originsDraft, setOriginsDraft] = useState<string[]>(allowedOrigins);
  const [originsSaving, setOriginsSaving] = useState(false);
  const [originsError, setOriginsError] = useState<string | null>(null);

  // Rotate.
  const [rotating, setRotating] = useState(false);
  const [rotateError, setRotateError] = useState<string | null>(null);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  const snippet = `<script async src="${origin}/widget.v1.js" data-key="${embedKey}" data-color="${color}" data-title="${title}"></script>`;

  const cleanedOrigins = originsDraft
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
  const originsDirty = !originsEqual(cleanedOrigins, allowedOrigins);

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable (insecure context) — ignore.
    }
  }

  async function saveOrigins() {
    setOriginsSaving(true);
    setOriginsError(null);
    const res = await fetch(`/api/companies/${companyId}/text-agent`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowedOrigins: cleanedOrigins }),
    });
    setOriginsSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setOriginsError(data?.error ?? "Could not save");
      return;
    }
    const data = await res.json();
    const saved: string[] = data?.agent?.allowedOrigins ?? cleanedOrigins;
    setOriginsDraft(saved);
    onAllowedOriginsSaved(saved);
  }

  async function rotateKey() {
    setRotating(true);
    setRotateError(null);
    const res = await fetch(
      `/api/companies/${companyId}/text-agent/rotate-key`,
      { method: "POST" },
    );
    setRotating(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setRotateError(data?.error ?? "Could not rotate the key");
      return;
    }
    const data = await res.json();
    if (typeof data?.embedKey === "string") onKeyRotated(data.embedKey);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Embed</CardTitle>
        <CardDescription>
          Add the chat widget to the company&apos;s website.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-6">
          {/* Appearance + snippet */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="embed-color">Color</Label>
                <Input
                  id="embed-color"
                  value={color}
                  placeholder="#4f46e5"
                  className="w-32 font-mono"
                  onChange={(e) => setColor(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="embed-title">Title</Label>
                <Input
                  id="embed-title"
                  value={title}
                  placeholder="Chat with us"
                  className="w-64"
                  maxLength={40}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Snippet</Label>
              <pre className="overflow-x-auto rounded-lg border border-border bg-muted/50 p-3 font-mono text-xs">
                {snippet}
              </pre>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={copySnippet}
              >
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>

          {/* Allowed origins */}
          <div className="flex flex-col gap-2">
            <Label>Allowed origins</Label>
            <p className="text-sm text-muted-foreground">
              Add the domains where this chat may be embedded. Until you add
              one, the widget only loads on this dashboard.
            </p>
            <div className="flex flex-col gap-2">
              {originsDraft.length === 0 && (
                <p className="text-sm text-muted-foreground">No origins yet.</p>
              )}
              {originsDraft.map((value, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={value}
                    placeholder="https://example.com"
                    className="font-mono"
                    disabled={!canManageEmbed}
                    onChange={(e) => {
                      const next = [...originsDraft];
                      next[index] = e.target.value;
                      setOriginsDraft(next);
                    }}
                  />
                  {canManageEmbed && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove origin"
                      onClick={() =>
                        setOriginsDraft(
                          originsDraft.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <XIcon />
                    </Button>
                  )}
                </div>
              ))}
              {canManageEmbed && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={() => setOriginsDraft([...originsDraft, ""])}
                >
                  <PlusIcon data-icon="inline-start" />
                  Add origin
                </Button>
              )}
            </div>
            {originsError && (
              <p className="text-sm text-destructive">{originsError}</p>
            )}
            {canManageEmbed && originsDirty && (
              <div className="mt-1 flex gap-2">
                <Button
                  size="sm"
                  onClick={saveOrigins}
                  disabled={originsSaving}
                >
                  {originsSaving ? "Saving…" : "Save"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setOriginsDraft(allowedOrigins);
                    setOriginsError(null);
                  }}
                  disabled={originsSaving}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>

          {/* Rotate key */}
          {canManageEmbed && (
            <div className="flex flex-col gap-2">
              <Label>Embed key</Label>
              <p className="text-sm text-muted-foreground">
                Rotating invalidates all existing embeds. Update the snippet on
                your site afterward.
              </p>
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-fit"
                      disabled={rotating}
                    >
                      {rotating ? "Rotating…" : "Rotate key"}
                    </Button>
                  }
                />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Rotate embed key?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Rotating invalidates all existing embeds. Update the
                      snippet on your site afterward.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={rotating}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={rotateKey}
                      disabled={rotating}
                    >
                      Rotate key
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              {rotateError && (
                <p className="text-sm text-destructive">{rotateError}</p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
