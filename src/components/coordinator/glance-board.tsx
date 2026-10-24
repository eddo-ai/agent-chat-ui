"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BatteryLow } from "lucide-react";
import { cn } from "@/lib/utils";
import { isRunningLow, tokenRatio } from "@/lib/coordinator/handoff";
import type {
  CoordThread,
  Platform,
  Project,
  ThreadState,
} from "@/lib/coordinator/types";
import { STATE_STYLE } from "./overview";

/** The states the board leads with, in the order they need attention. */
export const HEADLINE: {
  label: string;
  states: ThreadState[];
  tone: string;
}[] = [
  {
    label: "Needs you",
    states: ["blocked", "review_ready", "failed"],
    tone: "glass-amber",
  },
  { label: "Working", states: ["working"], tone: "glass-sky" },
  { label: "Idle", states: ["idle"], tone: "glass-gray" },
];

export function rank(state: ThreadState): number {
  const i = HEADLINE.findIndex((h) => h.states.includes(state));
  return i < 0 ? HEADLINE.length : i;
}

/** Liquid Glass tint per state (see .glass-* in globals.css). */
export const GLASS_TINT: Record<ThreadState, string> = {
  blocked: "glass-amber",
  review_ready: "glass-violet",
  failed: "glass-red",
  working: "glass-sky",
  idle: "glass-gray",
  handed_off: "glass-gray opacity-50",
  done: "glass-gray opacity-70",
};

/** Ambient motion: working threads shimmer, ones that need you breathe. */
export const TILE_MOTION: Partial<Record<ThreadState, string>> = {
  working: "glance-working",
  blocked: "glance-breathe",
  review_ready: "glance-breathe",
  failed: "glance-breathe",
};

/** A big number that pops when it changes. */
export function Count({ value }: { value: number }) {
  return (
    <AnimatePresence
      mode="popLayout"
      initial={false}
    >
      <motion.p
        key={value}
        initial={{ y: -16, opacity: 0, scale: 1.3 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 16, opacity: 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 25 }}
        className="text-4xl leading-none font-bold tabular-nums"
      >
        {value}
      </motion.p>
    </AnimatePresence>
  );
}

/**
 * Threads still in play, most urgent first, with their project name.
 * Finished and handed-off threads are left out to keep boards scannable.
 */
export function liveThreads(projects: Project[]) {
  return projects
    .flatMap((p) => p.threads.map((t) => ({ t, project: p.name })))
    .filter(({ t }) => t.state !== "done" && t.state !== "handed_off")
    .sort((a, b) => rank(a.t.state) - rank(b.t.state));
}

export interface BoardProps {
  projects: Project[];
  platforms: Platform[];
  selectedId?: string;
  onSelect: (thread: CoordThread) => void;
}

/**
 * Status at a glance, for the upright screen of a device folded like a
 * laptop: large type and colour blocks readable from across a desk.
 * This is the "tiles" concept; see board-concepts.tsx for the others.
 */
export function GlanceBoard({
  projects,
  platforms,
  selectedId,
  onSelect,
}: BoardProps) {
  const reduce = useReducedMotion();
  const byId = new Map(platforms.map((p) => [p.id, p]));
  const live = liveThreads(projects);
  const low = live.filter(({ t }) => isRunningLow(t.tokens)).length;

  return (
    <div className="flex h-full flex-col gap-4 p-4 text-gray-900">
      <div className="grid grid-cols-4 gap-3">
        {HEADLINE.map((h) => (
          <div
            key={h.label}
            className={cn("glass rounded-[28px] px-5 py-4", h.tone)}
          >
            <Count
              value={live.filter(({ t }) => h.states.includes(t.state)).length}
            />
            <p className="mt-1 text-sm font-medium">{h.label}</p>
          </div>
        ))}
        <div
          className={cn(
            "glass rounded-[28px] px-5 py-4",
            low ? "glass-orange" : "glass-gray text-gray-500",
          )}
        >
          <Count value={low} />
          <p className="mt-1 flex items-center gap-1 text-sm font-medium">
            <BatteryLow className="size-4" /> Low tokens
          </p>
        </div>
      </div>

      <ul className="grid flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 overflow-y-auto">
        <AnimatePresence mode="popLayout">
          {live.map(({ t, project }) => {
            const ratio = tokenRatio(t.tokens);
            const isLow = isRunningLow(t.tokens);
            const key = `${t.platformId}:${t.id}`;
            return (
              <motion.li
                key={key}
                layout
                initial={{ opacity: 0, scale: 0.9, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                // Handed-off and finished threads leave the board by flying
                // off to the right, so a handoff reads as the thread moving on.
                exit={{ opacity: 0, x: 160, rotate: 6, scale: 0.8 }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              >
                <button
                  onClick={() => onSelect(t)}
                  className={cn(
                    "glass flex h-full w-full flex-col gap-2 rounded-3xl p-4 text-left",
                    GLASS_TINT[t.state],
                    !reduce && TILE_MOTION[t.state],
                    selectedId === key && "ring-foreground ring-2",
                  )}
                >
                  <span className="flex items-center justify-between gap-2 text-sm font-semibold uppercase">
                    {STATE_STYLE[t.state].label}
                    {isLow && (
                      <span className="flex items-center gap-1 rounded bg-orange-600 px-1.5 py-0.5 text-xs text-white normal-case">
                        <BatteryLow className="size-3.5" /> low
                      </span>
                    )}
                  </span>
                  <span className="line-clamp-2 text-lg leading-snug font-medium">
                    {t.title}
                  </span>
                  <span className="truncate text-xs text-gray-700">
                    {project} · {byId.get(t.platformId)?.name ?? t.platformId}
                    {t.model ? ` · ${t.model}` : ""}
                  </span>
                  {ratio !== undefined && (
                    <span className="h-1.5 overflow-hidden rounded-full bg-white/50">
                      <span
                        className={cn(
                          "block h-full",
                          isLow ? "bg-orange-600" : "bg-sky-500",
                        )}
                        style={{ width: `${Math.min(100, ratio * 100)}%` }}
                      />
                    </span>
                  )}
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}
