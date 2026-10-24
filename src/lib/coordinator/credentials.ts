import type { Platform } from "./types";

export const PLATFORMS_KEY = "coord:platforms";

/**
 * The API key saved on a coordinator LangGraph platform for `apiUrl`, so a
 * thread opened from the coordinator authenticates with that platform's key
 * rather than the chat's global one. Keys never go in URLs.
 */
export function getPlatformApiKey(
  apiUrl: string | null | undefined,
): string | undefined {
  if (!apiUrl || typeof window === "undefined") return undefined;
  try {
    const platforms = JSON.parse(
      window.localStorage.getItem(PLATFORMS_KEY) ?? "[]",
    ) as Platform[];
    const match = platforms.find(
      (p) => p.kind === "langgraph" && p.apiUrl === apiUrl && p.apiKey,
    );
    return match?.kind === "langgraph" ? match.apiKey : undefined;
  } catch {
    return undefined;
  }
}
