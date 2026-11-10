"use client";

import * as React from "react";
import hljs from "highlight.js/lib/common";
import apache from "highlight.js/lib/languages/apache";
import clojure from "highlight.js/lib/languages/clojure";
import cmake from "highlight.js/lib/languages/cmake";
import coffeescript from "highlight.js/lib/languages/coffeescript";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import dos from "highlight.js/lib/languages/dos";
import elixir from "highlight.js/lib/languages/elixir";
import elm from "highlight.js/lib/languages/elm";
import erlang from "highlight.js/lib/languages/erlang";
import fsharp from "highlight.js/lib/languages/fsharp";
import gradle from "highlight.js/lib/languages/gradle";
import groovy from "highlight.js/lib/languages/groovy";
import haskell from "highlight.js/lib/languages/haskell";
import julia from "highlight.js/lib/languages/julia";
import latex from "highlight.js/lib/languages/latex";
import matlab from "highlight.js/lib/languages/matlab";
import nginx from "highlight.js/lib/languages/nginx";
import nim from "highlight.js/lib/languages/nim";
import nix from "highlight.js/lib/languages/nix";
import ocaml from "highlight.js/lib/languages/ocaml";
import powershell from "highlight.js/lib/languages/powershell";
import protobuf from "highlight.js/lib/languages/protobuf";
import reasonml from "highlight.js/lib/languages/reasonml";
import scala from "highlight.js/lib/languages/scala";
import verilog from "highlight.js/lib/languages/verilog";
import vhdl from "highlight.js/lib/languages/vhdl";
import x86asm from "highlight.js/lib/languages/x86asm";
import { languageForPath } from "@/lib/languages";
import { cn } from "@/lib/utils";

hljs.registerLanguage("apache", apache);
hljs.registerLanguage("clojure", clojure);
hljs.registerLanguage("cmake", cmake);
hljs.registerLanguage("coffeescript", coffeescript);
hljs.registerLanguage("dockerfile", dockerfile);
hljs.registerLanguage("dos", dos);
hljs.registerLanguage("elixir", elixir);
hljs.registerLanguage("elm", elm);
hljs.registerLanguage("erlang", erlang);
hljs.registerLanguage("fsharp", fsharp);
hljs.registerLanguage("gradle", gradle);
hljs.registerLanguage("groovy", groovy);
hljs.registerLanguage("haskell", haskell);
hljs.registerLanguage("julia", julia);
hljs.registerLanguage("latex", latex);
hljs.registerLanguage("matlab", matlab);
hljs.registerLanguage("nginx", nginx);
hljs.registerLanguage("nim", nim);
hljs.registerLanguage("nix", nix);
hljs.registerLanguage("ocaml", ocaml);
hljs.registerLanguage("powershell", powershell);
hljs.registerLanguage("protobuf", protobuf);
hljs.registerLanguage("reasonml", reasonml);
hljs.registerLanguage("scala", scala);
hljs.registerLanguage("verilog", verilog);
hljs.registerLanguage("vhdl", vhdl);
hljs.registerLanguage("x86asm", x86asm);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * highlight.js returns one HTML string. Split it by newline while keeping any
 * open <span> tags balanced so each line can be rendered with its own number.
 */
function splitHighlightedLines(html: string): string[] {
  const lines: string[] = [];
  const open: string[] = [];
  let current = "";
  let index = 0;

  while (index < html.length) {
    if (html.startsWith("<span", index)) {
      const end = html.indexOf(">", index);
      if (end === -1) {
        current += html.slice(index);
        break;
      }
      const tag = html.slice(index, end + 1);
      current += tag;
      open.push(tag);
      index = end + 1;
      continue;
    }
    if (html.startsWith("</span>", index)) {
      current += "</span>";
      open.pop();
      index += 7;
      continue;
    }
    const char = html[index];
    if (char === "\n") {
      lines.push(current + "</span>".repeat(open.length));
      current = open.join("");
      index += 1;
      continue;
    }
    current += char;
    index += 1;
  }
  lines.push(current);
  return lines;
}

export function CodeView({
  content,
  wrap,
  path,
}: {
  content: string;
  wrap: boolean;
  path: string;
}) {
  const language = languageForPath(path);
  const { lines, truncated } = React.useMemo(() => {
    const normalized = content.replace(/\r\n/g, "\n");
    const all = normalized.split("\n");
    const isTruncated = all.length > 4000;
    const visible = (isTruncated ? all.slice(0, 4000) : all).join("\n");

    let highlighted: string;
    try {
      if (
        language.hljs !== "plaintext" &&
        hljs.getLanguage(language.hljs)
      ) {
        highlighted = hljs.highlight(visible, {
          language: language.hljs,
          ignoreIllegals: true,
        }).value;
      } else {
        highlighted = escapeHtml(visible);
      }
    } catch {
      highlighted = escapeHtml(visible);
    }

    return {
      lines: splitHighlightedLines(highlighted),
      truncated: isTruncated,
    };
  }, [content, language.hljs]);

  return (
    <div className="scrollbar-thin h-full overflow-auto bg-background/40">
      <div
        className={cn(
          "min-w-max py-2 font-mono text-[12px] leading-[1.7]",
          wrap && "min-w-0",
        )}
      >
        {lines.map((line, index) => (
          <div
            key={index}
            className={cn(
              "grid grid-cols-[3.5rem_1fr] hover:bg-muted/30",
              wrap && "grid-cols-[3.5rem_minmax(0,1fr)]",
            )}
          >
            <span className="select-none border-r border-border/40 px-2 text-right text-[10px] tabular-nums text-muted-foreground/35">
              {index + 1}
            </span>
            <span
              className={cn(
                "hljs whitespace-pre px-3",
                wrap && "whitespace-pre-wrap break-words pr-6",
              )}
              dangerouslySetInnerHTML={{ __html: line || " " }}
            />
          </div>
        ))}
        {truncated ? (
          <div className="px-4 py-3 text-xs text-muted-foreground">
            Preview truncated at 4,000 lines.
          </div>
        ) : null}
      </div>
    </div>
  );
}
