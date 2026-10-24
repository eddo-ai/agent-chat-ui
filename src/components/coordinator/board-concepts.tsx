"use client";

import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from "framer-motion";
import { BatteryLow } from "lucide-react";
import { cn } from "@/lib/utils";
import { isRunningLow, tokenRatio } from "@/lib/coordinator/handoff";
import {
  BoardProps,
  Count,
  GLASS_TINT,
  GlanceBoard,
  HEADLINE,
  TILE_MOTION,
  liveThreads,
  rank,
} from "./glance-board";

/**
 * Alternative status boards for the laptop posture's upright screen. Each
 * answers "what needs me, what's running, what's about to run out" from
 * across a desk, with a different feel.
 */
export const CONCEPTS = ["tiles", "lanes", "bubbles", "headline"] as const;
export type Concept = (typeof CONCEPTS)[number];

export const CONCEPT_LABEL: Record<Concept, string> = {
  tiles: "Tiles",
  lanes: "Lanes",
  bubbles: "Bubbles",
  headline: "Headline",
};

const keyOf = (t: { platformId: string; id: string }) =>
  `${t.platformId}:${t.id}`;

function LowBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-orange-600 px-1.5 py-0.5 text-xs font-medium text-white">
      <BatteryLow className="size-3.5" /> low
    </span>
  );
}

/**
 * Lanes: one column per kind of attention. When a thread changes state its
 * card glides into the new lane, so movement itself is the signal.
 */
