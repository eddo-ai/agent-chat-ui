"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  HOSTS,
  type Host,
  type Platform,
  type PlatformKind,
} from "@/lib/coordinator/types";

const KIND_HELP: Record<PlatformKind, string> = {
  langgraph:
    "A LangGraph deployment. Read and write: threads show up here and handoffs start new runs.",
  feed: "A JSON feed from another coordinator (Claude project, herdr, CI). Read only.",
  manual:
    "A place you paste into: Claude.ai, ChatGPT, a CLI. Handoff target only.",
};

function Field({
  name,
  label,
  placeholder,
  type = "text",
}: {
  name: string;
  label: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={`pf-${name}`}>{label}</Label>
      <Input
        id={`pf-${name}`}
        name={name}
        type={type}
        placeholder={placeholder}
      />
    </div>
  );
}

function fromForm(kind: PlatformKind, f: FormData): Platform {
  const str = (k: string) => (f.get(k) as string | null)?.trim() || undefined;
  const base = {
    id: uuidv4(),
    name: str("name") ?? kind,
    host: (str("host") as Host) ?? "cloud",
    model: str("model"),
    contextWindow: str("contextWindow")
      ? Number(str("contextWindow"))
      : undefined,
    defaultProject: str("defaultProject"),
  };
  switch (kind) {
    case "langgraph":
      return {
        ...base,
        kind,
        apiUrl: str("apiUrl") ?? "",
        assistantId: str("assistantId") ?? "agent",
        apiKey: str("apiKey"),
      };
    case "feed":
      return { ...base, kind, url: str("url") ?? "" };
    case "manual":
      return {
        ...base,
        kind,
        launchUrl: str("launchUrl"),
        cliCommand: str("cliCommand"),
      };
  }
}

export function PlatformSettings({
  open,
  onOpenChange,
  platforms,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platforms: Platform[];
  onSave: (next: Platform[]) => void;
}) {
  const [kind, setKind] = useState<PlatformKind>("langgraph");

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Platforms</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-6 px-4 pb-6">
          <ul className="flex flex-col divide-y rounded-md border">
            {platforms.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {p.kind} · {p.host}
                    {p.model ? ` · ${p.model}` : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${p.name}`}
                  onClick={() => onSave(platforms.filter((x) => x.id !== p.id))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>

          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              onSave([...platforms, fromForm(kind, new FormData(form))]);
              form.reset();
            }}
          >
            <h3 className="text-sm font-semibold">Add a platform</h3>
            <div className="flex gap-1">
              {(Object.keys(KIND_HELP) as PlatformKind[]).map((k) => (
                <Button
                  key={k}
                  type="button"
                  size="sm"
                  variant={k === kind ? "default" : "outline"}
                  onClick={() => setKind(k)}
                >
                  {k}
                </Button>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">{KIND_HELP[kind]}</p>
            <Field
              name="name"
              label="Name"
              placeholder="My cloud agent"
            />
            <div className="flex flex-col gap-1">
              <Label htmlFor="pf-host">Runs on</Label>
              <select
                id="pf-host"
                name="host"
                className="h-9 rounded-md border bg-transparent px-2 text-sm"
              >
                {HOSTS.map((h) => (
                  <option key={h}>{h}</option>
                ))}
              </select>
            </div>
            {kind === "langgraph" && (
              <>
                <Field
                  name="apiUrl"
                  label="Deployment URL"
                  placeholder="http://localhost:2024"
                />
                <Field
                  name="assistantId"
                  label="Assistant / graph ID"
                  placeholder="agent"
                />
                <Field
                  name="apiKey"
                  label="LangSmith API key"
                  type="password"
                />
              </>
            )}
            {kind === "feed" && (
              <Field
                name="url"
                label="Feed URL"
                placeholder="https://example.com/coordinator-feed.json"
              />
            )}
            {kind === "manual" && (
              <>
                <Field
                  name="launchUrl"
                  label="Launch URL ({prompt} is replaced)"
                  placeholder="https://claude.ai/new?q={prompt}"
                />
                <Field
                  name="cliCommand"
                  label="CLI command ({file} is replaced)"
                  placeholder={'codex "$(cat {file})"'}
                />
              </>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field
                name="model"
                label="Default model"
              />
              <Field
                name="contextWindow"
                label="Context window"
                type="number"
                placeholder="200000"
              />
            </div>
            <Field
              name="defaultProject"
              label="Default project"
              placeholder="inbox"
            />
            <Button type="submit">Add platform</Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
