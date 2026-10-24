"use client";

import { ReactNode, useEffect, useState } from "react";

/**
 * Dual-screen postures, the coordinator's main layout target.
 *
 * - single:    one narrow screen (phone, or a duo folded to one side).
 *              Overview and detail take turns, with a back button.
 * - wide:      one large screen (laptop, tablet landscape). Side by side.
 * - spanned-h: app spans two screens side by side (duo held like a book).
 *              Overview on the left screen, detail on the right, with the
 *              hinge kept clear.
 * - spanned-v: app spans two screens top and bottom (duo held like a
 *              laptop). Overview on top, detail and handoff composer on the
 *              bottom screen, where the keyboard is.
 */
export const POSTURES = ["single", "wide", "spanned-h", "spanned-v"] as const;
export type Posture = (typeof POSTURES)[number];

const SPANNED_H = "(horizontal-viewport-segments: 2)";
const SPANNED_V = "(vertical-viewport-segments: 2)";
const WIDE =
  "(min-width: 1024px), (orientation: landscape) and (min-width: 720px)";

function detectPosture(): Posture {
  if (typeof window === "undefined") return "single";
  if (window.matchMedia(SPANNED_H).matches) return "spanned-h";
  if (window.matchMedia(SPANNED_V).matches) return "spanned-v";
  if (window.matchMedia(WIDE).matches) return "wide";
  return "single";
}

/**
 * Track the device posture. `override` lets anyone preview a posture
 * without dual-screen hardware (the `?posture=` param on the page).
 */
export function usePosture(override?: Posture | null): Posture {
  const [posture, setPosture] = useState<Posture>("single");

  useEffect(() => {
    if (override) {
      setPosture(override);
      return;
    }
    const update = () => setPosture(detectPosture());
    update();
    const queries = [SPANNED_H, SPANNED_V, WIDE].map((q) =>
      window.matchMedia(q),
    );
    queries.forEach((q) => q.addEventListener("change", update));
    window.addEventListener("resize", update);
    return () => {
      queries.forEach((q) => q.removeEventListener("change", update));
      window.removeEventListener("resize", update);
    };
  }, [override]);

  return posture;
}

export function DuoLayout({
  posture,
  primary,
  secondary,
  secondaryOpen,
}: {
  posture: Posture;
  primary: ReactNode;
  secondary: ReactNode;
  /** In the single posture only one pane shows; this picks the detail pane. */
  secondaryOpen: boolean;
}) {
  return (
    <div
      className="duo"
      data-posture={posture}
      data-secondary-open={secondaryOpen}
    >
      <section
        className="duo-pane duo-primary"
        aria-label="Overview"
      >
        {primary}
      </section>
      <div
        className="duo-hinge"
        aria-hidden
      />
      <section
        className="duo-pane duo-secondary"
        aria-label="Detail"
      >
        {secondary}
      </section>
    </div>
  );
}
