"use client";

import { useState } from "react";

export function ChatInput({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void;
  disabled: boolean;
}) {
  const [value, setValue] = useState("");

  function submit() {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
  }

  return (
    <div className="flex items-end gap-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        rows={1}
        placeholder="Ask about pipeline, revenue, sectors, work orders…"
        className="flex-1 resize-none rounded-xl border border-black/10 dark:border-white/15 bg-background px-4 py-3 text-sm outline-none focus:border-blue-500 max-h-40"
      />
      <button
        onClick={submit}
        disabled={disabled || !value.trim()}
        className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-40 hover:bg-blue-700 transition-colors"
      >
        Send
      </button>
    </div>
  );
}
