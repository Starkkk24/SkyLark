"use client";

import { useEffect, useRef, useState } from "react";
import { MessageBubble, type ChatMessage } from "./MessageBubble";
import { ChatInput } from "./ChatInput";

const EXAMPLES = [
  "How's our pipeline for the renewables sector this quarter?",
  "Which sector has the highest total deal value?",
  "Which clients have both deals and active work orders?",
  "Give me a leadership update on our sales pipeline.",
];

interface Meta {
  fetchedAt: string;
  deals: number;
  workOrders: number;
}

/** Minimal brand mark — a small spark glyph in a rounded square. */
function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center justify-center rounded-lg bg-blue-600 text-white ${className}`}>
      <svg width="60%" height="60%" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 2l1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6z" />
      </svg>
    </span>
  );
}

export function ChatWindow() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    if (loading) return;
    setError(null);
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed.");
      setMessages([...next, { role: "assistant", content: data.reply }]);
      setMeta(data.meta ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="flex flex-col h-full w-full max-w-3xl mx-auto">
      {/* Header */}
      <header className="flex items-center gap-2.5 px-4 py-3 border-b border-black/10 dark:border-white/10">
        <Logo className="h-7 w-7" />
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] font-semibold leading-tight">Skylark BI</h1>
          {meta && (
            <p className="truncate text-xs text-foreground/50">
              {meta.deals} deals · {meta.workOrders} work orders
            </p>
          )}
        </div>
        {!empty && (
          <button
            onClick={() => {
              setMessages([]);
              setError(null);
            }}
            className="rounded-lg border border-black/10 dark:border-white/15 px-2.5 py-1.5 text-xs text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            New chat
          </button>
        )}
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-3">
        {empty && (
          <div className="mx-auto flex h-full max-w-lg flex-col items-center justify-center text-center">
            <Logo className="h-11 w-11 mb-4" />
            <div className="grid w-full gap-2 sm:grid-cols-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => send(ex)}
                  className="rounded-xl border border-black/10 dark:border-white/12 p-3 text-left text-sm text-foreground/75 hover:border-blue-500/60 hover:text-foreground transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}

        {loading && <TypingDots />}

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-4 pt-1">
        <ChatInput onSend={send} disabled={loading} />
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-2">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/40"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}
