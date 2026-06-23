import { NextResponse } from "next/server";
import { streamText, type ModelMessage } from "ai";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth-helpers";
import { canManageTextAgent } from "@/lib/text-agent/authz";
import { getTextAgent } from "@/lib/text-agent/repository";
import { buildSystemPrompt } from "@/lib/text-agent/system-prompt";
import { chatModel } from "@/lib/ai/openrouter";
import { extractUsage } from "@/lib/chat/cost";
import {
  ConversationNotFoundError,
  loadHistory,
  resolveConversation,
  saveMessage,
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

export async function POST(request: Request) {
  // F1: gated behind the dashboard session (no public anonymous access yet —
  // that arrives with origin validation in F2). ADR-011/012.
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

  const body = (await request.json().catch(() => ({}))) as {
    conversationId?: unknown;
    companyId?: unknown;
  };

  if (typeof body.companyId !== "string" || body.companyId.trim().length === 0) {
    return NextResponse.json(
      { error: "companyId is required" },
      { status: 400 }
    );
  }
  const companyId = body.companyId;

  if (
    body.conversationId !== undefined &&
    body.conversationId !== null &&
    typeof body.conversationId !== "string"
  ) {
    return NextResponse.json(
      { error: "conversationId must be a string" },
      { status: 400 }
    );
  }
  const conversationId =
    typeof body.conversationId === "string" ? body.conversationId : undefined;

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

  const userText = extractUserText(body);
  if (!userText) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  // Resolve-or-create the conversation. F1 forces source=playground (the only
  // surface in this phase). An unknown / cross-company id is a 404.
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
  const { id } = resolved;

  // DB is the source of truth: persist the user turn BEFORE the stream, then
  // rebuild the context from the DB (the client only sent its last message).
  await saveMessage({ conversationId: id, role: "user", content: userText });
  const history = await loadHistory(id);

  const agent = await getTextAgent(companyId);
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

  // Drain the stream server-side so the assistant turn persists even if the
  // playground tab closes mid-response (ADR-011).
  result.consumeStream();

  return result.toUIMessageStreamResponse({
    headers: { "X-Conversation-Id": id },
  });
}
