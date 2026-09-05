import { create } from "zustand";

export type TimelineViewMode = "fit" | "explicit";

export interface TimelineViewState {
  pxPerMs: number;
  mode: TimelineViewMode;
  viewportPx: number;
  totalDurationMs: number;
  scrollMs: number;
  hoverTimeMs: number | null;
  setViewportPx: (n: number) => void;
  setTotalDurationMs: (n: number) => void;
  setScrollMs: (n: number) => void;
  applyZoom: (candidatePxPerMs: number, anchorTimeMs: number) => void;
  setFit: () => void;
}

const LEFT_INSET_PX = 64;
const MIN_PX_PER_MS = 1e-6;
const MAX_PX_PER_MS = 2;
const FALLBACK_DURATION_MS = 10000;

export function fitPxPerMs(viewportPx: number, totalDurationMs: number): number {
  if (viewportPx <= 0) return 0;
  const duration = totalDurationMs > 0 ? totalDurationMs : FALLBACK_DURATION_MS;
  return Math.max(0, viewportPx - LEFT_INSET_PX) / duration;
}

export function clampPxPerMs(
  candidate: number,
  viewportPx: number,
  totalDurationMs: number,
): number {
  const fit = fitPxPerMs(viewportPx, totalDurationMs);
  const min = Math.max(MIN_PX_PER_MS, fit);
  return Math.max(min, Math.min(MAX_PX_PER_MS, candidate));
}

export function clampScrollMs(
  scrollMs: number,
  pxPerMs: number,
  viewportPx: number,
  totalDurationMs: number,
): number {
  if (pxPerMs <= 0) return 0;
  const contentPx = totalDurationMs * pxPerMs + LEFT_INSET_PX;
  const maxScrollMs = Math.max(0, contentPx - viewportPx) / pxPerMs;
  return Math.max(0, Math.min(maxScrollMs, scrollMs));
}

export const useTimelineViewStore = create<TimelineViewState>()((set) => ({
  pxPerMs: 0,
  mode: "fit",
  viewportPx: 0,
  totalDurationMs: 0,
  scrollMs: 0,
  hoverTimeMs: null,
  setViewportPx: (n) =>
    set((s) => {
      const pxPerMs =
        s.mode === "fit"
          ? fitPxPerMs(n, s.totalDurationMs)
          : clampPxPerMs(s.pxPerMs, n, s.totalDurationMs);
      return {
        viewportPx: n,
        pxPerMs,
        scrollMs: clampScrollMs(s.scrollMs, pxPerMs, n, s.totalDurationMs),
      };
    }),
  setTotalDurationMs: (n) =>
    set((s) => {
      const pxPerMs =
        s.mode === "fit"
          ? fitPxPerMs(s.viewportPx, n)
          : clampPxPerMs(s.pxPerMs, s.viewportPx, n);
      return {
        totalDurationMs: n,
        pxPerMs,
        scrollMs: clampScrollMs(s.scrollMs, pxPerMs, s.viewportPx, n),
      };
    }),
  setScrollMs: (n) =>
    set((s) => ({
      scrollMs: clampScrollMs(n, s.pxPerMs, s.viewportPx, s.totalDurationMs),
    })),
  applyZoom: (candidatePxPerMs, anchorTimeMs) =>
    set((s) => {
      const anchorScreenX = (anchorTimeMs - s.scrollMs) * s.pxPerMs;
      const newPxPerMs = clampPxPerMs(candidatePxPerMs, s.viewportPx, s.totalDurationMs);
      return {
        pxPerMs: newPxPerMs,
        mode: "explicit",
        scrollMs: clampScrollMs(
          anchorTimeMs - anchorScreenX / newPxPerMs,
          newPxPerMs,
          s.viewportPx,
          s.totalDurationMs,
        ),
      };
    }),
  setFit: () =>
    set((s) => ({
      pxPerMs: fitPxPerMs(s.viewportPx, s.totalDurationMs),
      mode: "fit",
      scrollMs: 0,
    })),
}));
