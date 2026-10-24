"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, Reorder } from "framer-motion";
import {
  BatteryLow,
  Camera,
  Check,
  ImageIcon,
  Minus,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isRunningLow } from "@/lib/coordinator/handoff";
import { attentionRank, useProjectBoard } from "@/lib/coordinator/store";
import type { ProjectTask } from "@/lib/coordinator/types";
import type { BoardProps } from "./glance-board";
import { STATE_STYLE, StateIcon } from "./overview";

/** Preset lane wallpapers. "glass" lets the board's mood backdrop show through. */
export const WALLPAPERS: Record<string, { label: string; css: string }> = {
  glass: { label: "Glass", css: "transparent" },
  sunrise: {
    label: "Sunrise",
    css: "linear-gradient(165deg, #ffd27a 0%, #ff8fb1 55%, #8a6cff 100%)",
  },
  ocean: {
    label: "Ocean",
    css: "radial-gradient(120% 80% at 20% 10%, #6ee7ff 0%, transparent 60%), linear-gradient(180deg, #2e8bff 0%, #0b3d91 100%)",
  },
  aurora: {
    label: "Aurora",
    css: "radial-gradient(90% 60% at 30% 20%, #5effc1 0%, transparent 60%), radial-gradient(80% 60% at 80% 40%, #b18cff 0%, transparent 60%), linear-gradient(180deg, #10233f 0%, #050b1a 100%)",
  },
  bloom: {
    label: "Bloom",
    css: "radial-gradient(70% 50% at 70% 20%, #ffb3d9 0%, transparent 70%), radial-gradient(80% 60% at 20% 80%, #c9a7ff 0%, transparent 70%), linear-gradient(180deg, #fff0f6 0%, #f3e8ff 100%)",
  },
  meadow: {
    label: "Meadow",
    css: "radial-gradient(90% 60% at 20% 15%, #fff59d 0%, transparent 60%), linear-gradient(180deg, #b6f492 0%, #338b4a 100%)",
  },
  graphite: {
    label: "Graphite",
    css: "radial-gradient(100% 60% at 50% 0%, #4a4a4f 0%, transparent 70%), linear-gradient(180deg, #2c2c2e 0%, #111113 100%)",
  },
};

