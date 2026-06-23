import type { Metadata } from "next";

import { getTextAgentByEmbedKey } from "@/lib/text-agent/repository";
import { WidgetChatClient } from "./widget-chat-client";

// ADR-014: public, unauthenticated, shell-less page rendered inside the embed
// iframe. The dynamic frame-ancestors CSP that gates *where* it may be embedded
// is set in proxy.ts. Keep it out of search indexes.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// The page depends on the per-request key (and the per-request CSP), so it must
// never be statically prerendered.
export const dynamic = "force-dynamic";

const COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const DEFAULT_COLOR = "#4f46e5";
const DEFAULT_TITLE = "Chat with us";

// Color is injected as a CSS value, so it MUST be sanitized to a hex literal.
function sanitizeColor(raw: string | undefined): string {
  if (raw && COLOR_RE.test(raw)) return raw;
  return DEFAULT_COLOR;
}

// Title is rendered as text (React escapes it); just trim + cap.
function sanitizeTitle(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (trimmed.length === 0) return DEFAULT_TITLE;
  return trimmed.slice(0, 40);
}

function Unavailable() {
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-background px-4 text-center text-sm text-muted-foreground">
      Chat is unavailable.
    </div>
  );
}

export default async function WidgetPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string; color?: string; title?: string }>;
}) {
  const { key, color, title } = await searchParams;
  const agent = key ? await getTextAgentByEmbedKey(key) : null;

  if (!agent || !agent.enabled) {
    return <Unavailable />;
  }

  return (
    <div className="flex h-dvh w-full flex-col">
      <WidgetChatClient
        embedKey={agent.embedKey}
        color={sanitizeColor(color)}
        title={sanitizeTitle(title)}
      />
    </div>
  );
}
