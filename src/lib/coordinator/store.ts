"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { listThreads } from "./adapters";
import type {
  CoordThread,
  HandoffRecord,
  Platform,
  Project,
  ThreadState,
} from "./types";

const PLATFORMS_KEY = "coord:platforms";
const HANDOFFS_KEY = "coord:handoffs";

/**
 * Manual targets every user gets, so handoff works with nothing configured
 * and with no Mac: each one runs in a browser or any terminal.
 */
export const DEFAULT_PLATFORMS: Platform[] = [
  {
    id: "claude-web",
    kind: "manual",
    name: "Claude (web/mobile)",
    host: "cloud",
    launchUrl: "https://claude.ai/new?q={prompt}",
  },
  {
    id: "claude-code",
    kind: "manual",
    name: "Claude Code (any terminal)",
    host: "linux",
    cliCommand: 'claude "$(cat {file})"',
  },
  {
    id: "chatgpt",
    kind: "manual",
    name: "ChatGPT / Codex",
    host: "cloud",
    launchUrl: "https://chatgpt.com/?q={prompt}",
  },
];

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private mode); the session still works.
  }
}

/** Seed a LangGraph platform from the chat's own URL params or env, if set. */
function seedPlatforms(): Platform[] {
  const params = new URLSearchParams(window.location.search);
  const apiUrl = params.get("apiUrl") || process.env.NEXT_PUBLIC_API_URL;
  const assistantId =
    params.get("assistantId") || process.env.NEXT_PUBLIC_ASSISTANT_ID;
  const seeded: Platform[] = [];
  if (apiUrl && assistantId) {
    seeded.push({
      id: "langgraph-default",
      kind: "langgraph",
      name: "LangGraph",
      host: "cloud",
      apiUrl,
      assistantId,
      apiKey: window.localStorage.getItem("lg:chat:apiKey") ?? undefined,
    });
  }
  return [...seeded, ...DEFAULT_PLATFORMS];
}

export function usePlatforms() {
  const [platforms, setPlatforms] = useState<Platform[]>([]);

  useEffect(() => {
    setPlatforms(
      read<Platform[] | null>(PLATFORMS_KEY, null) ?? seedPlatforms(),
    );
  }, []);

  const save = useCallback((next: Platform[]) => {
    setPlatforms(next);
    write(PLATFORMS_KEY, next);
  }, []);

  return { platforms, save };
}

export function useHandoffLog() {
  const [log, setLog] = useState<HandoffRecord[]>([]);
  useEffect(() => setLog(read(HANDOFFS_KEY, [])), []);
  const add = useCallback((record: HandoffRecord) => {
    setLog((prev) => {
      const next = [record, ...prev].slice(0, 200);
      write(HANDOFFS_KEY, next);
      return next;
    });
  }, []);
  return { log, add };
}

/** Order used to sort threads: what needs the user first. */
const STATE_ORDER: Record<ThreadState, number> = {
  blocked: 0,
  review_ready: 1,
  failed: 2,
  working: 3,
  idle: 4,
  handed_off: 5,
  done: 6,
};

export function groupByProject(threads: CoordThread[]): Project[] {
  const byId = new Map<string, Project>();
  for (const t of threads) {
    const project = byId.get(t.projectId) ?? {
      id: t.projectId,
      name: t.projectName ?? t.projectId,
      threads: [],
    };
    if (t.projectName) project.name = t.projectName;
    project.threads.push(t);
    byId.set(t.projectId, project);
  }
  const projects = [...byId.values()];
  for (const p of projects) {
    p.threads.sort(
      (a, b) =>
        STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
        b.updatedAt.localeCompare(a.updatedAt),
    );
  }
  return projects.sort((a, b) => a.name.localeCompare(b.name));
}

/** Poll every readable platform and merge the results. */
export function useOverview(
  platforms: Platform[],
  handoffs: HandoffRecord[],
  intervalMs = 15_000,
) {
  const [threads, setThreads] = useState<CoordThread[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled(platforms.map(listThreads));
    const nextErrors: Record<string, string> = {};
    const all: CoordThread[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") all.push(...r.value);
      else nextErrors[platforms[i].id] = String(r.reason?.message ?? r.reason);
    });
    setThreads(all);
    setErrors(nextErrors);
    setLoading(false);
  }, [platforms]);

  useEffect(() => {
    if (platforms.length === 0) return;
    refresh();
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [platforms, refresh, intervalMs]);

  // Apply the local handoff log, so threads handed to platforms we cannot
  // write to (feeds, manual targets) still show as handed off.
  const merged = useMemo(() => {
    const handedOff = new Map(handoffs.map((h) => [h.fromThread, h]));
    return threads.map((t) => {
      const h = handedOff.get(t.id);
      return h && !t.handedOffTo
        ? { ...t, state: "handed_off" as const, handedOffTo: h.toPlatform }
        : t;
    });
  }, [threads, handoffs]);

  const projects = useMemo(() => groupByProject(merged), [merged]);
  return { projects, threads: merged, errors, loading, refresh };
}
