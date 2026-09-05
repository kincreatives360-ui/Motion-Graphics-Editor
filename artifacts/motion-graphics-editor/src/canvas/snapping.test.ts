import { describe, it, expect } from "vitest";
import { getSnapCandidates, snapTransform, type SnapCandidates } from "./snapping";
import type { Layer, Transform } from "../store/editor-store";

function createMockLayer(id: string, transform: Partial<Transform>, overrides?: Partial<Layer>): Layer {
  return {
    id,
    name: `Layer ${id}`,
    type: "shape",
    visible: true,
    locked: false,
    opacity: 1,
    transform: {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      depth: 0,
      ...transform,
    },
    ...overrides,
  };
}

describe("snapping.ts", () => {
  describe("getSnapCandidates", () => {
    it("generates canvas boundary candidates (edges and center) by default", () => {
      const moving = createMockLayer("moving", { x: 50, y: 50, width: 100, height: 100 });
      const candidates = getSnapCandidates(moving, [], 1920, 1080);

      // Canvas edges at 0 and width/height, center at half
      const xValues = candidates.x.map((c) => c.value);
      expect(xValues).toContain(0);
      expect(xValues).toContain(960);
      expect(xValues).toContain(1920);

      const yValues = candidates.y.map((c) => c.value);
      expect(yValues).toContain(0);
      expect(yValues).toContain(540);
      expect(yValues).toContain(1080);

      // Verify labels
      expect(candidates.x.find((c) => c.value === 960)?.label).toBe("center");
      expect(candidates.x.find((c) => c.value === 0)?.label).toBe("edge");
      expect(candidates.x.find((c) => c.value === 1920)?.label).toBe("edge");
    });

    it("supports custom canvas dimensions (e.g. 9:16 portrait canvas)", () => {
      const moving = createMockLayer("moving", { x: 100, y: 100 });
      const candidates = getSnapCandidates(moving, [], 1080, 1920);

      expect(candidates.x.map((c) => c.value)).toEqual([0, 540, 1080]);
      expect(candidates.y.map((c) => c.value)).toEqual([0, 960, 1920]);
    });

    it("generates edge and center candidates for all visible other layers", () => {
      const moving = createMockLayer("moving", { x: 0, y: 0 });
      const otherA = createMockLayer("a", { x: 200, y: 300, width: 150, height: 80 });

      const candidates = getSnapCandidates(moving, [otherA], 1920, 1080);

      // otherA X candidates: 200 (left edge), 200 + 75 = 275 (center), 350 (right edge)
      const otherX = candidates.x.filter((c) => c.sourceLayer?.id === "a");
      expect(otherX).toHaveLength(3);
      expect(otherX.find((c) => c.label === "edge" && c.value === 200)).toBeDefined();
      expect(otherX.find((c) => c.label === "center" && c.value === 275)).toBeDefined();
      expect(otherX.find((c) => c.label === "edge" && c.value === 350)).toBeDefined();

      // otherA Y candidates: 300 (top edge), 300 + 40 = 340 (center), 380 (bottom edge)
      const otherY = candidates.y.filter((c) => c.sourceLayer?.id === "a");
      expect(otherY).toHaveLength(3);
      expect(otherY.find((c) => c.label === "edge" && c.value === 300)).toBeDefined();
      expect(otherY.find((c) => c.label === "center" && c.value === 340)).toBeDefined();
      expect(otherY.find((c) => c.label === "edge" && c.value === 380)).toBeDefined();
    });

    it("filters out invisible layers and does not include the moving layer itself", () => {
      const moving = createMockLayer("moving", { x: 100, y: 100 });
      const hidden = createMockLayer("hidden", { x: 300, y: 300 }, { visible: false });
      const visible = createMockLayer("vis", { x: 500, y: 500 });

      const candidates = getSnapCandidates(moving, [moving, hidden, visible], 1920, 1080);

      // Should not contain candidates from 'moving' or 'hidden'
      expect(candidates.x.some((c) => c.sourceLayer?.id === "moving")).toBe(false);
      expect(candidates.x.some((c) => c.sourceLayer?.id === "hidden")).toBe(false);
      expect(candidates.x.some((c) => c.sourceLayer?.id === "vis")).toBe(true);
    });
  });

  describe("snapTransform", () => {
    const defaultCandidates: SnapCandidates = {
      x: [
        { value: 0, label: "edge" },
        { value: 960, label: "center" },
        { value: 1920, label: "edge" },
        { value: 400, label: "edge" },
        { value: 500, label: "center" },
      ],
      y: [
        { value: 0, label: "edge" },
        { value: 540, label: "center" },
        { value: 1080, label: "edge" },
        { value: 300, label: "edge" },
      ],
    };

    it("snaps left edge to an edge candidate within threshold", () => {
      // moving.x = 398 is within threshold (6) of candidate 400 (diff 2)
      const moving: Transform = { x: 398, y: 150, width: 100, height: 100, rotation: 0 };
      const res = snapTransform(moving, defaultCandidates, [], 6);

      expect(res.x).toBe(400);
      expect(res.y).toBe(150);
      expect(res.guides).toContainEqual(
        expect.objectContaining({ axis: "x", value: 400, label: "edge" })
      );
    });

    it("snaps right edge to an edge candidate within threshold", () => {
      // moving right edge = x + width = 303 + 100 = 403, diff 3 from candidate 400
      const moving: Transform = { x: 303, y: 150, width: 100, height: 100, rotation: 0 };
      const res = snapTransform(moving, defaultCandidates, [], 6);

      expect(res.x).toBe(300); // 300 + 100 = 400
      expect(res.guides).toContainEqual(
        expect.objectContaining({ axis: "x", value: 400, label: "edge" })
      );
    });

    it("snaps center to a center candidate within threshold", () => {
      // moving center = x + width/2 = 448 + 50 = 498, diff 2 from candidate 500 (center)
      const moving: Transform = { x: 448, y: 150, width: 100, height: 100, rotation: 0 };
      const res = snapTransform(moving, defaultCandidates, [], 6);

      expect(res.x).toBe(450); // 450 + 50 = 500
      expect(res.guides).toContainEqual(
        expect.objectContaining({ axis: "x", value: 500, label: "center" })
      );
    });

    it("snaps both X and Y simultaneously to respective candidates", () => {
      // X center: 911 + 50 = 961 (close to 960, diff 1)
      // Y top edge: 297 (close to 300, diff 3)
      const moving: Transform = { x: 911, y: 297, width: 100, height: 100, rotation: 0 };
      const res = snapTransform(moving, defaultCandidates, [], 6);

      expect(res.x).toBe(910); // 910 + 50 = 960
      expect(res.y).toBe(300);
      expect(res.guides.length).toBe(2);
      expect(res.guides).toContainEqual(
        expect.objectContaining({ axis: "x", value: 960, label: "center" })
      );
      expect(res.guides).toContainEqual(
        expect.objectContaining({ axis: "y", value: 300, label: "edge" })
      );
    });

    it("does not snap when distance exceeds threshold", () => {
      // moving.x = 415 is 15px away from 400 (> threshold 6)
      const moving: Transform = { x: 415, y: 150, width: 100, height: 100, rotation: 0 };
      const res = snapTransform(moving, defaultCandidates, [], 6);

      expect(res.x).toBe(415);
      expect(res.y).toBe(150);
      expect(res.guides).toHaveLength(0);
    });

    describe("threshold behavior at zoom extremes", () => {
      it("behaves strictly at high zoom / close inspection (small canvas threshold)", () => {
        // High zoom (e.g. 4x zoom -> effective threshold = 6 / 4 = 1.5px)
        const threshold = 1.5;
        const targetCandidate = 400;
        const candidates: SnapCandidates = {
          x: [{ value: targetCandidate, label: "edge" }],
          y: [],
        };

        // 1.0px difference: should snap left edge to 400
        const closeMoving: Transform = { x: targetCandidate - 1.0, y: 100, width: 100, height: 100, rotation: 0 };
        const closeRes = snapTransform(closeMoving, candidates, [], threshold);
        expect(closeRes.x).toBe(400);
        expect(closeRes.guides.length).toBeGreaterThan(0);

        // 2.0px difference: exceeds 1.5px threshold, so does NOT snap (preserves fine sub-pixel control)
        const farMoving: Transform = { x: targetCandidate - 2.0, y: 100, width: 100, height: 100, rotation: 0 };
        const farRes = snapTransform(farMoving, candidates, [], threshold);
        expect(farRes.x).toBe(398);
        expect(farRes.guides).toHaveLength(0);
      });

      it("provides generous snapping at low zoom / wide view (large canvas threshold)", () => {
        // Low zoom (e.g. 0.25x zoom -> effective threshold = 6 / 0.25 = 24px)
        const threshold = 24;
        const targetCandidate = 400;
        const candidates: SnapCandidates = {
          x: [{ value: targetCandidate, label: "edge" }],
          y: [],
        };

        // 18px difference: snaps easily from far away on canvas
        const distantMoving: Transform = { x: targetCandidate - 18, y: 100, width: 100, height: 100, rotation: 0 };
        const snapRes = snapTransform(distantMoving, candidates, [], threshold);
        expect(snapRes.x).toBe(400);
        expect(snapRes.guides.length).toBeGreaterThan(0);

        // 30px difference: exceeds 24px threshold on all test points, does not snap
        const tooFarMoving: Transform = { x: targetCandidate + 30, y: 100, width: 100, height: 100, rotation: 0 };
        const noSnapRes = snapTransform(tooFarMoving, candidates, [], threshold);
        expect(noSnapRes.x).toBe(430);
        expect(noSnapRes.guides).toHaveLength(0);
      });
    });

    describe("equal-spacing snap detection", () => {
      it("detects and snaps when moving layer is centered between two other layers", () => {
        // Layer 1: x = 100, width = 100 (right edge = 200)
        // Layer 2: x = 500, width = 100 (left edge = 500)
        // Total gap between them = 500 - 200 = 300.
        // Moving layer width = 100.
        // Equal spacing target gap = (300 - 100) / 2 = 100.
        // Target x = 200 + 100 = 300.
        const layer1 = createMockLayer("l1", { x: 100, y: 100, width: 100, height: 100 });
        const layer2 = createMockLayer("l2", { x: 500, y: 100, width: 100, height: 100 });

        // Moving layer placed slightly off target at x = 302 (diff 2 < threshold 6)
        const moving: Transform = { x: 302, y: 100, width: 100, height: 100, rotation: 0 };
        const res = snapTransform(moving, { x: [], y: [] }, [layer1, layer2], 6);

        expect(res.x).toBe(300);
        expect(res.guides).toContainEqual(
          expect.objectContaining({
            axis: "x",
            value: 300,
            label: "spacing",
          })
        );
      });

      it("detects and snaps when moving layer follows two existing layers with equal spacing", () => {
        // Layer 1: x = 100, width = 100 (ends at 200)
        // Layer 2: x = 300, width = 100 (ends at 400)
        // Gap between l1 and l2 = 300 - 200 = 100.
        // Target X for moving layer on the right = 400 + 100 = 500.
        const layer1 = createMockLayer("l1", { x: 100, y: 100, width: 100, height: 100 });
        const layer2 = createMockLayer("l2", { x: 300, y: 100, width: 100, height: 100 });

        // Moving layer placed at x = 497 (diff 3 < threshold 6)
        const moving: Transform = { x: 497, y: 100, width: 100, height: 100, rotation: 0 };
        const res = snapTransform(moving, { x: [], y: [] }, [layer1, layer2], 6);

        expect(res.x).toBe(500);
        expect(res.guides).toContainEqual(
          expect.objectContaining({
            axis: "x",
            value: 500,
            label: "spacing",
          })
        );
      });
    });
  });
});
