import { NextResponse } from "next/server";
import { streamText, type ModelMessage } from "ai";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth-helpers";
import { canManageTextAgent } from "@/lib/text-agent/authz";
import {
  getTextAgent,
  getTextAgentByEmbedKey,
  type TextAgent,
} from "@/lib/text-agent/repository";
import { buildSystemPrompt } from "@/lib/text-agent/system-prompt";
import { originAllowed } from "@/lib/text-agent/origins";
import { checkChatRateLimit, clientIp } from "@/lib/rate-limit";
import { chatModel } from "@/lib/ai/openrouter";
import { extractUsage } from "@/lib/chat/cost";
import {
  ConversationNotFoundError,
  getConversation,
  loadHistory,
  resolveConversation,
  saveMessage,
  type ConversationSource,
} from "@/lib/chat/persistence";

// The pg driver does not run on edge → Node runtime (the default). Streaming
// generation can take a while, so widen the function budget.
export const maxDuration = 30;

// Pulls the user's text from either `body.text` or the AI SDK UI-message
// (`body.message.parts[].text`). Returns null when empty.
function extractUserText(body: unknown): string | null {
  const b = body as {
    text?: unknown;
    message?: { parts?: unknown };
  };
  if (typeof b?.text === "string") {
    const t = b.text.trim();
    return t.length > 0 ? t : null;
  }
  const parts = b?.message?.parts;
  if (Array.isArray(parts)) {
    const text = parts
      .filter(
        (p): p is { type: "text"; text: string } =>
          !!p &&
          typeof p === "object" &&
          (p as { type?: unknown }).type === "text" &&
          typeof (p as { text?: unknown }).text === "string"
      )
      .map((p) => p.text)
      .join("")
      .trim();
    return text.length > 0 ? text : null;
  }
  return null;
}

// Shared streaming tail for both surfaces: persist the user turn, rebuild the
// LLM context from the DB (the client only sent its last message), stream, and
// drain server-side so the assistant turn persists even if the tab closes
// mid-response (ADR-011). Returns the UI message stream response.
async function streamChatTurn(opts: {
  conversationId: string;
  userText: string;
  agent: TextAgent;
  headers: Record<string, string>;
}): Promise<Response> {
  const { conversationId: id, userText, agent, headers } = opts;

  await saveMessage({ conversationId: id, role: "user", content: userText });
  const history = await loadHistory(id);

  const system = buildSystemPrompt({
    activePrompt: agent.systemPrompt,
    catalog: agent.catalog,
  });

  // Branch-map so each element is a discriminated ModelMessage (a union-role
  // object literal is not assignable to ModelMessage[]).
  const messages: ModelMessage[] = history.map((m) =>
    m.role === "user"
      ? { role: "user", content: m.content }
      : { role: "assistant", content: m.content }
  );

  const result = streamText({
    model: chatModel(agent.model),
    system,
    messages,
    onFinish: async ({ text, providerMetadata }) => {
      const assistantText = text.trim();
      if (assistantText.length === 0) return;
      const usage = extractUsage(providerMetadata, agent.model);
      await saveMessage({
        conversationId: id,
        role: "assistant",
        content: assistantText,
        model: usage.model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        costMicroUsd: usage.costMicroUsd,
      });
    },
  });

  result.consumeStream();

  return result.toUIMessageStreamResponse({
    headers: { "X-Conversation-Id": id, ...headers },
  });
}

function validateConversationId(value: unknown):
  | { ok: true; id: string | undefined }
  | { ok: false } {
  if (value !== undefined && value !== null && typeof value !== "string") {
    return { ok: false };
  }
  return { ok: true, id: typeof value === "string" ? value : undefined };
}

