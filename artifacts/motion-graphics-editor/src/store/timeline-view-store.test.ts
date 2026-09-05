import { describe, it, expect, beforeEach } from "vitest";
import {
  useTimelineViewStore,
  fitPxPerMs,
  clampPxPerMs,
  clampScrollMs,
} from "./timeline-view-store";

const reset = () =>
  useTimelineViewStore.setState({
    pxPerMs: 0,
    mode: "fit",
    viewportPx: 0,
    totalDurationMs: 0,
    scrollMs: 0,
    hoverTimeMs: null,
  });

beforeEach(() => reset());

describe("TimelineViewStore helpers", () => {
  it("fitPxPerMs returns content width that fits within the viewport", () => {
    const viewportPx = 1000;
    const totalDurationMs = 5000;
    const pxPerMs = fitPxPerMs(viewportPx, totalDurationMs);
    const contentPx = totalDurationMs * pxPerMs + 64;
    expect(contentPx).toBeLessThanOrEqual(viewportPx + 1e-6);
    expect(pxPerMs).toBeCloseTo((1000 - 64) / 5000, 10);
  });

  it("fitPxPerMs returns 0 for non-positive viewport", () => {
    expect(fitPxPerMs(0, 1000)).toBe(0);
    expect(fitPxPerMs(-10, 1000)).toBe(0);
  });

  it("clampPxPerMs bounds candidate to [fit, MAX_PX_PER_MS] and above MIN_PX_PER_MS", () => {
    const viewportPx = 1000;
    const totalDurationMs = 10000;
    const fit = fitPxPerMs(viewportPx, totalDurationMs);

    expect(clampPxPerMs(0.0001, viewportPx, totalDurationMs)).toBeCloseTo(fit, 10);
    expect(clampPxPerMs(999, viewportPx, totalDurationMs)).toBe(2);
    expect(clampPxPerMs(1, viewportPx, totalDurationMs)).toBeCloseTo(1, 10);

    // With a tiny viewport that yields fit < MIN, MIN is the floor.
    expect(clampPxPerMs(0, 1, 0)).toBeCloseTo(1e-6, 12);
  });
});

describe("TimelineViewStore actions", () => {
  it("fit mode never exceeds the viewport", () => {
    const { setViewportPx, setTotalDurationMs } = useTimelineViewStore.getState();
    setViewportPx(1000);
    setTotalDurationMs(5000);

    const { pxPerMs, scrollMs, mode, viewportPx, totalDurationMs } =
      useTimelineViewStore.getState();
    expect(mode).toBe("fit");
    const contentPx = totalDurationMs * pxPerMs + 64;
    expect(contentPx).toBeLessThanOrEqual(viewportPx + 1e-6);
    expect(scrollMs).toBeCloseTo(0, 5);
    expect(pxPerMs).toBeCloseTo(fitPxPerMs(1000, 5000), 6);
  });

  it("explicit mode clamps pxPerMs to [fit, MAX_PX_PER_MS] (2px/ms)", () => {
    const { setViewportPx, setTotalDurationMs, applyZoom } = useTimelineViewStore.getState();
    setViewportPx(1000);
    setTotalDurationMs(10000);
    const fit = fitPxPerMs(1000, 10000);

    // candidate below fit -> clamped to fit
    applyZoom(fit / 10, 1000);
    expect(useTimelineViewStore.getState().mode).toBe("explicit");
    expect(useTimelineViewStore.getState().pxPerMs).toBeCloseTo(fit, 8);

    // candidate above MAX (2) -> clamped to 2
    applyZoom(5, 1000);
    expect(useTimelineViewStore.getState().pxPerMs).toBe(2);

    // candidate between fit and MAX -> unchanged
    applyZoom(1, 1000);
    expect(useTimelineViewStore.getState().pxPerMs).toBeCloseTo(1, 8);
  });

  it("setScrollMs never goes negative or past content end", () => {
    const { setViewportPx, setTotalDurationMs, applyZoom, setScrollMs } =
      useTimelineViewStore.getState();
    setViewportPx(1000);
    setTotalDurationMs(5000);
    // explicit zoom so pxPerMs is large enough for content to exceed viewport
    applyZoom(0.2, 0);

    const { pxPerMs, totalDurationMs, viewportPx } = useTimelineViewStore.getState();
    const contentPx = totalDurationMs * pxPerMs + 64;
    const maxScrollMs = (contentPx - viewportPx) / pxPerMs;
    expect(maxScrollMs).toBeGreaterThan(0);

    setScrollMs(-1000);
    expect(useTimelineViewStore.getState().scrollMs).toBeCloseTo(0, 5);

    setScrollMs(999999);
    expect(useTimelineViewStore.getState().scrollMs).toBeCloseTo(maxScrollMs, 5);
  });

  it("applyZoom keeps the anchor time at the same screen x (within 1px)", () => {
    const { setViewportPx, setTotalDurationMs, applyZoom } = useTimelineViewStore.getState();
    setViewportPx(1000);
    setTotalDurationMs(10000);

    const { pxPerMs: pxBefore, scrollMs: scrollBefore } = useTimelineViewStore.getState();
    const anchorTimeMs = 3000;
    const anchorScreenXBefore = (anchorTimeMs - scrollBefore) * pxBefore;

    applyZoom(0.2, anchorTimeMs);

    const { pxPerMs: pxAfter, scrollMs: scrollAfter } = useTimelineViewStore.getState();
    const anchorScreenXAfter = (anchorTimeMs - scrollAfter) * pxAfter;

    expect(Math.abs(anchorScreenXAfter - anchorScreenXBefore)).toBeLessThan(1);
  });

  it("setFit returns to fit mode and resets scroll", () => {
    const { setViewportPx, setTotalDurationMs, applyZoom, setFit } =
      useTimelineViewStore.getState();
    setViewportPx(1000);
    setTotalDurationMs(5000);
    applyZoom(1, 1000);
    expect(useTimelineViewStore.getState().mode).toBe("explicit");

    setFit();
    const state = useTimelineViewStore.getState();
    expect(state.mode).toBe("fit");
    expect(state.scrollMs).toBe(0);
    expect(state.pxPerMs).toBeCloseTo(fitPxPerMs(1000, 5000), 6);
  });

  it("clampScrollMs via setScrollMs stays within [0, content end]", () => {
    // Direct helper check with a known geometry.
    const pxPerMs = 0.2;
    const viewportPx = 1000;
    const totalDurationMs = 5000;
    const contentPx = totalDurationMs * pxPerMs + 64;
    const maxScrollMs = (contentPx - viewportPx) / pxPerMs;

    expect(clampScrollMs(-1000, pxPerMs, viewportPx, totalDurationMs)).toBe(0);
    expect(clampScrollMs(999999, pxPerMs, viewportPx, totalDurationMs)).toBeCloseTo(
      maxScrollMs,
      5,
    );
    expect(clampScrollMs(10, pxPerMs, viewportPx, totalDurationMs)).toBeCloseTo(10, 5);
  });
});
