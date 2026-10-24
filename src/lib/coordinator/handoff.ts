import type {
  CoordThread,
  HandoffBundle,
  Platform,
  Project,
  TokenUsage,
  TranscriptMessage,
} from "./types";

/** Share of the context window after which a thread is flagged for handoff. */
export const LOW_TOKEN_THRESHOLD = 0.8;

/** Rough chars-per-token used to budget transcripts without a tokenizer. */
const CHARS_PER_TOKEN = 4;

export function tokenRatio(tokens?: TokenUsage): number | undefined {
  if (!tokens?.limit) return undefined;
  return tokens.used / tokens.limit;
}

export function isRunningLow(tokens?: TokenUsage): boolean {
  const ratio = tokenRatio(tokens);
  return ratio !== undefined && ratio >= LOW_TOKEN_THRESHOLD;
}

/**
 * Keep the newest messages that fit in `budgetTokens`, oldest first.
 * The first human message is always kept, since it usually states the goal.
 */
export function trimTranscript(
  messages: TranscriptMessage[],
  budgetTokens: number,
): { kept: TranscriptMessage[]; omitted: number } {
  const budget = budgetTokens * CHARS_PER_TOKEN;
  const firstHuman = messages.findIndex((m) => m.role === "human");
  let used = firstHuman >= 0 ? messages[firstHuman].content.length : 0;
  const tail: TranscriptMessage[] = [];

  for (let i = messages.length - 1; i > firstHuman; i--) {
    const len = messages[i].content.length;
    if (used + len > budget) break;
    used += len;
    tail.unshift(messages[i]);
  }

  const kept = firstHuman >= 0 ? [messages[firstHuman], ...tail] : tail;
  return { kept, omitted: messages.length - kept.length };
}

export function buildHandoffBundle(args: {
  thread: CoordThread;
  project: Project;
  source: Platform;
  target: Platform;
  targetModel?: string;
  transcript: TranscriptMessage[];
  brief: string;
  reason: string;
  budgetTokens?: number;
}): HandoffBundle {
  const { kept, omitted } = trimTranscript(
    args.transcript,
    args.budgetTokens ?? 12_000,
  );
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    reason: args.reason,
    project: { id: args.project.id, name: args.project.name },
    source: {
      platform: args.source.name,
      host: args.source.host,
      threadId: args.thread.id,
      title: args.thread.title,
      model: args.thread.model ?? args.source.model,
      url: args.thread.url,
      tokens: args.thread.tokens,
    },
    target: {
      platform: args.target.name,
      model: args.targetModel || args.target.model,
    },
    brief: args.brief.trim(),
    recent: kept,
    omittedMessages: omitted,
  };
}

const ROLE_LABEL: Record<TranscriptMessage["role"], string> = {
  human: "User",
  ai: "Agent",
  tool: "Tool",
  system: "System",
};

/**
 * Render a bundle as a prompt any agent can take as its first message,
 * with the JSON bundle appended so a coordinator-aware agent can parse it.
 */
export function renderHandoffPrompt(bundle: HandoffBundle): string {
  const s = bundle.source;
  const lines = [
    `# Handoff: ${s.title}`,
    "",
    `You are picking up a thread that was running on **${s.platform}**` +
      (s.model ? ` (${s.model})` : "") +
      ` for the project **${bundle.project.name}**.` +
      ` Reason for handoff: ${bundle.reason}.`,
    "Continue the work from where it stopped. Do not redo finished steps. " +
      "If something below is unclear, ask before acting.",
  ];
  if (s.url) lines.push("", `Original thread: ${s.url}`);
  if (bundle.brief) lines.push("", "## Brief", "", bundle.brief);

  lines.push("", "## Recent conversation", "");
  if (bundle.omittedMessages > 0) {
    lines.push(
      `_${bundle.omittedMessages} earlier messages omitted to fit the context budget._`,
      "",
    );
  }
  for (const m of bundle.recent) {
    lines.push(`**${ROLE_LABEL[m.role]}:** ${m.content}`, "");
  }

  lines.push(
    "<details><summary>Handoff bundle (JSON)</summary>",
    "",
    "```json",
    JSON.stringify({ ...bundle, recent: undefined }, null, 2),
    "```",
    "</details>",
  );
  return lines.join("\n");
}

/** Fill a manual platform's launch URL template. */
export function fillLaunchUrl(template: string, prompt: string): string {
  return template.replace("{prompt}", encodeURIComponent(prompt));
}
