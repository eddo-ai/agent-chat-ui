"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronsUpDown,
  Copy,
  ExternalLink,
  FileDown,
  ScrollText,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
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
import { StateBadge, StateIcon, TokenBar } from "./overview";

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
  // Bumped on each successful handoff to replay the send animation.
  const [sent, setSent] = useState(0);

  useEffect(() => {
    setTargetId(suggestTarget(targets, source, low)?.id ?? "");
    setReason(low ? REASONS[0] : REASONS[1]);
    setBrief("");
    setTranscript([]);
    if (!source) return;
    // Drop responses for a thread that is no longer selected, so a slow
    // request can't put another thread's transcript into this handoff.
    let current = true;
    getTranscript(source, thread.id)
      .then((messages) => current && setTranscript(messages))
      .catch(
        (e) =>
          current && toast.error(`Could not load transcript: ${e.message}`),
      );
    return () => {
      current = false;
    };
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
        setSent((n) => n + 1);
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
        setSent((n) => n + 1);
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

  const context =
    thread.tokens?.limit !== undefined
      ? `${Math.round((thread.tokens.used / thread.tokens.limit) * 100)}% used`
      : undefined;

  return (
    <div className="ios flex flex-col pb-8">
      <nav className="ios-navbar flex items-center justify-between">
        <button
          className="duo-back ios-tint -ml-2 flex items-center text-[17px]"
          onClick={onBack}
        >
          <ChevronLeft
            className="size-7"
            strokeWidth={2.25}
          />
          Coordinator
        </button>
        <span />
        {thread.url && (
          <a
            href={thread.url}
            target="_blank"
            rel="noreferrer"
            className="ios-tint flex items-center gap-1 text-[17px]"
          >
            Open <ExternalLink className="size-4" />
          </a>
        )}
      </nav>

      <header className="flex items-start gap-3 px-4 pt-1 pb-2">
        <StateIcon
          state={thread.state}
          className="mt-1 size-10"
        />
        <div className="min-w-0">
          <p className="ios-footnote">{project.name}</p>
          <h2 className="ios-title2 line-clamp-2">{thread.title}</h2>
        </div>
      </header>

      <div className="ios-group mt-2">
        <div className="ios-row">
          Status
          <span className="ios-row-value">
            <StateBadge state={thread.state} />
          </span>
        </div>
        <div className="ios-row">
          Platform
          <span className="ios-row-value truncate">
            {source?.name ?? thread.platformId} · {source?.host}
          </span>
        </div>
        {thread.model && (
          <div className="ios-row">
            Model
            <span className="ios-row-value">{thread.model}</span>
          </div>
        )}
        {context && (
          <div className="ios-row">
            Context
            <span className="ios-row-value flex items-center gap-2">
              <TokenBar thread={thread} />
              <span style={low ? { color: "var(--ios-red)" } : undefined}>
                {context}
              </span>
            </span>
          </div>
        )}
        {thread.handedOffTo && (
          <div className="ios-row">
            Handed off to
            <span className="ios-row-value">{thread.handedOffTo}</span>
          </div>
        )}
      </div>

      <h3 className="ios-section-header flex items-center gap-2">
        Hand off
        {low && (
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white normal-case"
            style={{ background: "var(--ios-red)" }}
          >
            Suggested · low on tokens
          </span>
        )}
      </h3>
      <div className="ios-group">
        <label className="ios-row">
          To
          <select
            id="handoff-target"
            className="ios-select ml-auto min-w-0 flex-1"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
          >
            {targets.map((t) => (
              <option
                key={t.id}
                value={t.id}
              >
                {t.name}
              </option>
            ))}
          </select>
          <ChevronsUpDown className="ios-chevron size-4" />
        </label>
        <label className="ios-row">
          Model
          <input
            id="handoff-model"
            className="ios-input min-w-0 flex-1 text-right"
            placeholder={target?.model ?? "Default"}
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        </label>
        <label className="ios-row">
          Reason
          <select
            id="handoff-reason"
            className="ios-select ml-auto min-w-0 flex-1"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            {REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <ChevronsUpDown className="ios-chevron size-4" />
        </label>
      </div>

      <h3 className="ios-section-header">Brief for the next agent</h3>
      <div className="ios-group">
        <textarea
          id="handoff-brief"
          rows={4}
          className="ios-input ios-row resize-none"
          placeholder="Goal, decisions so far, what to do next"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
        />
      </div>
      <p className="ios-group-footer">
        {transcript.length > 0
          ? `${transcript.length} messages from the thread are included, trimmed to fit.`
          : "No transcript from this platform, so the brief carries the context."}
      </p>

      <motion.div
        className="relative mx-4 mt-6"
        whileTap={{ scale: 0.97 }}
      >
        <button
          className="ios-button-filled"
          disabled={!target || busy}
          onClick={handOff}
        >
          <Send className="size-[18px]" />
          {target?.kind === "langgraph"
            ? `Start on ${target.name}`
            : `Hand Off to ${target?.name ?? "..."}`}
        </button>
        <AnimatePresence>
          {sent > 0 && (
            <motion.span
              key={sent}
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-1/2"
              initial={{ x: 0, y: "-50%", opacity: 1, rotate: 0, scale: 1 }}
              animate={{ x: 220, y: -140, opacity: 0, rotate: -25, scale: 1.4 }}
              transition={{ duration: 0.8, ease: [0.3, 0, 0.2, 1] }}
              onAnimationComplete={() => setSent(0)}
            >
              <Send
                className="size-6"
                style={{ color: "var(--ios-blue)" }}
              />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>

      <div className="ios-group mt-6">
        <button
          className="ios-row ios-tint"
          disabled={!prompt}
          onClick={() =>
            navigator.clipboard
              .writeText(prompt)
              .then(() => toast.success("Handoff prompt copied"))
          }
        >
          <Copy className="size-5" /> Copy Prompt
        </button>
        <button
          className="ios-row ios-tint"
          disabled={!prompt}
          onClick={() => download(fileName, prompt)}
        >
          <FileDown className="size-5" /> Save as Markdown
        </button>
        <details>
          <summary className="ios-row ios-tint cursor-pointer list-none">
            <ScrollText className="size-5" /> Preview Prompt
          </summary>
          <pre className="max-h-80 overflow-auto px-4 pb-4 font-mono text-xs whitespace-pre-wrap">
            {prompt}
          </pre>
        </details>
      </div>
      {target?.kind === "manual" && target.cliCommand && (
        <p className="ios-group-footer">
          Run it with{" "}
          <code className="font-mono">
            {target.cliCommand.replace("{file}", fileName)}
          </code>
        </p>
      )}
    </div>
  );
}
