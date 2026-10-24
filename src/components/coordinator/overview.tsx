"use client";

import { formatDistanceToNow } from "date-fns";
import { RefreshCw, Settings, Download, BatteryLow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isRunningLow, tokenRatio } from "@/lib/coordinator/handoff";
import type {
  CoordThread,
  CoordinatorFeed,
  Platform,
  Project,
  ThreadState,
} from "@/lib/coordinator/types";

export const STATE_STYLE: Record<ThreadState, { label: string; dot: string }> =
  {
    blocked: { label: "Needs you", dot: "bg-amber-500" },
    review_ready: { label: "Review", dot: "bg-violet-500" },
    failed: { label: "Failed", dot: "bg-red-500" },
    working: { label: "Working", dot: "bg-sky-500 animate-pulse" },
    idle: { label: "Idle", dot: "bg-gray-400" },
    handed_off: { label: "Handed off", dot: "bg-gray-300" },
    done: { label: "Done", dot: "bg-emerald-500" },
  };

export function StateBadge({ state }: { state: ThreadState }) {
  const s = STATE_STYLE[state];
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
      <span className={cn("size-2 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}

export function TokenBar({ thread }: { thread: CoordThread }) {
  const ratio = tokenRatio(thread.tokens);
  if (ratio === undefined) return null;
  const low = isRunningLow(thread.tokens);
  return (
    <div
      className="bg-muted h-1 w-16 overflow-hidden rounded-full"
      title={`${thread.tokens?.used.toLocaleString()} / ${thread.tokens?.limit?.toLocaleString()} tokens`}
    >
      <div
        className={cn("h-full", low ? "bg-amber-500" : "bg-sky-500")}
        style={{ width: `${Math.min(100, ratio * 100)}%` }}
      />
    </div>
  );
}

/** This overview as a feed, so a higher-level coordinator can read it. */
export function toFeed(projects: Project[]): CoordinatorFeed {
  return {
    coordinator: { name: "Agent Chat coordinator" },
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      threads: p.threads.map((t) => ({
        id: t.id,
        title: t.title,
        state: t.state,
        model: t.model,
        updatedAt: t.updatedAt,
        url: t.url,
        tokens: t.tokens,
      })),
    })),
  };
}

function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function Overview({
  projects,
  platforms,
  errors,
  loading,
  selectedId,
  onSelect,
  onRefresh,
  onOpenSettings,
}: {
  projects: Project[];
  platforms: Platform[];
  errors: Record<string, string>;
  loading: boolean;
  selectedId?: string;
  onSelect: (thread: CoordThread) => void;
  onRefresh: () => void;
  onOpenSettings: () => void;
}) {
  const byId = new Map(platforms.map((p) => [p.id, p]));
  const all = projects.flatMap((p) => p.threads);
  const counts = all.reduce<Partial<Record<ThreadState, number>>>((acc, t) => {
    acc[t.state] = (acc[t.state] ?? 0) + 1;
    return acc;
  }, {});
  const lowCount = all.filter((t) => isRunningLow(t.tokens)).length;

  return (
    <div className="flex flex-col">
      <header className="bg-background/95 sticky top-0 z-10 flex flex-col gap-3 border-b p-4 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              Coordinator
            </h1>
            <p className="text-muted-foreground text-xs">
              {all.length} threads · {projects.length} projects ·{" "}
              {platforms.length} platforms
            </p>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Export as feed"
              title="Export as feed"
              onClick={() =>
                downloadJson("coordinator-feed.json", toFeed(projects))
              }
            >
              <Download className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Refresh"
              onClick={onRefresh}
            >
              <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Platforms"
              onClick={onOpenSettings}
            >
              <Settings className="size-4" />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {(Object.keys(STATE_STYLE) as ThreadState[])
            .filter((s) => counts[s])
            .map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1"
              >
                <StateBadge state={s} />
                <span className="text-xs font-medium">{counts[s]}</span>
              </span>
            ))}
          {lowCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-600">
              <BatteryLow className="size-3.5" />
              {lowCount} low on tokens
            </span>
          )}
        </div>
      </header>

      {Object.entries(errors).map(([id, msg]) => (
        <p
          key={id}
          className="mx-4 mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {byId.get(id)?.name ?? id}: {msg}
        </p>
      ))}

      {all.length === 0 && !loading && (
        <div className="text-muted-foreground p-6 text-sm">
          No threads yet. Add a LangGraph deployment or a coordinator feed under{" "}
          <button
            className="underline"
            onClick={onOpenSettings}
          >
            Platforms
          </button>
          .
        </div>
      )}

      {projects.map((project) => (
        <div
          key={project.id}
          className="border-b py-2"
        >
          <h2 className="text-muted-foreground px-4 py-1 text-xs font-semibold tracking-wide uppercase">
            {project.name}
          </h2>
          <ul>
            {project.threads.map((t) => {
              const platform = byId.get(t.platformId);
              return (
                <li key={`${t.platformId}:${t.id}`}>
                  <button
                    onClick={() => onSelect(t)}
                    className={cn(
                      "hover:bg-muted/60 flex w-full flex-col gap-1 px-4 py-2 text-left",
                      selectedId === `${t.platformId}:${t.id}` && "bg-muted",
                      t.state === "handed_off" && "opacity-60",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm">{t.title}</span>
                      <StateBadge state={t.state} />
                    </span>
                    <span className="text-muted-foreground flex items-center gap-2 text-xs">
                      <span className="truncate">
                        {platform?.name ?? t.platformId} · {platform?.host}
                        {t.model ? ` · ${t.model}` : ""}
                      </span>
                      <TokenBar thread={t} />
                      <span className="ml-auto shrink-0">
                        {formatDistanceToNow(new Date(t.updatedAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
