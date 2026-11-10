"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

function textOf(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && "props" in node) {
    return textOf((node as { props?: { children?: React.ReactNode } }).props?.children);
  }
  return "";
}

function CodeBlock({
  children,
  className,
  raw,
}: {
  children: React.ReactNode;
  className?: string;
  raw: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const language = /language-([\w-]+)/.exec(className ?? "")?.[1];

  async function copy() {
    try {
      await navigator.clipboard.writeText(raw.replace(/\n$/, ""));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard access can be denied; failing silently is fine.
    }
  }

  return (
    <div className="group/code my-3 overflow-hidden rounded-lg border border-border bg-[color-mix(in_oklch,var(--muted)_55%,var(--background))]">
      <div className="flex h-8 items-center justify-between border-b border-border/70 px-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {language ?? "code"}
        </span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/code:opacity-100"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="scrollbar-thin overflow-x-auto">
        <code className={cn("hljs block p-4 font-mono text-[13px] leading-relaxed", className)}>
          {children}
        </code>
      </pre>
    </div>
  );
}

const components = {
  pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  code: ({
    className,
    children,
  }: {
    className?: string;
    children?: React.ReactNode;
  }) => {
    const raw = textOf(children);
    const block = Boolean(className?.includes("language-")) || raw.includes("\n");
    if (!block) {
      return <code className={className}>{children}</code>;
    }
    return (
      <CodeBlock className={className} raw={raw}>
        {children}
      </CodeBlock>
    );
  },
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="underline underline-offset-2"
    >
      {children}
    </a>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="scrollbar-thin overflow-x-auto">
      <table>{children}</table>
    </div>
  ),
};

export const Markdown = React.memo(function Markdown({
  text,
  highlight = true,
}: {
  text: string;
  highlight?: boolean;
}) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={
          highlight
            ? [[rehypeHighlight, { detect: false, ignoreMissing: true }]]
            : []
        }
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