function LanesBoard({ projects, selectedId, onSelect }: BoardProps) {
  const reduce = useReducedMotion();
  const live = liveThreads(projects);
  return (
    <LayoutGroup>
      <div className="grid h-full grid-cols-3 gap-3 p-4 text-gray-900">
        {HEADLINE.map((lane) => {
          const cards = live.filter(({ t }) => lane.states.includes(t.state));
          return (
            <section
              key={lane.label}
              className="glass flex min-h-0 flex-col rounded-[32px]"
            >
              <header className="flex items-center gap-3 p-3">
                <span
                  className={cn(
                    "glass flex size-14 items-center justify-center rounded-full",
                    lane.tone,
                  )}
                >
                  <Count value={cards.length} />
                </span>
                <h3 className="text-xl font-semibold">{lane.label}</h3>
              </header>
              <ul className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3">
                <AnimatePresence mode="popLayout">
                  {cards.map(({ t, project }) => (
                    <motion.li
                      key={keyOf(t)}
                      layoutId={keyOf(t)}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: 120, rotate: 4 }}
                      transition={{
                        type: "spring",
                        stiffness: 320,
                        damping: 28,
                      }}
                    >
                      <button
                        onClick={() => onSelect(t)}
                        className={cn(
                          "glass flex w-full flex-col gap-1 rounded-3xl p-3 text-left",
                          GLASS_TINT[t.state],
                          !reduce && TILE_MOTION[t.state],
                          selectedId === keyOf(t) && "ring-foreground ring-2",
                        )}
                      >
                        <span className="line-clamp-2 text-lg leading-snug font-medium">
                          {t.title}
                        </span>
                        <span className="flex items-center gap-2 text-xs text-gray-700">
                          <span className="truncate">{project}</span>
                          {isRunningLow(t.tokens) && <LowBadge />}
                        </span>
                      </button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </section>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

/**
 * Bubbles: every live thread floats as a bubble. Colour is its state, size
 * is how much of its context it has used, and a dashed orange ring means
 * it's running low. Threads that need you bob more insistently.
 */
function BubblesBoard({ projects, selectedId, onSelect }: BoardProps) {
  const reduce = useReducedMotion();
  const live = liveThreads(projects);
  return (
    <div className="flex h-full flex-wrap content-center items-center justify-center gap-5 overflow-hidden p-6">
      <AnimatePresence mode="popLayout">
        {live.map(({ t }, i) => {
          const size = 110 + Math.min(1, tokenRatio(t.tokens) ?? 0.3) * 110;
          const needsYou = rank(t.state) === 0;
          return (
            <motion.button
              key={keyOf(t)}
              layout
              onClick={() => onSelect(t)}
              initial={{ scale: 0, opacity: 0 }}
              animate={
                reduce
                  ? { scale: 1, opacity: 1 }
                  : {
                      scale: 1,
                      opacity: 1,
                      y: needsYou ? [0, -14, 0] : [0, -5, 0],
                    }
              }
              exit={{ scale: 0, opacity: 0, y: -80 }}
              transition={{
                scale: { type: "spring", stiffness: 300, damping: 18 },
                y: {
                  duration: needsYou ? 1.4 : 3.2,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: (i % 5) * 0.3,
                },
              }}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.95 }}
              style={{ width: size, height: size }}
              className={cn(
                "glass flex shrink-0 items-center justify-center rounded-full p-5 text-center text-gray-900",
                GLASS_TINT[t.state],
                isRunningLow(t.tokens) &&
                  "outline-4 outline-offset-4 outline-orange-600 outline-dashed",
                selectedId === keyOf(t) && "ring-foreground ring-4",
              )}
            >
              <span className="line-clamp-3 text-sm leading-tight font-semibold">
                {t.title}
              </span>
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/**
 * Headline: one sentence big enough to read from across the room, the
 * names behind it, and a backdrop whose colour is the mood of the board.
 */
function HeadlineBoard({ projects, selectedId, onSelect }: BoardProps) {
  const live = liveThreads(projects);
  const needs = live.filter(({ t }) => rank(t.state) === 0);
  const working = live.filter(({ t }) => t.state === "working");
  const idle = live.filter(({ t }) => t.state === "idle");
  const low = live.filter(({ t }) => isRunningLow(t.tokens));

  const headline =
    needs.length > 0
      ? `${needs.length} ${needs.length === 1 ? "thread needs" : "threads need"} you`
      : working.length > 0
        ? `${working.length} ${working.length === 1 ? "agent is" : "agents are"} working`
        : "All clear";
  const featured = needs.length > 0 ? needs : working;

  return (
    <div className="flex h-full flex-col justify-center gap-6 p-10 text-gray-900">
      <AnimatePresence mode="wait">
        <motion.h2
          key={headline}
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -30, opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
          className="text-6xl leading-none font-bold tracking-tight"
        >
          {headline}
        </motion.h2>
      </AnimatePresence>
      <ul className="glass flex flex-col gap-2 self-start rounded-[36px] px-8 py-6">
        <AnimatePresence mode="popLayout">
          {featured.map(({ t, project }) => (
            <motion.li
              key={keyOf(t)}
              layout
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 80, opacity: 0 }}
            >
              <button
                onClick={() => onSelect(t)}
                className={cn(
                  "flex items-baseline gap-3 text-left text-3xl font-medium underline-offset-8 hover:underline",
                  selectedId === keyOf(t) && "underline",
                )}
              >
                {t.title}
                <span className="text-base font-normal text-gray-600">
                  {project}
                </span>
                {isRunningLow(t.tokens) && <LowBadge />}
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <p className="text-xl text-gray-700">
        {[
          needs.length > 0 && `${working.length} working`,
          `${idle.length} idle`,
          low.length > 0 && `${low.length} low on tokens`,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </div>
  );
}

/** Backdrop colours by mood: needs you, busy, or all clear. */
const MOOD_BLOBS = {
  needs: ["#fbbf24", "#fb7185", "#f97316", "#a78bfa"],
  busy: ["#38bdf8", "#818cf8", "#2dd4bf", "#c084fc"],
  clear: ["#34d399", "#a3e635", "#22d3ee", "#fde68a"],
} as const;

const BLOB_PLACES = [
  "-left-[10%] -top-[20%] h-[70%] w-[55%]",
  "right-[-15%] top-[10%] h-[65%] w-[50%]",
  "left-[20%] bottom-[-25%] h-[60%] w-[60%]",
  "right-[15%] bottom-[5%] h-[35%] w-[30%]",
];

/**
 * The living colour field the glass floats over. It drifts slowly and
 * shifts hue with the mood of the board, so the whole screen reads as
 * amber when something needs you before any text is legible.
 */
function GlassBackdrop({ mood }: { mood: keyof typeof MOOD_BLOBS }) {
  return (
    <div
      aria-hidden
      className="absolute inset-0 -z-10 overflow-hidden bg-white"
    >
      {MOOD_BLOBS[mood].map((color, i) => (
        <div
          key={i}
          className={cn("glass-blob", BLOB_PLACES[i])}
          style={{ backgroundColor: color, animationDelay: `${i * -4}s` }}
        />
      ))}
    </div>
  );
}

export function StatusBoard({
  concept,
  ...props
}: BoardProps & { concept: Concept }) {
  const live = liveThreads(props.projects);
  const mood = live.some(({ t }) => rank(t.state) === 0)
    ? "needs"
    : live.some(({ t }) => t.state === "working")
      ? "busy"
      : "clear";
  return (
    <div className="relative isolate h-full overflow-hidden">
      <GlassBackdrop mood={mood} />
      <AnimatePresence mode="wait">
        <motion.div
          key={concept}
          className="h-full"
          initial={{ opacity: 0, scale: 0.97, filter: "blur(8px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, scale: 1.02, filter: "blur(8px)" }}
          transition={{ duration: 0.35 }}
        >
          {concept === "lanes" ? (
            <LanesBoard {...props} />
          ) : concept === "bubbles" ? (
            <BubblesBoard {...props} />
          ) : concept === "headline" ? (
            <HeadlineBoard {...props} />
          ) : (
            <GlanceBoard {...props} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
