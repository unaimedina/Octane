"use client";

import * as React from "react";
import {
  ArrowUp,
  AtSign,
  BookPlus,
  Check,
  FileImage,
  Paperclip,
  Slash,
  Sparkles,
  Square,
  Terminal,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { ModelPicker, type ModelSelection } from "@/components/model-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  Agent,
  Command as SlashCommand,
  ModelOption,
  Skill,
} from "@/lib/types";

export type { ModelSelection };

export type OutgoingMessage = {
  text: string;
  attachments: Array<{ mime: string; filename: string; url: string }>;
  skills: string[];
};

export const Composer = React.memo(function Composer({
  models,
  agents,
  skills,
  commands,
  model,
  agent,
  draft,
  busy,
  onModelChange,
  onAgentChange,
  onDraftChange,
  onSend,
  onAbort,
  onAddContext,
  harnessLabel,
}: {
  models: ModelOption[];
  agents: Agent[];
  skills: Skill[];
  commands: SlashCommand[];
  model: ModelSelection | null;
  agent: string;
  draft: string;
  busy: boolean;
  onModelChange: (model: ModelSelection) => void;
  onAgentChange: (agent: string) => void;
  onDraftChange: (value: string) => void;
  onSend: (message: OutgoingMessage) => Promise<void>;
  onAbort: () => Promise<void>;
  onAddContext: () => void;
  harnessLabel: string;
}) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = React.useState<OutgoingMessage["attachments"]>([]);
  const [selectedSkills, setSelectedSkills] = React.useState<string[]>([]);
  const [commandOpen, setCommandOpen] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [aborting, setAborting] = React.useState(false);

  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
  }, [draft]);

  const primaryAgents = React.useMemo(
    () => agents.filter((item) => item.mode !== "subagent"),
    [agents],
  );

  const slashQuery = draft.startsWith("/") && !draft.includes("\n")
    ? draft.slice(1).split(/\s/)[0].toLowerCase()
    : null;
  const filteredCommands =
    slashQuery === null
      ? []
      : commands.filter(
          (command) =>
            command.name.toLowerCase().includes(slashQuery) ||
            command.description?.toLowerCase().includes(slashQuery),
        );
  const showCommandMenu =
    slashQuery !== null && !draft.includes(" ") && filteredCommands.length > 0;

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const next: OutgoingMessage["attachments"] = [];
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} is larger than 10 MB`);
        continue;
      }
      if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
        toast.error(`${file.name}: only images and PDFs can be attached`);
        continue;
      }
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      next.push({ mime: file.type, filename: file.name, url });
    }
    setAttachments((current) => [...current, ...next]);
  }

  async function submit() {
    if (sending || busy) return;
    const text = draft.trim();
    if (!text && attachments.length === 0) return;
    setSending(true);
    try {
      await onSend({ text, attachments, skills: selectedSkills });
      onDraftChange("");
      setAttachments([]);
      setSelectedSkills([]);
      requestAnimationFrame(() => textareaRef.current?.focus());
    } catch (error) {
      toast.error("Message failed", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSending(false);
    }
  }

  const canSend = (draft.trim().length > 0 || attachments.length > 0) && !busy;

  return (
    <div className="relative shrink-0 border-t border-border/60 bg-background/85 px-3 pb-3 pt-3 sm:px-5 sm:pb-4">
      <div className="relative mx-auto w-full max-w-3xl">
        {showCommandMenu ? (
          <div className="glass-float absolute bottom-full left-0 z-20 mb-2 w-full max-w-md overflow-hidden rounded-xl animate-in-up">
            <div className="border-b border-border/60 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
              Commands
            </div>
            <ul className="max-h-64 overflow-y-auto p-1">
              {filteredCommands.slice(0, 12).map((command) => (
                <li key={command.name}>
                  <button
                    type="button"
                    onClick={() => {
                      onDraftChange(`/${command.name} `);
                      textareaRef.current?.focus();
                    }}
                    className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent"
                  >
                    <Slash className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block font-mono text-xs font-medium">/{command.name}</span>
                      {command.description ? (
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                          {command.description}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_24px_60px_-36px_rgba(0,0,0,0.9)] transition-[border-color,box-shadow] focus-within:border-brand/40 focus-within:ring-1 focus-within:ring-brand/15">
          {attachments.length > 0 || selectedSkills.length > 0 ? (
            <div className="flex flex-wrap gap-2 border-b border-border/60 p-2.5">
              {selectedSkills.map((id) => {
                const skill = skills.find((item) => item.id === id);
                return (
                  <div
                    key={`skill-${id}`}
                    className="flex items-center gap-1.5 rounded-[8px] border border-brand/20 bg-brand/8 py-1 pl-2 pr-1 text-[11px] text-brand"
                  >
                    <Sparkles className="size-3" />
                    <span className="max-w-40 truncate">{skill?.name ?? id}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedSkills((current) =>
                          current.filter((item) => item !== id),
                        )
                      }
                      className="grid size-4 place-items-center rounded hover:bg-brand/15"
                      aria-label={`Remove skill ${skill?.name ?? id}`}
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                );
              })}
              {attachments.map((file, index) => (
                <div
                  key={`${file.filename}-${index}`}
                  className="group relative flex items-center gap-2 rounded-lg border border-border/70 bg-muted/40 py-1 pl-1 pr-6"
                >
                  {file.mime.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={file.url} alt="" className="size-8 rounded object-cover" />
                  ) : (
                    <span className="grid size-8 place-items-center rounded bg-background">
                      <FileImage className="size-3.5" />
                    </span>
                  )}
                  <span className="max-w-40 truncate text-[11px]">{file.filename}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setAttachments((current) => current.filter((_, i) => i !== index))
                    }
                    className="absolute right-1 top-1/2 grid size-4 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                    aria-label={`Remove ${file.filename}`}
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void submit();
              }
            }}
            rows={1}
            placeholder={
              draft.startsWith("!")
                ? "Run a shell command in the workspace…"
                : busy
                  ? `${harnessLabel} is working…`
                  : `Ask ${harnessLabel} to build, explain or fix something…`
            }
            className="scrollbar-thin block max-h-[220px] w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-[14px] leading-relaxed outline-none placeholder:text-muted-foreground/60"
            aria-label="Message"
          />

          <div className="flex flex-wrap items-center gap-1 px-2 pb-2 pt-0.5">
            <ModelPicker
              models={models}
              value={model}
              onChange={(next) => {
                if (next) onModelChange(next);
              }}
              label="Model for this conversation"
            />

            <Button
              variant="ghost"
              size="sm"
              className={
                draft.startsWith("!")
                  ? "gap-1.5 bg-info/10 px-2 text-[11px] text-info"
                  : "gap-1.5 px-2 text-[11px] text-muted-foreground"
              }
              onClick={() => {
                const next = draft.startsWith("!") ? draft.slice(1) : `!${draft}`;
                onDraftChange(next);
                textareaRef.current?.focus();
              }}
              aria-label="Shell mode"
              title="Run a shell command (prefix !)"
            >
              <Terminal className="size-3.5" />
              <span className="hidden sm:inline">Shell</span>
            </Button>

            {commands.length > 0 ? (
              <Popover open={commandOpen} onOpenChange={setCommandOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 px-2 text-[11px] text-muted-foreground"
                    aria-label="Slash commands"
                  >
                    <Slash className="size-3.5" />
                    <span className="hidden sm:inline">Slash</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent side="top" align="start" className="w-80 p-0">
                  <Command>
                    <CommandInput placeholder="Search commands…" />
                    <CommandList className="max-h-72">
                      <CommandEmpty>No commands found.</CommandEmpty>
                      <CommandGroup heading="Available commands">
                        {commands.map((command) => (
                          <CommandItem
                            key={command.name}
                            value={`${command.name} ${command.description ?? ""}`}
                            onSelect={() => {
                              onDraftChange(`/${command.name} `);
                              setCommandOpen(false);
                              textareaRef.current?.focus();
                            }}
                            className="items-start gap-2"
                          >
                            <Slash className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1">
                              <span className="block font-mono text-xs">
                                /{command.name}
                              </span>
                              {command.description ? (
                                <span className="mt-0.5 block text-[10px] leading-relaxed text-muted-foreground">
                                  {command.description}
                                </span>
                              ) : null}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            ) : null}

            {skills.length > 0 ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 px-2 text-[11px] text-muted-foreground"
                    aria-label="Skills"
                  >
                    <Sparkles className="size-3.5" />
                    <span className="hidden sm:inline">Skills</span>
                    {selectedSkills.length > 0 ? (
                      <span className="rounded-[6px] bg-brand/15 px-1.5 font-mono text-[9px] text-brand">
                        {selectedSkills.length}
                      </span>
                    ) : null}
                  </Button>
                </PopoverTrigger>
                <PopoverContent side="top" align="start" className="w-80 p-0">
                  <Command>
                    <CommandInput placeholder="Search skills…" />
                    <CommandList className="max-h-72">
                      <CommandEmpty>No skills found.</CommandEmpty>
                      <CommandGroup heading="Available skills">
                        {skills.map((skill) => {
                          const active = selectedSkills.includes(skill.id);
                          return (
                            <CommandItem
                              key={skill.id}
                              value={`${skill.name} ${skill.description ?? ""} ${skill.id}`}
                              onSelect={() => {
                                setSelectedSkills((current) =>
                                  current.includes(skill.id)
                                    ? current.filter((id) => id !== skill.id)
                                    : [...current, skill.id],
                                );
                              }}
                              className="items-start gap-2"
                            >
                              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded border border-border/60 bg-muted/40">
                                <Sparkles className="size-3" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1.5">
                                  <span className="truncate text-xs font-medium">
                                    {skill.name}
                                  </span>
                                  {skill.autoinvoke ? (
                                    <span className="rounded bg-muted px-1 font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
                                      auto
                                    </span>
                                  ) : null}
                                </span>
                                {skill.description ? (
                                  <span className="mt-0.5 block max-h-8 overflow-hidden text-[10px] leading-relaxed text-muted-foreground">
                                    {skill.description}
                                  </span>
                                ) : null}
                              </span>
                              {active ? (
                                <Check className="mt-0.5 size-3.5 shrink-0 text-brand" />
                              ) : null}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            ) : null}

            {primaryAgents.length > 0 ? (
              <Select value={agent} onValueChange={onAgentChange}>
                <SelectTrigger
                  size="sm"
                  className="h-7 w-auto gap-1.5 border-0 bg-transparent px-2 text-[11px] text-muted-foreground shadow-none focus-visible:ring-1"
                >
                  <SelectValue placeholder="Agent" />
                </SelectTrigger>
                <SelectContent side="top" align="start">
                  {primaryAgents.map((item) => (
                    <SelectItem key={item.name} value={item.name} className="text-xs">
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            <div className="ml-auto flex items-center gap-1">
              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                hidden
                onChange={(event) => {
                  void addFiles(event.target.files);
                  event.target.value = "";
                }}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                onClick={onAddContext}
                aria-label="Add context"
                title="Add context without sending a message"
              >
                <BookPlus className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                onClick={() => fileRef.current?.click()}
                aria-label="Attach image"
              >
                <Paperclip className="size-3.5" />
              </Button>
              <span className="hidden items-center gap-1 px-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/40 sm:flex">
                <AtSign className="size-3" /> files
              </span>
              {busy ? (
                <Button
                  variant="secondary"
                  size="icon-sm"
                  disabled={aborting}
                  onClick={async () => {
                    setAborting(true);
                    try {
                      await onAbort();
                    } catch (error) {
                      toast.error("Could not stop the session", {
                        description: error instanceof Error ? error.message : undefined,
                      });
                    } finally {
                      setAborting(false);
                    }
                  }}
                  aria-label="Stop generating"
                >
                  <Square className="size-3 fill-current" />
                </Button>
              ) : (
                <Button
                  size="icon-sm"
                  disabled={!canSend || sending}
                  onClick={() => void submit()}
                  aria-label="Send message"
                >
                  <ArrowUp className="size-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-muted-foreground/60">
          <span className="hidden sm:inline">
            <kbd className="font-mono">Enter</kbd> to send ·{" "}
            <kbd className="font-mono">Shift+Enter</kbd> for newline
          </span>
          <span className="flex items-center gap-2 font-mono">
            <span>/ commands</span>
            <span>! shell</span>
          </span>
        </div>
      </div>
    </div>
  );
});
