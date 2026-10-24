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
    parseAsStringLiteral(CONCEPTS).withDefault("projects"),
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
      <div
        className="ios flex h-full items-center justify-center p-8 text-center text-[15px]"
        style={{ color: "var(--ios-secondary)" }}
      >
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
      <div className="ios pb-8">
        <h2 className="ios-section-header">Display</h2>
        <div className="ios-group">
          <div className="ios-row flex-col items-stretch gap-2">
            Status board
            <div
              role="radiogroup"
              aria-label="Status board"
              className="ios-segmented"
            >
              {CONCEPTS.map((c) => (
                <button
                  key={c}
                  role="radio"
                  aria-checked={concept === c}
                  onClick={() => setConcept(c)}
                >
                  {CONCEPT_LABEL[c]}
                </button>
              ))}
            </div>
          </div>
          <label className="ios-row">
            Layout
            <select
              className="ios-select ml-auto"
              value={postureParam ?? ""}
              onChange={(e) =>
                setPostureParam(
                  (e.target.value || null) as (typeof POSTURES)[number] | null,
                )
              }
            >
              <option value="">Automatic ({posture})</option>
              {POSTURES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="ios-group-footer">
          The status board shows on the upright screen when the device is folded
          like a laptop.
        </p>
      </div>
    </>
  );

  return (
    <div className="ios">
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
    </div>
  );
}

export default function Page(): React.ReactNode {
  return (
    <React.Suspense fallback={<div>Loading...</div>}>
      <CoordinatorPage />
    </React.Suspense>
  );
}
