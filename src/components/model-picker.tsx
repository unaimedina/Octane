"use client";

import * as React from "react";
import { Check, ChevronDown, Cpu } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ModelOption } from "@/lib/types";
import { cn } from "@/lib/utils";

export type ModelSelection = {
  providerID: string;
  modelID: string;
};

export function findModel(
  models: ModelOption[],
  value: ModelSelection | null,
): ModelOption | undefined {
  if (!value) return undefined;
  return models.find(
    (model) =>
      model.providerID === value.providerID && model.modelID === value.modelID,
  );
}

export function ModelPicker({
  models,
  value,
  onChange,
  side = "top",
  align = "start",
  className,
  label = "Default model",
  allowDefault = false,
}: {
  models: ModelOption[];
  value: ModelSelection | null;
  onChange: (value: ModelSelection | null) => void;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  className?: string;
  label?: string;
  allowDefault?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const connected = React.useMemo(
    () => models.filter((model) => model.connected),
    [models],
  );
  const pool = connected.length > 0 ? connected : models;
  const groups = React.useMemo(() => {
    const map = new Map<string, ModelOption[]>();
    for (const model of pool) {
      const list = map.get(model.providerName) ?? [];
      list.push(model);
      map.set(model.providerName, list);
    }
    return [...map.entries()];
  }, [pool]);

  const selected = findModel(models, value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "min-w-0 justify-start gap-1.5 px-2 text-[12px] text-muted-foreground",
            className,
          )}
          aria-label={label}
        >
          <Cpu className="size-3.5 shrink-0" />
          <span className="max-w-52 truncate">
            {selected?.name ?? (value ? value.modelID : "Server default")}
          </span>
          <ChevronDown className="size-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side={side} align={align} className="w-80 p-0">
        <Command>
          <CommandInput placeholder="Search models…" />
          <CommandList className="max-h-72 **:[[cmdk-group-heading]]:text-[11px] **:[[cmdk-group-heading]]:font-normal">
            <CommandEmpty>No models found.</CommandEmpty>
            {allowDefault ? (
              <CommandGroup heading="Fallback">
                <CommandItem
                  value="server default"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                  className="gap-2"
                >
                  <span className="min-w-0 flex-1 truncate">Use server default</span>
                  {!value ? <Check className="size-3.5 shrink-0 text-brand" /> : null}
                </CommandItem>
              </CommandGroup>
            ) : null}
            {groups.map(([provider, items]) => (
              <CommandGroup key={provider} heading={provider}>
                {items.map((model) => {
                  const active =
                    value?.providerID === model.providerID &&
                    value?.modelID === model.modelID;
                  return (
                    <CommandItem
                      key={`${model.providerID}/${model.modelID}`}
                      value={`${provider} ${model.name} ${model.modelID}`}
                      onSelect={() => {
                        onChange({
                          providerID: model.providerID,
                          modelID: model.modelID,
                        });
                        setOpen(false);
                      }}
                      className="gap-2"
                    >
                      <span className="min-w-0 flex-1 truncate">{model.name}</span>
                      {model.reasoning ? (
                        <span className="rounded-sm bg-muted px-1 font-mono text-[10px] text-muted-foreground">
                          reasoning
                        </span>
                      ) : null}
                      {active ? <Check className="size-3.5 shrink-0 text-brand" /> : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
