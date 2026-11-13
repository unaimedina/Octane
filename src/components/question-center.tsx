"use client";

import * as React from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAppData } from "@/components/app-data";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  allowsCustom,
  buildAnswers,
  emptyDrafts,
  toggleOption,
  type QuestionDraft,
  type QuestionRequest,
} from "@/lib/questions";
import { cn } from "@/lib/utils";

export function QuestionDialog({
  request,
  waiting = 0,
}: {
  request: QuestionRequest;
  waiting?: number;
}) {
  const { replyQuestion, rejectQuestion, sessions } = useAppData();
  const [drafts, setDrafts] = React.useState<QuestionDraft[]>(() => emptyDrafts(request));
  const [busy, setBusy] = React.useState<"submit" | "dismiss" | null>(null);

  const answers = buildAnswers(request, drafts);
  const title = sessions.find((session) => session.id === request.sessionID)?.title;
  const many = request.questions.length > 1;

  function update(index: number, next: QuestionDraft) {
    setDrafts((current) => current.map((draft, i) => (i === index ? next : draft)));
  }

  async function submit() {
    if (!answers || busy) return;
    setBusy("submit");
    try {
      await replyQuestion(request, answers);
    } catch (error) {
      toast.error("Could not send your answer", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  }

  async function dismiss() {
    if (busy) return;
    setBusy("dismiss");
    try {
      await rejectQuestion(request);
    } catch (error) {
      toast.error("Could not dismiss the question", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open>
      <DialogContent
        className="grid-cols-[minmax(0,1fr)] sm:max-w-lg"
        showCloseButton={false}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader>
          {waiting > 0 ? (
            <div className="font-mono text-[11px] text-muted-foreground">+{waiting} waiting</div>
          ) : null}
          {many ? (
            <div className="font-mono text-[11px] text-muted-foreground">
              {request.questions.length} questions
            </div>
          ) : null}
          <DialogTitle className="headline text-[20px] text-balance">
            {request.questions[0]?.header || "The agent has a question"}
          </DialogTitle>
          <DialogDescription className="text-[13px]">
            In session{" "}
            {title ? (
              <span className="font-medium">{title}</span>
            ) : (
              <span className="font-mono text-[11px]">{request.sessionID.slice(0, 16)}…</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="scrollbar-thin flex max-h-[60vh] min-w-0 flex-col gap-5 overflow-y-auto">
          {request.questions.map((question, index) => {
            const draft = drafts[index] ?? { selected: [], custom: "" };
            const multiple = question.multiple === true;
            return (
              <div key={index} className="flex min-w-0 flex-col gap-2">
                {many && question.header ? (
                  <div className="text-xs font-medium text-muted-foreground">
                    {question.header}
                  </div>
                ) : null}
                <p className="text-sm break-words whitespace-pre-wrap">{question.question}</p>
                {multiple ? (
                  <p className="text-xs text-muted-foreground">Select one or more</p>
                ) : null}
                <div
                  className="flex flex-col gap-2"
                  role={multiple ? "group" : "radiogroup"}
                >
                  {question.options.map((option) => {
                    const selected = draft.selected.includes(option.label);
                    return (
                      <button
                        key={option.label}
                        type="button"
                        role={multiple ? "checkbox" : "radio"}
                        aria-checked={selected}
                        disabled={Boolean(busy)}
                        className={cn(
                          "flex w-full min-w-0 items-start gap-2.5 rounded-md border border-border px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
                          selected && "border-brand/50 bg-accent",
                        )}
                        onClick={() => update(index, toggleOption(question, draft, option.label))}
                      >
                        {/* Square for single and multiple choice: the design contract has no round dots. */}
                        <span
                          aria-hidden="true"
                          className={cn(
                            "mt-0.5 grid size-3.5 shrink-0 place-items-center rounded-[3px] border",
                            selected ? "border-brand bg-brand" : "border-input",
                          )}
                        >
                          {selected ? <Check className="size-3 text-brand-foreground" /> : null}
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="font-medium break-words">{option.label}</span>
                          {option.description ? (
                            <span className="text-xs font-normal break-words text-muted-foreground">
                              {option.description}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {allowsCustom(question) ? (
                  <Input
                    value={draft.custom}
                    placeholder="Type your own answer"
                    disabled={Boolean(busy)}
                    onChange={(event) => update(index, { ...draft, custom: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && answers) {
                        event.preventDefault();
                        void submit();
                      }
                    }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="ghost"
            className="sm:mr-auto"
            disabled={Boolean(busy)}
            onClick={() => void dismiss()}
          >
            {busy === "dismiss" ? <Loader2 className="size-4 animate-spin" /> : null}
            Dismiss
          </Button>
          <Button disabled={answers === null || Boolean(busy)} onClick={() => void submit()}>
            {busy === "submit" ? <Loader2 className="size-4 animate-spin" /> : null}
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
