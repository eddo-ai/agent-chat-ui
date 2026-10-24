import { z } from "zod";

/**
 * The coordinator is "an agent coordinator for agent coordinators". It does
 * not run agents itself. It reads state from many platforms (LangGraph
 * deployments, Claude projects, desktop multiplexers like herdr, ...) and
 * groups their threads by project, so one overview can show everything and
 * hand a thread from one platform or model to another.
 */

/** Where a platform's agents physically run. "Without a Mac" means cloud or any other host works. */
export const HOSTS = ["cloud", "mac", "windows", "linux", "phone"] as const;
export type Host = (typeof HOSTS)[number];

/**
 * Normalised thread state across platforms. Mirrors herdr's
 * working / idle / blocked plus the lifecycle states coordinators expose.
 */
export const THREAD_STATES = [
  "working",
  "blocked",
  "review_ready",
  "idle",
  "done",
  "failed",
  "handed_off",
] as const;
export type ThreadState = (typeof THREAD_STATES)[number];

export type PlatformKind = "langgraph" | "feed" | "manual";

interface PlatformBase {
  id: string;
  name: string;
  host: Host;
  /** Model this platform runs by default, shown in the overview and used for handoff suggestions. */
  model?: string;
  /** Context window in tokens, used to warn when a thread is running low. */
  contextWindow?: number;
  /** Project that threads without a project_id land in. */
  defaultProject?: string;
}

/** A LangGraph deployment we can read and write (create threads, start runs). */
export interface LangGraphPlatform extends PlatformBase {
  kind: "langgraph";
  apiUrl: string;
  assistantId: string;
  apiKey?: string;
}

/**
 * A read-only JSON feed published by another coordinator (a Claude project,
 * a herdr server, a CI bot...). See `CoordinatorFeedSchema`.
 */
export interface FeedPlatform extends PlatformBase {
  kind: "feed";
  url: string;
}

/**
 * A platform we cannot call, only hand off to: the user pastes the handoff
 * prompt (Claude.ai, ChatGPT, Claude Code CLI, Codex...). `launchUrl` may
 * contain `{prompt}`, which is replaced with the URL-encoded prompt.
 */
export interface ManualPlatform extends PlatformBase {
  kind: "manual";
  launchUrl?: string;
  /** Shell command template, `{file}` is replaced with the handoff file name. */
  cliCommand?: string;
}

export type Platform = LangGraphPlatform | FeedPlatform | ManualPlatform;

export interface TokenUsage {
  used: number;
  limit?: number;
}

export interface TranscriptMessage {
  role: "human" | "ai" | "tool" | "system";
  content: string;
}

/** One thread on one platform, normalised. */
export interface CoordThread {
  id: string;
  platformId: string;
  projectId: string;
  /** Display name for the project, when the platform knows one. */
  projectName?: string;
  title: string;
  state: ThreadState;
  model?: string;
  updatedAt: string;
  tokens?: TokenUsage;
  /** Deep link to open the thread on its own platform. */
  url?: string;
  handedOffTo?: string;
  handedOffFrom?: string;
}

export interface Project {
  id: string;
  name: string;
  threads: CoordThread[];
}

/** Format other coordinators publish so they show up in this overview. */
export const CoordinatorFeedSchema = z.object({
  coordinator: z.object({ name: z.string() }).optional(),
  projects: z.array(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      threads: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          state: z.enum(THREAD_STATES).catch("idle"),
          model: z.string().optional(),
          updatedAt: z.string(),
          url: z.string().optional(),
          tokens: z
            .object({ used: z.number(), limit: z.number().optional() })
            .optional(),
        }),
      ),
    }),
  ),
});
export type CoordinatorFeed = z.infer<typeof CoordinatorFeedSchema>;

/** Everything a fresh agent needs to pick up a thread elsewhere. */
export interface HandoffBundle {
  version: 1;
  createdAt: string;
  reason: string;
  project: { id: string; name: string };
  source: {
    platform: string;
    host: Host;
    threadId: string;
    title: string;
    model?: string;
    url?: string;
    tokens?: TokenUsage;
  };
  target: { platform: string; model?: string };
  /** Free-text brief from the user: goal, decisions, what's next. */
  brief: string;
  /** The most recent messages, oldest first, trimmed to fit a budget. */
  recent: TranscriptMessage[];
  /** Messages that were left out to fit the budget. */
  omittedMessages: number;
}

export interface HandoffRecord {
  id: string;
  createdAt: string;
  fromThread: string;
  fromPlatform: string;
  toPlatform: string;
  toThread?: string;
  toUrl?: string;
}
