# Coordinator

`/coordinator` is an agent coordinator for agent coordinators. It does not run
agents. It reads thread state from every platform you use, groups threads by
project, and lets you hand a thread to another platform or model, for example
when one is running low on tokens or another model suits the task better.

Everything runs in the browser and stores its settings in `localStorage`, so it
works the same on a phone, Windows, Linux, a dual-screen device or a Mac.

## Pieces

| Piece    | File                                                           | Role                                                                         |
| -------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Types    | `src/lib/coordinator/types.ts`                                 | Platforms, normalised threads, the feed schema and the handoff bundle.       |
| Adapters | `src/lib/coordinator/adapters.ts`                              | Read threads and transcripts from each platform kind, start handoffs.        |
| Handoff  | `src/lib/coordinator/handoff.ts`                               | Build a bundle, trim the transcript to a budget, render the prompt.          |
| Store    | `src/lib/coordinator/store.ts`                                 | Platform registry, handoff log, polling and grouping by project.             |
| UI       | `src/components/coordinator/*`, `src/app/coordinator/page.tsx` | Overview, thread detail with handoff, platform settings, dual-screen layout. |

## Platform kinds

- **langgraph**: a LangGraph deployment. Read and write. Threads are grouped by
  their `project_id` metadata. A handoff creates a new thread with
  `project_id` and `handoff_from` metadata, runs it with the handoff prompt,
  and marks the source thread with `handed_off_to`.
- **feed**: a read-only JSON feed published by another coordinator (a Claude
  project, a herdr server, a CI bot). This is how coordinators nest: the
  overview's download button exports the same format, so a higher-level
  coordinator can read this one.
- **manual**: somewhere you paste into: Claude.ai, ChatGPT, Claude Code or
  Codex in any terminal. Handoff copies the prompt, then opens the launch URL
  or saves a `.md` file for the CLI command. Claude web, Claude Code and
  ChatGPT/Codex are set up by default.

### Feed format

```json
{
  "coordinator": { "name": "My Claude project" },
  "projects": [
    {
      "id": "agent-sidekick",
      "name": "Agent Sidekick",
      "threads": [
        {
          "id": "abc",
          "title": "Fix Safari export button",
          "state": "working",
          "model": "claude-sonnet",
          "updatedAt": "2026-10-24T04:30:00Z",
          "url": "https://...",
          "tokens": { "used": 172000, "limit": 200000 }
        }
      ]
    }
  ]
}
```

`state` is one of `working`, `blocked`, `review_ready`, `idle`, `done`,
`failed`, `handed_off` (herdr's working/idle/blocked plus lifecycle states).
See `public/coordinator-demo-feed.json`, which `/coordinator?demo=true` loads.

## Handoff

A handoff bundle carries the project, source platform, model and token use,
the user's brief, and the most recent messages trimmed to about 12k tokens
(the first user message is always kept, since it usually states the goal).
It is rendered as a Markdown prompt any agent can take as its first message,
with the bundle as JSON at the end for agents that understand it.

A thread is flagged "low on tokens" at 80% of its platform's context window,
and the suggested target is then one with a larger window.

## Dual-screen postures

The layout is designed around dual-screen devices first:

| Posture     | When                                                  | Layout                                                                                         |
| ----------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `single`    | Phone, or a duo folded to one screen                  | Overview, then detail with a back button                                                       |
| `wide`      | Laptop, tablet landscape                              | Overview and detail side by side                                                               |
| `spanned-h` | Spanned side by side (book)                           | Overview on the left screen, detail on the right, hinge kept clear                             |
| `spanned-v` | Spanned flat, top and bottom                          | Overview on top, handoff composer on the bottom screen                                         |
| `laptop`    | Folded like a laptop: top screen upright, bottom flat | Status board readable at a glance on top; list, handoff and controls on the flat bottom screen |

Postures are detected with the `horizontal-viewport-segments`,
`vertical-viewport-segments` and `device-posture: folded` media queries, and panes are sized with the
`viewport-segment-*` env() values. `?posture=` or the Layout picker previews a
posture on ordinary hardware.

## Motion

The UI should feel fun and fluid: postures morph into each other (animated
grid tracks), the status board's counters pop when they change, working
threads shimmer and threads that need you breathe, tiles reflow with spring
layout animations, and a handed-off thread flies off the board as the send
icon launches. All of it is turned off under `prefers-reduced-motion`.

## Look and feel

The coordinator uses iOS design language: the system font stack (SF on Apple
devices), large-title navigation bars, inset grouped lists, iOS system
colours, capsule buttons and segmented controls, with dark mode following the
device. The status boards use Liquid Glass panes over a slowly drifting colour
field whose hue follows the mood of the board (amber when something needs
you, blue when agents are busy, green when all is clear).

## Status board concepts

Four boards for the laptop posture's upright screen, picked from the Display
section on the flat screen or with `?concept=`:

| Concept    | Idea                                                                      |
| ---------- | ------------------------------------------------------------------------- |
| `tiles`    | Counters plus one glass tile per live thread                              |
| `lanes`    | Needs you / Working / Idle columns; cards glide between lanes on change   |
| `bubbles`  | A floating bubble per thread; size is context used, needs-you bubbles bob |
| `headline` | One sentence readable across a room ("2 threads need you") and the names  |