function wallpaperStyle(wallpaper?: string): React.CSSProperties {
  if (wallpaper?.startsWith("data:")) {
    return {
      backgroundImage: `url(${wallpaper})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  return { background: WALLPAPERS[wallpaper ?? "glass"]?.css ?? "transparent" };
}

/** Shrink a photo so it fits comfortably in local storage. */
function loadPhoto(file: File, maxSide = 900): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas
        .getContext("2d")
        ?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/** Press and hold anywhere on the board to start editing, like the Home Screen. */
function useLongPress(onLongPress: () => void, ms = 550) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      start.current = { x: e.clientX, y: e.clientY };
      cancel();
      timer.current = setTimeout(() => {
        navigator.vibrate?.(10);
        onLongPress();
      }, ms);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = start.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
}

const ATTENTION = [
  { label: "Needs you", color: "var(--ios-orange)" },
  { label: "Working", color: "var(--ios-blue)" },
  { label: "Quiet", color: "var(--ios-gray)" },
];

type Lane = ReturnType<typeof useProjectBoard>["lanes"][number];

function WallpaperPicker({
  value,
  onPick,
  onClose,
}: {
  value?: string;
  onPick: (wallpaper: string) => void;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <motion.div
      className="glass absolute inset-x-3 bottom-3 z-20 rounded-[28px] p-3"
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 40, opacity: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 32 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-[15px] font-semibold">Wallpaper</span>
        <button
          className="ios-tint text-[15px] font-semibold"
          onClick={onClose}
        >
          Done
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {Object.entries(WALLPAPERS).map(([id, w]) => (
          <button
            key={id}
            onClick={() => onPick(id)}
            className="flex flex-col items-center gap-1 text-[11px]"
          >
            <span
              className={cn(
                "glass block aspect-[3/4] w-full rounded-2xl",
                (value ?? "glass") === id && "ring-2 ring-[var(--ios-blue)]",
              )}
              style={wallpaperStyle(id)}
            />
            {w.label}
          </button>
        ))}
        <button
          onClick={() => fileRef.current?.click()}
          className="flex flex-col items-center gap-1 text-[11px]"
        >
          <span
            className={cn(
              "glass flex aspect-[3/4] w-full items-center justify-center rounded-2xl",
              value?.startsWith("data:") && "ring-2 ring-[var(--ios-blue)]",
            )}
            style={
              value?.startsWith("data:") ? wallpaperStyle(value) : undefined
            }
          >
            <Camera className="size-5" />
          </span>
          Photo
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) onPick(await loadPhoto(file));
        }}
      />
    </motion.div>
  );
}

function TaskList({
  tasks,
  onChange,
}: {
  tasks: ProjectTask[];
  onChange: (tasks: ProjectTask[]) => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <ul className="flex flex-col">
      <AnimatePresence initial={false}>
        {tasks.map((task) => (
          <motion.li
            key={task.id}
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2.5 py-1.5"
          >
            <button
              aria-label={task.done ? "Mark not done" : "Mark done"}
              onClick={() =>
                onChange(
                  tasks.map((t) =>
                    t.id === task.id ? { ...t, done: !t.done } : t,
                  ),
                )
              }
              className="flex size-[22px] shrink-0 items-center justify-center rounded-full border-2"
              style={{
                borderColor: task.done
                  ? "var(--ios-blue)"
                  : "var(--ios-tertiary)",
                background: task.done ? "var(--ios-blue)" : "transparent",
              }}
            >
              {task.done && (
                <Check
                  className="size-3.5 text-white"
                  strokeWidth={3}
                />
              )}
            </button>
            <span
              className={cn(
                "text-[15px]",
                task.done && "line-through opacity-50",
              )}
            >
              {task.text}
            </span>
          </motion.li>
        ))}
      </AnimatePresence>
      <li className="flex items-center gap-2.5 py-1.5">
        <Plus
          className="size-[22px] shrink-0"
          style={{ color: "var(--ios-tertiary)" }}
        />
        <input
          className="ios-input min-w-0 flex-1 text-[15px]"
          placeholder="Add a task"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              onChange([
                ...tasks,
                {
                  id: Date.now().toString(36),
                  text: draft.trim(),
                  done: false,
                },
              ]);
              setDraft("");
            }
          }}
        />
      </li>
    </ul>
  );
}

function ProjectLane({
  lane,
  index,
  editing,
  selectedId,
  onSelect,
  onPatch,
  onHide,
  autoFocusName,
}: {
  lane: Lane;
  index: number;
  editing: boolean;
  selectedId?: string;
  onSelect: BoardProps["onSelect"];
  onPatch: ReturnType<typeof useProjectBoard>["patchProject"];
  onHide: () => void;
  autoFocusName: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const rank = attentionRank(lane);
  const attention = ATTENTION[rank];
  const live = lane.threads.filter(
    (t) => t.state !== "done" && t.state !== "handed_off",
  );
  const needCount = live.filter(
    (t) =>
      t.state === "blocked" ||
      t.state === "review_ready" ||
      t.state === "failed",
  ).length;
  const openTasks = lane.tasks.filter((t) => !t.done).length;

  useEffect(() => {
    if (!editing) setPicking(false);
  }, [editing]);

  return (
    <Reorder.Item
      as="div"
      value={lane.id}
      dragListener={editing}
      className={cn(
        "relative h-full w-[340px] shrink-0 snap-start",
        editing && (index % 2 ? "lane-jiggle-b" : "lane-jiggle-a"),
      )}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      whileDrag={{ scale: 1.04, zIndex: 30 }}
    >
      <div
        className={cn(
          "glass relative flex h-full flex-col gap-3 overflow-hidden rounded-[40px] p-3",
          rank === 0 && !editing && "glance-breathe",
        )}
        style={wallpaperStyle(lane.wallpaper)}
      >
        <header className="glass flex flex-col gap-1 rounded-[28px] px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            {editing ? (
              <input
                className="ios-input min-w-0 flex-1 text-[22px] font-bold"
                defaultValue={lane.name}
                autoFocus={autoFocusName}
                onPointerDown={(e) => e.stopPropagation()}
                onBlur={(e) =>
                  onPatch(lane.id, { name: e.target.value.trim() })
                }
              />
            ) : (
              <h3 className="ios-title2 truncate">{lane.name}</h3>
            )}
            <span
              className="shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold text-white"
              style={{ background: attention.color }}
            >
              {rank === 0 ? `${needCount} ${attention.label}` : attention.label}
            </span>
          </div>
          {editing ? (
            <textarea
              rows={2}
              className="ios-input resize-none text-[15px]"
              placeholder="What's the goal?"
              defaultValue={lane.goal}
              onPointerDown={(e) => e.stopPropagation()}
              onBlur={(e) => onPatch(lane.id, { goal: e.target.value.trim() })}
            />
          ) : (
            <p
              className="line-clamp-3 text-[15px] leading-5"
              style={{ color: "var(--ios-secondary)" }}
            >
              {lane.goal || "No goal yet. Press and hold to add one."}
            </p>
          )}
        </header>

        <section className="glass flex min-h-0 flex-col rounded-[28px] px-2 py-2">
          <h4 className="ios-footnote px-2 pb-1 uppercase">
            Threads · {live.length}
          </h4>
          <ul className="flex min-h-0 flex-col overflow-y-auto">
            {live.length === 0 && (
              <li className="ios-footnote px-2 py-1">No agent threads yet</li>
            )}
            {live.map((t) => {
              const key = `${t.platformId}:${t.id}`;
              return (
                <motion.li
                  key={key}
                  layout
                >
                  <button
                    onClick={() => !editing && onSelect(t)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-2xl px-2 py-2 text-left",
                      selectedId === key && "bg-white/50",
                    )}
                  >
                    <StateIcon
                      state={t.state}
                      className="size-7"
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[15px] font-medium">
                        {t.title}
                      </span>
                      <span
                        className="text-[12px]"
                        style={{ color: STATE_STYLE[t.state].color }}
                      >
                        {STATE_STYLE[t.state].label}
                      </span>
                    </span>
                    {isRunningLow(t.tokens) && (
                      <BatteryLow
                        className="size-4 shrink-0"
                        style={{ color: "var(--ios-red)" }}
                        aria-label="Low on tokens"
                      />
                    )}
                  </button>
                </motion.li>
              );
            })}
          </ul>
        </section>

        <section className="glass flex min-h-0 flex-1 flex-col overflow-y-auto rounded-[28px] px-4 py-2">
          <h4 className="ios-footnote pb-1 uppercase">Tasks · {openTasks}</h4>
          <TaskList
            tasks={lane.tasks}
            onChange={(tasks) => onPatch(lane.id, { tasks })}
          />
        </section>

        {editing && (
          <button
            className="glass flex items-center justify-center gap-2 rounded-full py-2.5 text-[15px] font-semibold"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setPicking(true)}
          >
            <ImageIcon className="size-4" /> Wallpaper
          </button>
        )}

        <AnimatePresence>
          {picking && (
            <WallpaperPicker
              value={lane.wallpaper}
              onPick={(wallpaper) => onPatch(lane.id, { wallpaper })}
              onClose={() => setPicking(false)}
            />
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {editing && (
          <motion.button
            aria-label={`Remove ${lane.name} from the board`}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onHide}
            className="absolute -top-2 -left-2 z-10 flex size-8 items-center justify-center rounded-full text-white shadow-md"
            style={{ background: "var(--ios-gray)" }}
          >
            <Minus
              className="size-4"
              strokeWidth={3}
            />
          </motion.button>
        )}
      </AnimatePresence>
    </Reorder.Item>
  );
}

/**
 * Project lanes: one tall glass lane per project with its goal, agent
 * threads and to-dos, scrolling left to right. Lanes that need you glide to
 * the front on their own. The last slot adds a project, like the wallpaper
 * gallery on iPhone, and pressing and holding anywhere edits the collection.
 */
export function ProjectLanesBoard({
  projects,
  selectedId,
  onSelect,
}: BoardProps) {
  const board = useProjectBoard(projects);
  const [editing, setEditing] = useState(false);
  const [newId, setNewId] = useState<string | null>(null);
  const longPress = useLongPress(() => setEditing(true));
  const lanes = editing ? board.manualLanes : board.lanes;

  // When the order changes on its own (a lane now needs you), bring the
  // front of the board back into view so the most urgent lane is visible.
  const scroller = useRef<HTMLDivElement>(null);
  const orderKey = board.lanes.map((l) => l.id).join("|");
  useEffect(() => {
    if (!editing) scroller.current?.scrollTo({ left: 0, behavior: "smooth" });
  }, [orderKey, editing]);

  return (
    <div
      className="relative h-full text-gray-900 select-none"
      {...(editing ? {} : longPress)}
    >
      <AnimatePresence>
        {editing && (
          <motion.div
            className="absolute top-3 right-4 z-40 flex gap-2"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            {board.hiddenCount > 0 && (
              <button
                className="glass rounded-full px-4 py-1.5 text-[15px] font-semibold"
                onClick={board.showAll}
              >
                Show hidden ({board.hiddenCount})
              </button>
            )}
            <button
              className="rounded-full px-4 py-1.5 text-[15px] font-semibold text-white"
              style={{ background: "var(--ios-blue)" }}
              onClick={() => {
                setEditing(false);
                setNewId(null);
              }}
            >
              Done
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <Reorder.Group
        as="div"
        axis="x"
        values={lanes.map((l) => l.id)}
        onReorder={board.setOrder}
        ref={scroller}
        className="flex h-full snap-x snap-mandatory scroll-px-6 gap-5 overflow-x-auto px-6 pt-14 pb-6"
      >
        {lanes.map((lane, i) => (
          <ProjectLane
            key={lane.id}
            lane={lane}
            index={i}
            editing={editing}
            selectedId={selectedId}
            onSelect={onSelect}
            onPatch={board.patchProject}
            onHide={() => board.hide(lane.id)}
            autoFocusName={lane.id === newId}
          />
        ))}

        <motion.button
          layout
          onClick={() => {
            setNewId(board.addProject("New project"));
            setEditing(true);
          }}
          className="glass flex h-full w-[220px] shrink-0 snap-start flex-col items-center justify-center gap-3 rounded-[40px] border-2 border-dashed border-white/80"
          whileTap={{ scale: 0.96 }}
        >
          <span
            className="flex size-16 items-center justify-center rounded-full text-white shadow-lg"
            style={{ background: "var(--ios-blue)" }}
          >
            <Plus
              className="size-8"
              strokeWidth={2.5}
            />
          </span>
          <span className="text-[17px] font-semibold">Add Project</span>
        </motion.button>
      </Reorder.Group>
    </div>
  );
}
