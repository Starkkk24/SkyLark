import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
          "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "max-w-[85%] bg-blue-600 text-white rounded-br-sm"
            : "max-w-[92%] text-foreground",
        ].join(" ")}
      >
        {isUser ? (
          <span className="whitespace-pre-wrap">{message.content}</span>
        ) : (
          <Markdown content={message.content} />
        )}
      </div>
    </div>
  );
}

/** Assistant markdown, styled to sit nicely inside a chat bubble. */
function Markdown({ content }: { content: string }) {
  return (
    <div className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h3 className="text-sm font-semibold mt-3 mb-1" {...p} />,
          h2: (p) => <h3 className="text-sm font-semibold mt-3 mb-1" {...p} />,
          h3: (p) => <h4 className="text-sm font-semibold mt-3 mb-1" {...p} />,
          p: (p) => <p className="my-2" {...p} />,
          ul: (p) => <ul className="my-2 list-disc pl-5 space-y-1" {...p} />,
          ol: (p) => <ol className="my-2 list-decimal pl-5 space-y-1" {...p} />,
          li: (p) => <li className="marker:text-foreground/40" {...p} />,
          strong: (p) => <strong className="font-semibold" {...p} />,
          a: (p) => <a className="text-blue-500 underline underline-offset-2" {...p} />,
          code: (p) => (
            <code className="rounded bg-black/10 dark:bg-white/10 px-1 py-0.5 text-[0.85em]" {...p} />
          ),
          table: (p) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full border-collapse text-xs" {...p} />
            </div>
          ),
          th: (p) => (
            <th className="border border-black/10 dark:border-white/15 px-2 py-1 text-left font-semibold bg-black/[0.03] dark:bg-white/[0.04]" {...p} />
          ),
          td: (p) => <td className="border border-black/10 dark:border-white/15 px-2 py-1" {...p} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
