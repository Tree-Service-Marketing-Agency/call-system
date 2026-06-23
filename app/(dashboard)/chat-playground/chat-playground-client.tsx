"use client";

import { useRef, useState } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function messageText(message: UIMessage): string {
  return message.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("");
}

interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export function ChatPlaygroundClient({ companyId }: { companyId: string }) {
  const storageKey = `chat-playground-conversation-id-${companyId}`;

  // Keep the conversation id in a ref so the transport closure always reads the
  // latest value without being recreated. The closure only touches the ref in
  // async callbacks (network/events), never during render — so the
  // "refs during render" rule is a false positive here.
  const idRef = useRef<string | null>(null);

  const [transport] = useState(
    // eslint-disable-next-line react-hooks/refs -- idRef is only read/written inside async network callbacks, never during render
    () =>
      new DefaultChatTransport<UIMessage>({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages }) => ({
          body: {
            conversationId: idRef.current ?? undefined,
            companyId,
            message: messages[messages.length - 1],
          },
        }),
        fetch: async (input, init) => {
          const res = await fetch(input, init);
          if (res.status === 404) {
            idRef.current = null;
            window.localStorage.removeItem(storageKey);
          }
          const headerId = res.headers.get("X-Conversation-Id");
          if (headerId) {
            idRef.current = headerId;
            window.localStorage.setItem(storageKey, headerId);
          }
          return res;
        },
      }),
  );

  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport,
  });

  const [input, setInput] = useState("");

  // Resume an in-progress conversation on mount: pull the thread from the DB.
  useMountEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return;
    let cancelled = false;
    fetch(`/api/companies/${companyId}/chats/${stored}`)
      .then(async (res) => {
        if (!res.ok) {
          window.localStorage.removeItem(storageKey);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled || !data) return;
        const history: HistoryMessage[] = data.messages ?? [];
        idRef.current = stored;
        setMessages(
          history.map((m, i) => ({
            id: `restored-${i}`,
            role: m.role,
            parts: [{ type: "text" as const, text: m.content }],
          })),
        );
      });
    return () => {
      cancelled = true;
    };
  });

  // Auto-scroll to the bottom on new messages / streamed tokens. A callback ref
  // on the scroll container runs after every commit (fresh identity each
  // render), keeping the latest turn in view without touching a ref in render.
  const scrollToBottom = (el: HTMLDivElement | null) => {
    if (el) el.scrollTop = el.scrollHeight;
  };

  const busy = status === "submitted" || status === "streaming";

  function submit() {
    const text = input.trim();
    if (text.length === 0 || busy) return;
    void sendMessage({ text });
    setInput("");
  }

  function newConversation() {
    idRef.current = null;
    window.localStorage.removeItem(storageKey);
    setMessages([]);
  }

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Pose as a visitor and test the agent.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={newConversation}
          disabled={busy}
        >
          New conversation
        </Button>
      </div>

      <div
        ref={scrollToBottom}
        className="flex flex-1 flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-card p-4 shadow-xs"
      >
        {messages.length === 0 && status === "ready" && (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Type a message to start.
          </div>
        )}

        {messages.map((message) => {
          const isUser = message.role === "user";
          return (
            <div
              key={message.id}
              className={cn(
                "flex max-w-[80%] flex-col gap-1 rounded-[15px] px-[15px] py-[11px] text-sm",
                isUser
                  ? "self-end bg-primary text-primary-foreground"
                  : "self-start border border-border bg-card text-foreground",
              )}
            >
              <span
                className={cn(
                  "text-[11px] font-medium uppercase tracking-wider",
                  isUser
                    ? "text-primary-foreground/70"
                    : "text-muted-foreground",
                )}
              >
                {isUser ? "Customer" : "Assistant"}
              </span>
              <p className="whitespace-pre-wrap break-words leading-snug">
                {messageText(message)}
              </p>
            </div>
          );
        })}

        {status === "submitted" && (
          <div className="flex max-w-[80%] flex-col gap-1 self-start rounded-[15px] border border-border bg-card px-[15px] py-[11px]">
            <span className="flex items-center gap-1">
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
            </span>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive">
            Something went wrong. Try again.
          </p>
        )}
      </div>

      <div className="flex items-end gap-2">
        <Textarea
          value={input}
          rows={2}
          placeholder="Type a message…"
          className="resize-none"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Button type="button" onClick={submit} disabled={busy || input.trim().length === 0}>
          Send
        </Button>
      </div>
    </div>
  );
}
