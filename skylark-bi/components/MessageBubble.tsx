export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={[
          "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-blue-600 text-white rounded-br-sm"
            : "bg-black/5 dark:bg-white/10 text-foreground rounded-bl-sm",
        ].join(" ")}
      >
        {message.content}
      </div>
    </div>
  );
}
