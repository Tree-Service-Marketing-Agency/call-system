import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { getSessionUser, isAgencyRole } from "@/lib/auth-helpers";
import { canManageTextAgent, canViewCompany } from "@/lib/text-agent/authz";
import { getTextAgent, updateTextAgent } from "@/lib/text-agent/repository";
import { validateCatalog } from "@/lib/text-agent/catalog";
import { validateAllowedOrigins } from "@/lib/text-agent/origins";
import { isAllowedModel } from "@/lib/ai/models";

const SYSTEM_PROMPT_MAX = 8000;

async function companyExists(id: string): Promise<boolean> {
  const row = await db.query.companies.findFirst({
    where: eq(companies.id, id),
    columns: { id: true },
  });
  return !!row;
}

// GET — read the company's Text agent config (lazy-created if missing). Any
// company user of the company (or any agency user) may read it.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!canViewCompany(user, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!(await companyExists(id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const agent = await getTextAgent(id);
  return NextResponse.json({
    agent: {
      companyId: agent.companyId,
      enabled: agent.enabled,
      model: agent.model,
      systemPrompt: agent.systemPrompt,
      catalog: agent.catalog,
      embedKey: agent.embedKey,
      allowedOrigins: agent.allowedOrigins,
    },
    canEdit: canManageTextAgent(user, id),
    canManageEmbed: isAgencyRole(user.role),
  });
}

// PATCH — update the config. Only agency users or the company's own
// staff_admin may edit (staff is read-only).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!canManageTextAgent(user, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!(await companyExists(id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    enabled?: unknown;
    model?: unknown;
    systemPrompt?: unknown;
    catalog?: unknown;
    allowedOrigins?: unknown;
  };

  const patch: {
    enabled?: boolean;
    model?: string;
    systemPrompt?: string;
    catalog?: { name: string; description: string }[];
    allowedOrigins?: string[];
  } = {};

  if ("enabled" in body) {
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json(
        { error: "enabled must be a boolean" },
        { status: 400 }
      );
    }
    patch.enabled = body.enabled;
  }

  if ("model" in body) {
    if (typeof body.model !== "string" || !isAllowedModel(body.model)) {
      return NextResponse.json(
        { error: "model must be one of the allowed models" },
        { status: 400 }
      );
    }
    patch.model = body.model;
  }

  if ("systemPrompt" in body) {
    if (typeof body.systemPrompt !== "string") {
      return NextResponse.json(
        { error: "systemPrompt must be a string" },
        { status: 400 }
      );
    }
    if (body.systemPrompt.length > SYSTEM_PROMPT_MAX) {
      return NextResponse.json(
        { error: `systemPrompt exceeds ${SYSTEM_PROMPT_MAX} characters` },
        { status: 400 }
      );
    }
    patch.systemPrompt = body.systemPrompt;
  }

  if ("catalog" in body) {
    const result = validateCatalog(body.catalog);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    patch.catalog = result.value;
  }

  // ADR-014: the embed/origin allowlist is an agency-only security lever, even
  // for the company's own staff_admin.
  if ("allowedOrigins" in body) {
    if (!isAgencyRole(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const result = validateAllowedOrigins(body.allowedOrigins);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    patch.allowedOrigins = result.value;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "nothing to update" },
      { status: 400 }
    );
  }

  const updated = await updateTextAgent(id, patch);
  return NextResponse.json({
    agent: {
      companyId: updated.companyId,
      enabled: updated.enabled,
      model: updated.model,
      systemPrompt: updated.systemPrompt,
      catalog: updated.catalog,
      embedKey: updated.embedKey,
      allowedOrigins: updated.allowedOrigins,
    },
    canEdit: true,
    canManageEmbed: isAgencyRole(user.role),
  });
}
