"use client";

import { useState } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";

import { ALLOWED_MODELS } from "@/lib/ai/models";
import { ChatPlaygroundClient } from "@/app/(dashboard)/chat-playground/chat-playground-client";

function modelLabel(id: string): string {
  return ALLOWED_MODELS.find((m) => m.id === id)?.label ?? id;
}

// Thin wrapper around the reused chat playground. Its only addition is showing
// the Text agent's current model — read from the existing read endpoint and
// mapped to a readable label. No cost is shown here on purpose (ADR-003: cost
// stays an agency-only metric in the Chats tab and the Chat detail).
export function PlaygroundTab({ companyId }: { companyId: string }) {
  const [model, setModel] = useState<string | null>(null);

  useMountEffect(() => {
    let cancelled = false;
    fetch(`/api/companies/${companyId}/text-agent`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.agent?.model) return;
        setModel(data.agent.model);
      })
      .catch(() => {
        // The model is a non-critical indicator; leave it as "—" on failure
        // without breaking the chat below.
      });
    return () => {
      cancelled = true;
    };
  });

  return (
    <div className="flex flex-1 flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Model:{" "}
        <span className="font-medium text-foreground">
          {model ? modelLabel(model) : "—"}
        </span>
      </p>
      {/* Bound the chat to the viewport so the conversation scrolls inside the
          box and the composer (textarea + Send) stays pinned and visible — the
          dashboard shell is min-h-svh (page-scrolls), so without an explicit
          height here the message list would grow and push the input off-screen.
          The offset accounts for the company header, tabs, and the Model line. */}
      <div className="flex h-[calc(100svh-16rem)] min-h-96 flex-col">
        <ChatPlaygroundClient companyId={companyId} />
      </div>
    </div>
  );
}
