"use client";

import React, { useMemo, useState } from "react";
import { parseAsBoolean, parseAsStringLiteral, useQueryState } from "nuqs";
import { Toaster } from "@/components/ui/sonner";
import {
  DuoLayout,
  POSTURES,
  usePosture,
} from "@/components/coordinator/duo-layout";
import { Overview } from "@/components/coordinator/overview";
import {
  CONCEPTS,
  CONCEPT_LABEL,
  StatusBoard,
} from "@/components/coordinator/board-concepts";
import { ThreadDetail } from "@/components/coordinator/thread-detail";
import { PlatformSettings } from "@/components/coordinator/platform-settings";
import {
  useHandoffLog,
  useOverview,
  usePlatforms,
} from "@/lib/coordinator/store";
import type { Platform } from "@/lib/coordinator/types";

const DEMO_FEED: Platform = {
  id: "demo-feed",
  kind: "feed",
  name: "Demo coordinator",
  host: "cloud",
  url: "/coordinator-demo-feed.json",
};

function CoordinatorPage() {
  const [postureParam, setPostureParam] = useQueryState(
    "posture",
    parseAsStringLiteral(POSTURES),
  );
  const [demo] = useQueryState("demo", parseAsBoolean.withDefault(false));
  const [concept, setConcept] = useQueryState(
    "concept",
    parseAsStringLiteral(CONCEPTS).withDefault("tiles"),
  );
  const [selected, setSelected] = useQueryState("thread");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const posture = usePosture(postureParam);
  const { platforms: saved, save } = usePlatforms();
  const platforms = useMemo(
    () => (demo ? [DEMO_FEED, ...saved] : saved),
    [demo, saved],
  );
  const { log, add } = useHandoffLog();
  const { projects, threads, errors, loading, refresh } = useOverview(
    platforms,
    log,
  );

  const thread = threads.find((t) => `${t.platformId}:${t.id}` === selected);
  const project = projects.find((p) => p.id === thread?.projectId);

  const detail =
    thread && project ? (
      <ThreadDetail
        thread={thread}
        project={project}
        platforms={platforms}
        onBack={() => setSelected(null)}
        onHandedOff={(record) => {
          add(record);
          refresh();
        }}
      />
    ) : (
      <div className="text-muted-foreground flex h-full items-center justify-center p-8 text-center text-sm">
        Pick a thread to see it here and hand it off to another platform or
        model.
      </div>
    );

  const overview = (
    <>
      <Overview
        projects={projects}
        platforms={platforms}
        errors={errors}
        loading={loading}
        selectedId={selected ?? undefined}
        onSelect={(t) => setSelected(`${t.platformId}:${t.id}`)}
        onRefresh={refresh}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <label className="text-muted-foreground flex items-center gap-2 p-4 text-xs">
        Layout
        <select
          className="rounded border bg-transparent px-1 py-0.5"
          value={postureParam ?? ""}
          onChange={(e) =>
            setPostureParam(
              (e.target.value || null) as (typeof POSTURES)[number] | null,
            )
          }
        >
          <option value="">auto ({posture})</option>
          {POSTURES.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>
      <div
        role="radiogroup"
        aria-label="Status board"
        className="mx-4 mb-4 inline-flex rounded-full border p-1 text-xs"
      >
        {CONCEPTS.map((c) => (
          <button
            key={c}
            role="radio"
            aria-checked={concept === c}
            onClick={() => setConcept(c)}
            className={
              concept === c
                ? "bg-foreground text-background rounded-full px-3 py-1"
                : "text-muted-foreground rounded-full px-3 py-1"
            }
          >
            {CONCEPT_LABEL[c]}
          </button>
        ))}
      </div>
    </>
  );

  return (
    <>
      <Toaster />
      <DuoLayout
        posture={posture}
        secondaryOpen={!!thread}
        primary={
          posture === "laptop" ? (
            <StatusBoard
              concept={concept}
              projects={projects}
              platforms={platforms}
              selectedId={selected ?? undefined}
              onSelect={(t) => setSelected(`${t.platformId}:${t.id}`)}
            />
          ) : (
            overview
          )
        }
        secondary={posture === "laptop" && !thread ? overview : detail}
      />
      <PlatformSettings
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        platforms={saved}
        onSave={save}
      />
    </>
  );
}

export default function Page(): React.ReactNode {
  return (
    <React.Suspense fallback={<div>Loading...</div>}>
      <CoordinatorPage />
    </React.Suspense>
  );
}
