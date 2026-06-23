"use client";

import { useState } from "react";
import Link from "next/link";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { PlusIcon, XIcon } from "lucide-react";

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
}

interface TextAgentResponse {
  agent: TextAgent;
  canEdit: boolean;
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
      return { ok: false, error: data?.error ?? "No se pudo guardar" };
    }
    const data = (await res.json()) as TextAgentResponse;
    return { ok: true, data };
  }

  function applyResponse(data: TextAgentResponse) {
    setAgent(data.agent);
    setCanEdit(data.canEdit);
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
          <CardTitle>Agente de texto</CardTitle>
          <CardDescription>
            Chat de IA para captar leads en el sitio de la empresa.
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
              Agente habilitado
            </Label>
            {enabledError && (
              <p className="text-sm text-destructive">{enabledError}</p>
            )}
          </div>

          {/* Model */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="text-agent-model">Modelo</Label>
            <Select
              value={agent.model}
              onValueChange={(v) => {
                if (typeof v === "string") void saveModel(v);
              }}
              disabled={!canEdit || modelSaving}
            >
              <SelectTrigger id="text-agent-model" className="w-64">
                <SelectValue placeholder="Selecciona un modelo" />
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
              placeholder="Déjalo vacío para usar el prompt por defecto."
              onChange={(e) => setPromptDraft(e.target.value)}
            />
            {promptError && (
              <p className="text-sm text-destructive">{promptError}</p>
            )}
            {canEdit && promptDirty && (
              <div className="mt-1 flex gap-2">
                <Button size="sm" onClick={savePrompt} disabled={promptSaving}>
                  {promptSaving ? "Guardando…" : "Guardar"}
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
                  Cancelar
                </Button>
              </div>
            )}
          </div>

          {/* Catalog */}
          <div className="flex flex-col gap-2">
            <Label>Catálogo</Label>
            <p className="text-sm text-muted-foreground">
              Campos que el agente intenta capturar de cada visitante.
            </p>
            <div className="flex flex-col gap-2">
              {catalogDraft.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Sin campos todavía.
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
                      placeholder="Nombre del campo (ej. teléfono)"
                      disabled={!canEdit}
                      onChange={(e) => {
                        const next = [...catalogDraft];
                        next[index] = { ...next[index], name: e.target.value };
                        setCatalogDraft(next);
                      }}
                    />
                    <Input
                      value={field.description}
                      placeholder="Descripción (qué pedir y por qué)"
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
                      aria-label="Eliminar campo"
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
                  Agregar campo
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
                  {catalogSaving ? "Guardando…" : "Guardar"}
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
                  Cancelar
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
                Probar
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