// ─── Widget flow (public, ADR-014) ───────────────────────────
// Detected by `body.embedKey`. No session required; the embed_key resolves the
// company. The real gate against unauthorized embedding is the dynamic
// frame-ancestors CSP on /widget; the origin check here is defense in depth.
async function handleWidgetPost(
  request: Request,
  body: { embedKey: string; conversationId?: unknown }
): Promise<Response> {
  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY not configured" },
      { status: 500 }
    );
  }

  const agent = await getTextAgentByEmbedKey(body.embedKey);
  if (!agent) {
    return NextResponse.json({ error: "invalid embed key" }, { status: 403 });
  }
  if (!agent.enabled) {
    return NextResponse.json({ error: "agent disabled" }, { status: 403 });
  }
  const companyId = agent.companyId;

  // Origin check (defense in depth). Legit widget calls are same-origin within
  // our iframe; a cross-origin caller must be in the company's allowlist.
  const origin = request.headers.get("origin");
  const selfOrigin = new URL(request.url).origin;
  const sameOrigin = !origin || origin === selfOrigin;
  const allowed = sameOrigin || originAllowed(origin, agent.allowedOrigins);

  // CORS headers attached to every response so the client can read the
  // X-Conversation-Id header and 404 bodies (its stale-id reset path).
  const corsHeaders: Record<string, string> = {
    "Access-Control-Expose-Headers": "X-Conversation-Id",
  };
  if (!sameOrigin && allowed && origin) {
    corsHeaders["Access-Control-Allow-Origin"] = origin;
    corsHeaders["Vary"] = "Origin";
  }

  if (!allowed) {
    return NextResponse.json(
      { error: "origin not allowed" },
      { status: 403, headers: corsHeaders }
    );
  }

  const ok = await checkChatRateLimit(`${clientIp(request)}:${body.embedKey}`);
  if (!ok) {
    return NextResponse.json(
      { error: "rate limit exceeded" },
      { status: 429, headers: corsHeaders }
    );
  }

  const conv = validateConversationId(body.conversationId);
  if (!conv.ok) {
    return NextResponse.json(
      { error: "conversationId must be a string" },
      { status: 400, headers: corsHeaders }
    );
  }

  const userText = extractUserText(body);
  if (!userText) {
    return NextResponse.json(
      { error: "message is required" },
      { status: 400, headers: corsHeaders }
    );
  }

  let resolved: { id: string };
  try {
    resolved = await resolveConversation({
      id: conv.id,
      companyId,
      source: "widget",
    });
  } catch (err) {
    if (err instanceof ConversationNotFoundError) {
      return NextResponse.json(
        { error: "conversation not found" },
        { status: 404, headers: corsHeaders }
      );
    }
    throw err;
  }

  return streamChatTurn({
    conversationId: resolved.id,
    userText,
    agent,
    headers: corsHeaders,
  });
}

// ─── Playground flow (F1, authenticated) ─────────────────────
async function handlePlaygroundPost(
  body: { companyId?: unknown; conversationId?: unknown },
  rawBody: unknown
): Promise<Response> {
  // F1: gated behind the dashboard session. ADR-011/012.
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY not configured" },
      { status: 500 }
    );
  }

  if (typeof body.companyId !== "string" || body.companyId.trim().length === 0) {
    return NextResponse.json(
      { error: "companyId is required" },
      { status: 400 }
    );
  }
  const companyId = body.companyId;

  const conv = validateConversationId(body.conversationId);
  if (!conv.ok) {
    return NextResponse.json(
      { error: "conversationId must be a string" },
      { status: 400 }
    );
  }
  const conversationId = conv.id;

  // Company must exist, and the user must be allowed to use its agent
  // (agency = any company; staff_admin = own company).
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
    columns: { id: true },
  });
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }
  if (!canManageTextAgent(user, companyId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userText = extractUserText(rawBody);
  if (!userText) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  // Resolve-or-create the conversation. The playground forces source=playground.
  // An unknown / cross-company id is a 404.
  let resolved: { id: string };
  try {
    resolved = await resolveConversation({
      id: conversationId,
      companyId,
      source: "playground",
    });
  } catch (err) {
    if (err instanceof ConversationNotFoundError) {
      return NextResponse.json(
        { error: "conversation not found" },
        { status: 404 }
      );
    }
    throw err;
  }

  const agent = await getTextAgent(companyId);
  return streamChatTurn({
    conversationId: resolved.id,
    userText,
    agent,
    headers: {},
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    embedKey?: unknown;
    companyId?: unknown;
    conversationId?: unknown;
  };

  // Widget flow (public) vs playground flow (authenticated), branched on the
  // presence of an embed_key.
  if (typeof body.embedKey === "string" && body.embedKey.trim().length > 0) {
    return handleWidgetPost(request, {
      embedKey: body.embedKey,
      conversationId: body.conversationId,
    });
  }

  return handlePlaygroundPost(body, body);
}

// GET — public resume of a widget conversation (story 8). Gated by the
// unguessable conversationId; widget-source only; returns only role+content.
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("conversationId");
  if (!id) {
    return NextResponse.json(
      { error: "conversationId is required" },
      { status: 400 }
    );
  }
  const conv = await getConversation(id);
  const widgetSource: ConversationSource = "widget";
  if (!conv || conv.source !== widgetSource) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const messages = await loadHistory(id);
  return NextResponse.json({ messages });
}

// OPTIONS — preflight for cross-origin direct callers. The widget itself is
// same-origin within our iframe, so it never preflights. We allow the preflight
// generically with `*` (no credentials are ever sent on this flow); the real
// per-company origin gate lives on the POST, which only echoes
// Access-Control-Allow-Origin back to an allowlisted cross-origin caller. So a
// passing preflight grants no read access on its own.
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
