"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { motion } from "framer-motion";
import {
  Activity,
  BatteryLow,
  Check,
  ChevronRight,
  Ellipsis,
  Eye,
  Hand,
  Moon,
  RefreshCw,
  Send,
  Share,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isRunningLow, tokenRatio } from "@/lib/coordinator/handoff";
import type {
  CoordThread,
  CoordinatorFeed,
  Platform,
  Project,
  ThreadState,
} from "@/lib/coordinator/types";

export const STATE_STYLE: Record<
  ThreadState,
  { label: string; color: string; Icon: LucideIcon }
> = {
  blocked: { label: "Needs you", color: "var(--ios-orange)", Icon: Hand },
  review_ready: { label: "Review", color: "var(--ios-purple)", Icon: Eye },
  failed: { label: "Failed", color: "var(--ios-red)", Icon: TriangleAlert },
  working: { label: "Working", color: "var(--ios-blue)", Icon: Activity },
  idle: { label: "Idle", color: "var(--ios-gray)", Icon: Moon },
  handed_off: { label: "Handed off", color: "var(--ios-gray)", Icon: Send },
  done: { label: "Done", color: "var(--ios-green)", Icon: Check },
};

/** iOS-style round glyph in the state's system colour. */
export function StateIcon({
  state,
  className,
}: {
  state: ThreadState;
  className?: string;
}) {
  const { color, Icon } = STATE_STYLE[state];
  return (
    <span
      className={cn("ios-icon", className)}
      style={{ background: color }}
    >
      <Icon
        className="size-4"
        strokeWidth={2.5}
      />
    </span>
  );
}

export function StateBadge({ state }: { state: ThreadState }) {
  const s = STATE_STYLE[state];
  return (
    <span
      className="inline-flex items-center gap-1.5"
      style={{ color: s.color }}
    >
      <span
        className={cn(
          "size-2 rounded-full",
          state === "working" && "animate-pulse",
        )}
        style={{ background: s.color }}
      />
      {s.label}
    </span>
  );
}

export function TokenBar({
  thread,
  className,
}: {
  thread: CoordThread;
  className?: string;
}) {
  const ratio = tokenRatio(thread.tokens);
  if (ratio === undefined) return null;
  const low = isRunningLow(thread.tokens);
  return (
    <div
      className={cn("h-1 w-16 overflow-hidden rounded-full", className)}
      style={{ background: "var(--ios-fill)" }}
      title={`${thread.tokens?.used.toLocaleString()} / ${thread.tokens?.limit?.toLocaleString()} tokens`}
    >
      <div
        className="h-full rounded-full"
        style={{
          width: `${Math.min(100, ratio * 100)}%`,
          background: low ? "var(--ios-orange)" : "var(--ios-blue)",
        }}
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

  const summary: {
    label: string;
    count: number;
    color: string;
    Icon: LucideIcon;
  }[] = [
    {
      label: "Needs you",
      count:
        (counts.blocked ?? 0) +
        (counts.review_ready ?? 0) +
        (counts.failed ?? 0),
      color: "var(--ios-orange)",
      Icon: Hand,
    },
    {
      label: "Working",
      count: counts.working ?? 0,
      color: "var(--ios-blue)",
      Icon: Activity,
    },
    {
      label: "Idle",
      count: counts.idle ?? 0,
      color: "var(--ios-gray)",
      Icon: Moon,
    },
    {
      label: "Low tokens",
      count: lowCount,
      color: "var(--ios-red)",
      Icon: BatteryLow,
    },
  ];

  return (
    <div className="ios flex flex-col pb-6">
      <header className="ios-navbar">
        <div className="flex justify-end gap-2">
          <button
            className="ios-toolbar-button"
            aria-label="Export as feed"
            title="Export as feed"
            onClick={() =>
              downloadJson("coordinator-feed.json", toFeed(projects))
            }
          >
            <Share className="size-[18px]" />
          </button>
          <button
            className="ios-toolbar-button"
            aria-label="Refresh"
            onClick={onRefresh}
          >
            <RefreshCw
              className={cn("size-[18px]", loading && "animate-spin")}
            />
          </button>
          <button
            className="ios-toolbar-button"
            aria-label="Platforms"
            onClick={onOpenSettings}
          >
            <Ellipsis className="size-[18px]" />
          </button>
        </div>
        <h1 className="ios-large-title mt-1">Coordinator</h1>
        <p className="ios-footnote">
          {all.length} threads · {projects.length} projects · {platforms.length}{" "}
          platforms
        </p>
      </header>

      <div className="mx-4 mt-2 grid grid-cols-2 gap-3">
        {summary.map(({ label, count, color, Icon }) => (
          <div
            key={label}
            className="ios-summary-card"
          >
            <div className="flex items-start justify-between">
              <span
                className="ios-icon"
                style={{ background: color }}
              >
                <Icon
                  className="size-4"
                  strokeWidth={2.5}
                />
              </span>
              <span className="text-[28px] leading-none font-bold tabular-nums">
                {count}
              </span>
            </div>
            <span
              className="text-[15px] font-semibold"
              style={{ color: "var(--ios-secondary)" }}
            >
              {label}
            </span>
          </div>
        ))}
      </div>

      {Object.keys(errors).length > 0 && (
        <>
          <h2 className="ios-section-header">Couldn&apos;t reach</h2>
          <div className="ios-group">
            {Object.entries(errors).map(([id, msg]) => (
              <p
                key={id}
                className="ios-row text-[15px]"
                style={{ color: "var(--ios-red)" }}
              >
                {byId.get(id)?.name ?? id}: {msg}
              </p>
            ))}
          </div>
        </>
      )}

      {all.length === 0 && !loading && (
        <p className="ios-group-footer mt-6 text-center">
          No threads yet. Add a LangGraph deployment or a coordinator feed in{" "}
          <button
            className="ios-tint"
            onClick={onOpenSettings}
          >
            Platforms
          </button>
          .
        </p>
      )}

      {projects.map((project) => (
        <section key={project.id}>
          <h2 className="ios-section-header">{project.name}</h2>
          <ul
            className="ios-group"
            style={{ ["--ios-separator-inset" as string]: "58px" }}
          >
            {project.threads.map((t) => {
              const platform = byId.get(t.platformId);
              const key = `${t.platformId}:${t.id}`;
              return (
                <motion.li
                  key={key}
                  layout
                  transition={{ type: "spring", stiffness: 400, damping: 34 }}
                >
                  <button
                    onClick={() => onSelect(t)}
                    data-selected={selectedId === key}
                    className={cn(
                      "ios-row",
                      t.state === "handed_off" && "opacity-50",
                    )}
                  >
                    <StateIcon state={t.state} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate">{t.title}</span>
                        {isRunningLow(t.tokens) && (
                          <BatteryLow
                            className="size-4 shrink-0"
                            style={{ color: "var(--ios-red)" }}
                            aria-label="Low on tokens"
                          />
                        )}
                      </span>
                      <span
                        className="truncate text-[15px] leading-5"
                        style={{ color: "var(--ios-secondary)" }}
                      >
                        {platform?.name ?? t.platformId}
                        {t.model ? ` · ${t.model}` : ""}
                      </span>
                    </span>
                    <span
                      className="shrink-0 text-[15px]"
                      style={{ color: "var(--ios-secondary)" }}
                    >
                      {formatDistanceToNowStrict(new Date(t.updatedAt))}
                    </span>
                    <ChevronRight className="ios-chevron size-4" />
                  </button>
                </motion.li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
