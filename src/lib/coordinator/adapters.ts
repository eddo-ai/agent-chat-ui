import type { Message, Thread } from "@langchain/langgraph-sdk";
import { createClient } from "@/providers/client";
import { getThreadSearchMetadata } from "@/lib/thread-search";
import { getContentString } from "@/components/thread/utils";
import {
  CoordinatorFeedSchema,
  type CoordThread,
  type FeedPlatform,
  type LangGraphPlatform,
  type Platform,
  type ThreadState,
  type TranscriptMessage,
} from "./types";

const INBOX = "inbox";

/** Turn a platform into the list of threads it knows about. */
export async function listThreads(platform: Platform): Promise<CoordThread[]> {
  switch (platform.kind) {
    case "langgraph":
      return listLangGraphThreads(platform);
    case "feed":
      return listFeedThreads(platform);
    case "manual":
      // Manual platforms are handoff targets only; threads that land there
      // are tracked through the local handoff log.
      return [];
  }
}

export async function getTranscript(
  platform: Platform,
  threadId: string,
): Promise<TranscriptMessage[]> {
  if (platform.kind !== "langgraph") return [];
  const client = createClient(platform.apiUrl, platform.apiKey);
  const state = await client.threads.getState<{ messages?: Message[] }>(
    threadId,
  );
  return (state.values?.messages ?? []).map(toTranscriptMessage);
}

// --- LangGraph -------------------------------------------------------------

function mapLangGraphStatus(status: Thread["status"]): ThreadState {
  switch (status) {
    case "busy":
      return "working";
    case "interrupted":
      return "blocked";
    case "error":
      return "failed";
    default:
      return "idle";
  }
}

function toTranscriptMessage(m: Message): TranscriptMessage {
  const role =
    m.type === "human" || m.type === "ai" || m.type === "tool"
      ? m.type
      : "system";
  return { role, content: getContentString(m.content) };
}

/** Context in use is roughly the last AI turn's input plus output. */
function lastUsage(messages: Message[]): number | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.type === "ai" && m.usage_metadata) {
      return m.usage_metadata.total_tokens;
    }
  }
  return undefined;
}

export function langGraphThreadUrl(
  platform: LangGraphPlatform,
  threadId: string,
): string {
  const params = new URLSearchParams({
    apiUrl: platform.apiUrl,
    assistantId: platform.assistantId,
    threadId,
  });
  return `/?${params.toString()}`;
}

async function listLangGraphThreads(
  platform: LangGraphPlatform,
): Promise<CoordThread[]> {
  const client = createClient(platform.apiUrl, platform.apiKey);
  const threads = await client.threads.search<{ messages?: Message[] }>({
    metadata: getThreadSearchMetadata(platform.assistantId),
    limit: 100,
  });

  return threads.map((t) => {
    const messages = t.values?.messages ?? [];
    const first = messages.find((m) => m.type === "human");
    const meta = t.metadata ?? {};
    const used = lastUsage(messages);
    const handedOffTo =
      typeof meta.handed_off_to === "string" ? meta.handed_off_to : undefined;
    return {
      id: t.thread_id,
      platformId: platform.id,
      projectId:
        (typeof meta.project_id === "string" && meta.project_id) ||
        platform.defaultProject ||
        INBOX,
      title: first
        ? getContentString(first.content).slice(0, 120)
        : t.thread_id,
      state: handedOffTo ? "handed_off" : mapLangGraphStatus(t.status),
      model: (typeof meta.model === "string" && meta.model) || platform.model,
      updatedAt: t.updated_at,
      tokens:
        used !== undefined
          ? { used, limit: platform.contextWindow }
          : undefined,
      url: langGraphThreadUrl(platform, t.thread_id),
      handedOffTo,
      handedOffFrom:
        typeof meta.handoff_from === "string" ? meta.handoff_from : undefined,
    };
  });
}

/**
 * Start a new LangGraph thread seeded with the handoff prompt and run it.
 * The thread carries project and lineage metadata so it groups correctly.
 */
export async function startLangGraphHandoff(args: {
  target: LangGraphPlatform;
  projectId: string;
  prompt: string;
  fromRef: string;
  model?: string;
}): Promise<{ threadId: string; url: string }> {
  const client = createClient(args.target.apiUrl, args.target.apiKey);
  const thread = await client.threads.create({
    metadata: {
      ...getThreadSearchMetadata(args.target.assistantId),
      project_id: args.projectId,
      handoff_from: args.fromRef,
      ...(args.model ? { model: args.model } : {}),
    },
  });
  await client.runs.create(thread.thread_id, args.target.assistantId, {
    input: { messages: [{ type: "human", content: args.prompt }] },
  });
  return {
    threadId: thread.thread_id,
    url: langGraphThreadUrl(args.target, thread.thread_id),
  };
}

/** Mark the source thread so every coordinator sees it moved on. */
export async function markHandedOff(
  source: Platform,
  threadId: string,
  toRef: string,
): Promise<void> {
  if (source.kind !== "langgraph") return;
  const client = createClient(source.apiUrl, source.apiKey);
  await client.threads.update(threadId, {
    metadata: { handed_off_to: toRef },
  });
}

// --- Feeds -----------------------------------------------------------------

async function listFeedThreads(platform: FeedPlatform): Promise<CoordThread[]> {
  const res = await fetch(platform.url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${platform.name}: HTTP ${res.status}`);
  const feed = CoordinatorFeedSchema.parse(await res.json());
  return feed.projects.flatMap((p) =>
    p.threads.map((t) => ({
      ...t,
      platformId: platform.id,
      projectId: p.id,
      projectName: p.name,
      model: t.model ?? platform.model,
    })),
  );
}
