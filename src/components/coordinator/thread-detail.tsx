"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRightLeft,
  Copy,
  ExternalLink,
  FileDown,
} from "lucide-react";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  getTranscript,
  markHandedOff,
  startLangGraphHandoff,
} from "@/lib/coordinator/adapters";
import {
  buildHandoffBundle,
  fillLaunchUrl,
  isRunningLow,
  renderHandoffPrompt,
} from "@/lib/coordinator/handoff";
import type {
  CoordThread,
  HandoffRecord,
  Platform,
  Project,
  TranscriptMessage,
} from "@/lib/coordinator/types";
import { StateBadge, TokenBar } from "./overview";

const REASONS = [
  "running low on tokens",
  "another model is better suited",
  "moving to another device",
  "parallelising the work",
];

function download(name: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Prefer a target with a larger context window when the source is running low. */
function suggestTarget(
  targets: Platform[],
  source: Platform | undefined,
  low: boolean,
): Platform | undefined {
  if (!low || !source?.contextWindow) return targets[0];
  const roomier = targets.filter(
    (t) => (t.contextWindow ?? 0) > (source.contextWindow ?? 0),
  );
  return roomier[0] ?? targets[0];
}

export function ThreadDetail({
  thread,
  project,
  platforms,
  onBack,
  onHandedOff,
}: {
  thread: CoordThread;
  project: Project;
  platforms: Platform[];
  onBack: () => void;
  onHandedOff: (record: HandoffRecord) => void;
}) {
  const source = platforms.find((p) => p.id === thread.platformId);
  const targets = useMemo(
    () => platforms.filter((p) => p.kind !== "feed" && p.id !== source?.id),
    [platforms, source?.id],
  );
  const low = isRunningLow(thread.tokens);

  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [targetId, setTargetId] = useState("");
  const [model, setModel] = useState("");
  const [reason, setReason] = useState(low ? REASONS[0] : REASONS[1]);
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTargetId(suggestTarget(targets, source, low)?.id ?? "");
    setReason(low ? REASONS[0] : REASONS[1]);
    setBrief("");
    setTranscript([]);
    if (!source) return;
    getTranscript(source, thread.id)
      .then(setTranscript)
      .catch((e) => toast.error(`Could not load transcript: ${e.message}`));
  }, [thread.id, source, targets, low]);

  const target = targets.find((t) => t.id === targetId);

  const prompt = useMemo(() => {
    if (!source || !target) return "";
    return renderHandoffPrompt(
      buildHandoffBundle({
        thread,
        project,
        source,
        target,
        targetModel: model,
        transcript,
        brief,
        reason,
      }),
    );
  }, [thread, project, source, target, model, transcript, brief, reason]);

  const fileName = `handoff-${thread.id.slice(0, 8)}.md`;

  async function record(toThread?: string, toUrl?: string) {
    if (!source || !target) return;
    const toRef = toThread ? `${target.id}:${toThread}` : target.id;
    onHandedOff({
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      fromThread: thread.id,
      fromPlatform: source.id,
      toPlatform: target.name,
      toThread,
      toUrl,
    });
    await markHandedOff(source, thread.id, toRef).catch(() => {
      // The local log still records it if the source is read-only.
    });
  }

  async function handOff() {
    if (!source || !target) return;
    setBusy(true);
    try {
      if (target.kind === "langgraph") {
        const { threadId, url } = await startLangGraphHandoff({
          target,
          projectId: project.id,
          prompt,
          fromRef: `${source.id}:${thread.id}`,
          model: model || target.model,
        });
        await record(threadId, url);
        toast.success(`Handed off to ${target.name}`, {
          action: { label: "Open", onClick: () => window.open(url, "_blank") },
        });
      } else if (target.kind === "manual") {
        // Start the copy and open the tab inside the click, before any await,
        // so neither is blocked as a non-user-initiated action.
        const copied = navigator.clipboard.writeText(prompt).catch(() => {});
        if (target.launchUrl) {
          window.open(fillLaunchUrl(target.launchUrl, prompt), "_blank");
        } else {
          download(fileName, prompt);
        }
        await copied;
        await record();
        toast.success(
          target.launchUrl
            ? `Opened ${target.name}. The prompt is also on your clipboard.`
            : `Saved ${fileName}. Run it with the command below.`,
        );
      }
    } catch (e) {
      toast.error(`Handoff failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-start gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="duo-back shrink-0"
          aria-label="Back to overview"
          onClick={onBack}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground text-xs">{project.name}</p>
          <h2 className="truncate font-semibold">{thread.title}</h2>
          <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-3 text-xs">
            <StateBadge state={thread.state} />
            <span>
              {source?.name ?? thread.platformId} · {source?.host}
              {thread.model ? ` · ${thread.model}` : ""}
            </span>
            <TokenBar thread={thread} />
            {thread.handedOffTo && <span>→ {thread.handedOffTo}</span>}
          </div>
        </div>
        {thread.url && (
          <Button
            asChild
            variant="outline"
            size="sm"
          >
            <a
              href={thread.url}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="size-4" /> Open
            </a>
          </Button>
        )}
      </div>

      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <ArrowRightLeft className="size-4" /> Hand off this thread
          {low && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-normal text-amber-800">
              suggested: low on tokens
            </span>
          )}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="handoff-target">To platform</Label>
            <select
              id="handoff-target"
              className="h-9 rounded-md border bg-transparent px-2 text-sm"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            >
              {targets.map((t) => (
                <option
                  key={t.id}
                  value={t.id}
                >
                  {t.name} ({t.host})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="handoff-model">Model</Label>
            <Input
              id="handoff-model"
              placeholder={target?.model ?? "platform default"}
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="handoff-reason">Why</Label>
          <select
            id="handoff-reason"
            className="h-9 rounded-md border bg-transparent px-2 text-sm"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            {REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="handoff-brief">Brief for the next agent</Label>
          <Textarea
            id="handoff-brief"
            placeholder="Goal, decisions made so far, what to do next..."
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            {transcript.length > 0
              ? `${transcript.length} messages from the thread are included, trimmed to fit.`
              : "No transcript available from this platform, so the brief carries the context."}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!target || busy}
            onClick={handOff}
          >
            {target?.kind === "langgraph"
              ? `Start on ${target.name}`
              : `Hand off to ${target?.name ?? "..."}`}
          </Button>
          <Button
            variant="outline"
            disabled={!prompt}
            onClick={() =>
              navigator.clipboard
                .writeText(prompt)
                .then(() => toast.success("Handoff prompt copied"))
            }
          >
            <Copy className="size-4" /> Copy prompt
          </Button>
          <Button
            variant="outline"
            disabled={!prompt}
            onClick={() => download(fileName, prompt)}
          >
            <FileDown className="size-4" /> Download .md
          </Button>
        </div>
        {target?.kind === "manual" && target.cliCommand && (
          <code className="bg-muted rounded px-2 py-1 text-xs">
            {target.cliCommand.replace("{file}", fileName)}
          </code>
        )}

        <details>
          <summary className="text-muted-foreground cursor-pointer text-xs">
            Preview handoff prompt
          </summary>
          <pre className="bg-muted mt-2 max-h-80 overflow-auto rounded p-3 text-xs whitespace-pre-wrap">
            {prompt}
          </pre>
        </details>
      </section>
    </div>
  );
}
