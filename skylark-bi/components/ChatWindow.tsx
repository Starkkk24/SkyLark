"use client";

import { useEffect, useRef, useState } from "react";
import { MessageBubble, type ChatMessage } from "./MessageBubble";
import { ChatInput } from "./ChatInput";

const EXAMPLES = [
  "How's our pipeline looking for the energy sector this quarter?",
  "Which clients have both deals and active work orders?",
  "Give me a leadership update on our sales pipeline.",
];

interface Meta {
  fetchedAt: string;
  deals: number;
  workOrders: number;
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
      <header className="px-4 py-4 border-b border-black/10 dark:border-white/10">
        <h1 className="text-lg font-semibold">Skylark BI Agent</h1>
        <p className="text-xs text-foreground/60">
          Live insights from your monday.com Deals &amp; Work Orders boards
          {meta && (
            <span>
              {" · "}
              {meta.deals} deals, {meta.workOrders} work orders · synced{" "}
              {new Date(meta.fetchedAt).toLocaleTimeString()}
            </span>
          )}
        </p>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
        {empty && (
          <div className="mt-8 text-center space-y-4">
            <p className="text-sm text-foreground/60">
              Ask a founder-level business question to get started.
            </p>
            <div className="flex flex-col gap-2 items-center">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => send(ex)}
                  className="text-sm text-left rounded-xl border border-black/10 dark:border-white/15 px-4 py-2.5 hover:border-blue-500 transition-colors max-w-md"
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

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-black/5 dark:bg-white/10 px-4 py-2.5 text-sm text-foreground/60">
              Analyzing live data…
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-black/10 dark:border-white/10">
        <ChatInput onSend={send} disabled={loading} />
        <p className="mt-2 text-center text-[11px] text-foreground/40">
          Numbers are computed deterministically from monday.com; the AI narrates and may note data-quality caveats.
        </p>
      </div>
    </div>
  );
}
