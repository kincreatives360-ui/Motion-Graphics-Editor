import { describe, it, expect } from "vitest";
import {
  sampleCubicBezier,
  applyEasing,
  sampleBlock,
  computeRenderedLayer,
  focalLength,
  projectLayer,
  sampleCamera,
  dofBlurPx,
  sampleKeyframeTrack,
  type AnimationBlock,
} from "./animation-blocks";
import type { Layer, Camera } from "./editor-store";

const createBaseLayer = (overrides?: Partial<Layer>): Layer => ({
  id: "layer-1",
  name: "Test Layer",
  type: "shape",
  visible: true,
  locked: false,
  opacity: 1,
  blendMode: "source-over",
  transform: {
    x: 200,
    y: 150,
    width: 100,
    height: 100,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    depth: 0,
  },
  parentId: null,
  ...overrides,
});

const createBaseCamera = (overrides?: Partial<Camera>): Camera => ({
  x: 0,
  y: 0,
  z: 0,
  fov: 60,
  focusDistance: 1000,
  ...overrides,
});

describe("computeRenderedLayer", () => {
  it("(a) computes rendered layer with a single active block", () => {
    const layer = createBaseLayer();
    const blocks: AnimationBlock[] = [
      {
        id: "block-1",
        sceneId: "scene-1",
        layerId: "layer-1",
        preset: "fade-in",
        startFrame: 0,
        endFrame: 40,
        easing: "linear",
      },
    ];

    // At frame 20 (linear 50% between 0 and 40)
    const result = computeRenderedLayer(layer, blocks, 20);
    expect(result.opacity).toBeCloseTo(0.5, 2);
    expect(result.transform.x).toBe(200);
    expect(result.transform.y).toBe(150);
  });

  it("(b) computes rendered layer across two non-overlapping blocks", () => {
    const layer = createBaseLayer();
    const blocks: AnimationBlock[] = [
      {
        id: "block-1",
        sceneId: "scene-1",
        layerId: "layer-1",
        preset: "fade-in",
        startFrame: 10,
        endFrame: 30,
        easing: "linear",
      },
      {
        id: "block-2",
        sceneId: "scene-1",
        layerId: "layer-1",
        preset: "fade-out",
        startFrame: 70,
        endFrame: 90,
        easing: "linear",
      },
    ];

    // Between the two blocks (frame 50): block-1 has ended, block-2 not started
    // In our policy, fade-in has completed, and fade-out hasn't triggered exit hold
    const midResult = computeRenderedLayer(layer, blocks, 50);
    expect(midResult.opacity).toBeCloseTo(1, 2);

    // Midpoint of fade-out (frame 80)
    const fadeOutMid = computeRenderedLayer(layer, blocks, 80);
    expect(fadeOutMid.opacity).toBeCloseTo(0.5, 2);

    // After fade-out (frame 100)
    const postResult = computeRenderedLayer(layer, blocks, 100);
    expect(postResult.opacity).toBe(0);
  });

  it("(c) correctly accumulates hold and in-range states for two overlapping blocks on the same layer", () => {
    const layer = createBaseLayer({
      transform: {
        x: 300,
        y: 200,
        width: 100,
        height: 100,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        depth: 0,
      },
    });

    const blocks: AnimationBlock[] = [
      {
        id: "b1",
        sceneId: "s1",
        layerId: "layer-1",
        preset: "slide-in-left", // offsets x by -240 at start, moves to +0 delta
        startFrame: 0,
        endFrame: 40,
        easing: "linear",
      },
      {
        id: "b2",
        sceneId: "s1",
        layerId: "layer-1",
        preset: "slide-in-up", // offsets y by +200 at start, moves to +0 delta
        startFrame: 20,
        endFrame: 60,
        easing: "linear",
      },
    ];

    // At frame 10 (b1 active, b2 in pre-start hold state):
    // b1 is 25% through (-240 * (1 - 0.25) = -180). Accumulated x = 300 - 180 = 120.
    // b2 is pre-start (frame 10 < 20): holds y offset (+200) relative to accumulated transform.
    const f10 = computeRenderedLayer(layer, blocks, 10);
    expect(f10.transform.x).toBeCloseTo(120, 1);
    expect(f10.transform.y).toBe(200 + 200); // 400

    // At frame 30 (overlapping: b1 is 75% through, b2 is 25% through):
    // b1: -240 * (1 - 0.75) = -60 delta on x. x = 300 - 60 = 240.
    // b2: +200 * (1 - 0.25) = +150 delta on y. y = 200 + 150 = 350.
    const f30 = computeRenderedLayer(layer, blocks, 30);
    expect(f30.transform.x).toBeCloseTo(240, 1);
    expect(f30.transform.y).toBeCloseTo(350, 1);

    // At frame 50 (b1 complete with 0 delta, b2 75% through with +50 delta on y):
    const f50 = computeRenderedLayer(layer, blocks, 50);
    expect(f50.transform.x).toBeCloseTo(300, 1);
    expect(f50.transform.y).toBeCloseTo(250, 1);
  });

  it("(d) correctly handles frame before all blocks (entrance hold state)", () => {
    const layer = createBaseLayer({ opacity: 1 });
    const blocks: AnimationBlock[] = [
      {
        id: "block-1",
        sceneId: "s1",
        layerId: "layer-1",
        preset: "fade-in",
        startFrame: 20,
        endFrame: 50,
        easing: "linear",
      },
    ];

    // Before frame 20, fade-in entrance hold sets opacity to 0
    const beforeResult = computeRenderedLayer(layer, blocks, 5);
    expect(beforeResult.opacity).toBe(0);
  });

  it("(e) correctly handles frame after all blocks (exit hold state)", () => {
    const layer = createBaseLayer({ opacity: 1 });
    const blocks: AnimationBlock[] = [
      {
        id: "block-1",
        sceneId: "s1",
        layerId: "layer-1",
        preset: "fade-out",
        startFrame: 20,
        endFrame: 50,
        easing: "linear",
      },
    ];

    // After frame 50, fade-out terminal hold sets opacity to 0
    const afterResult = computeRenderedLayer(layer, blocks, 75);
    expect(afterResult.opacity).toBe(0);
  });

  it("(f) returns baseline layer transform and opacity without mutation when layer has no blocks", () => {
    const layer = createBaseLayer({ opacity: 0.8, transform: { x: 50, y: 60, width: 70, height: 80, rotation: 15, depth: 5 } });
    const otherBlock: AnimationBlock = {
      id: "other-block",
      sceneId: "s1",
      layerId: "some-other-layer",
      preset: "fade-in",
      startFrame: 0,
      endFrame: 30,
      easing: "linear",
    };

    const result = computeRenderedLayer(layer, [otherBlock], 15);
    expect(result.transform.x).toBe(50);
    expect(result.transform.y).toBe(60);
    expect(result.transform.width).toBe(70);
    expect(result.transform.height).toBe(80);
    expect(result.transform.rotation).toBe(15);
    expect(result.opacity).toBe(0.8);
  });

  it("(g) correctly handles overlapping fade-in and scale-in on the same layer", () => {
    const layer = createBaseLayer({
      opacity: 1,
      transform: { x: 200, y: 150, width: 100, height: 100, rotation: 0, depth: 0 },
    });

    const blocks: AnimationBlock[] = [
      {
        id: "b-fade",
        sceneId: "s1",
        layerId: "layer-1",
        preset: "fade-in",
        startFrame: 0,
        endFrame: 40,
        easing: "linear",
      },
      {
        id: "b-scale",
        sceneId: "s1",
        layerId: "layer-1",
        preset: "scale-in",
        startFrame: 20,
        endFrame: 60,
        easing: "linear",
      },
    ];

    // Frame 0: fade-in at 0% (opacity 0), scale-in in pre-start hold (scale 0.5 => 50x50, centered at cx=250, cy=200)
    const f0 = computeRenderedLayer(layer, blocks, 0);
    expect(f0.opacity).toBe(0);
    expect(f0.transform.width).toBe(50);
    expect(f0.transform.height).toBe(50);
    expect(f0.transform.x).toBe(225);
    expect(f0.transform.y).toBe(175);

    // Frame 30 (overlap region):
    // fade-in is 75% complete -> opacity = 0.75
    // scale-in is 25% complete -> s = 0.5 + 0.5 * 0.25 = 0.625 -> width = 62.5, height = 62.5, centered: x = 250 - 31.25 = 218.75
    const f30 = computeRenderedLayer(layer, blocks, 30);
    expect(f30.opacity).toBeCloseTo(0.75, 2);
    expect(f30.transform.width).toBeCloseTo(62.5, 1);
    expect(f30.transform.height).toBeCloseTo(62.5, 1);
    expect(f30.transform.x).toBeCloseTo(218.75, 1);

    // Frame 40 (exact boundary where fade-in finishes, scale-in 50% complete):
    // fade-in has reached 1.0; scale-in s = 0.75 -> width = 75, height = 75
    const f40 = computeRenderedLayer(layer, blocks, 40);
    expect(f40.opacity).toBeCloseTo(1, 2);
    expect(f40.transform.width).toBeCloseTo(75, 1);

    // Frame 70 (after both complete):
    // opacity = 1, width = 100, height = 100, x = 200, y = 150
    const f70 = computeRenderedLayer(layer, blocks, 70);
    expect(f70.opacity).toBe(1);
    expect(f70.transform.width).toBe(100);
    expect(f70.transform.height).toBe(100);
    expect(f70.transform.x).toBe(200);
    expect(f70.transform.y).toBe(150);
  });

  it("(h) correctly handles overlapping slide-in-right and fade-out", () => {
    const layer = createBaseLayer({
      opacity: 1,
      transform: { x: 300, y: 200, width: 80, height: 80, rotation: 0, depth: 0 },
    });

    const blocks: AnimationBlock[] = [
      {
        id: "b-slide",
        sceneId: "s1",
        layerId: "layer-1",
        preset: "slide-in-right",
        startFrame: 0,
        endFrame: 40,
        easing: "linear",
      },
      {
        id: "b-fadeout",
        sceneId: "s1",
        layerId: "layer-1",
        preset: "fade-out",
        startFrame: 30,
        endFrame: 50,
        easing: "linear",
      },
    ];

    // Frame 35: slide-in-right is 35/40 (87.5% through) -> offset = 240 * (1 - 0.875) = 30. x = 330.
    // fade-out is 5/20 (25% through) -> opacity = 1 - 0.25 = 0.75.
    const f35 = computeRenderedLayer(layer, blocks, 35);
    expect(f35.transform.x).toBeCloseTo(330, 1);
    expect(f35.opacity).toBeCloseTo(0.75, 2);

    // Frame 60 (after fade-out has completed): opacity = 0
    const f60 = computeRenderedLayer(layer, blocks, 60);
    expect(f60.opacity).toBe(0);
    expect(f60.transform.x).toBe(300);
  });
});

describe("sampleCamera", () => {
  it("(a) samples camera with a single block", () => {
    const baseCam = createBaseCamera({ x: 0, y: 0, z: 0, fov: 60 });
    const blocks: AnimationBlock[] = [
      {
        id: "cam-1",
        sceneId: "s1",
        layerId: null,
        preset: "camera-move",
        startFrame: 0,
        endFrame: 40,
        easing: "linear",
        cameraTo: { x: 100, y: -50, z: 200, fov: 15 },
      },
    ];

    // Midpoint (frame 20)
    const midCam = sampleCamera(baseCam, blocks, 20);
    expect(midCam.x).toBeCloseTo(50, 1);
    expect(midCam.y).toBeCloseTo(-25, 1);
    expect(midCam.z).toBeCloseTo(100, 1);
    expect(midCam.fov).toBeCloseTo(67.5, 1);

    // End (frame 40)
    const endCam = sampleCamera(baseCam, blocks, 40);
    expect(endCam.x).toBe(100);
    expect(endCam.y).toBe(-50);
    expect(endCam.z).toBe(200);
    expect(endCam.fov).toBe(75);
  });

  it("(b) samples camera across two non-overlapping blocks", () => {
    const baseCam = createBaseCamera({ x: 0, y: 0, z: 0, fov: 60 });
    const blocks: AnimationBlock[] = [
      {
        id: "cam-1",
        sceneId: "s1",
        layerId: null,
        preset: "camera-move",
        startFrame: 0,
        endFrame: 30,
        easing: "linear",
        cameraTo: { x: 100, y: 0, z: 0, fov: 0 },
      },
      {
        id: "cam-2",
        sceneId: "s1",
        layerId: null,
        preset: "camera-move",
        startFrame: 50,
        endFrame: 80,
        easing: "linear",
        cameraTo: { x: 50, y: 80, z: 200, fov: 10 },
      },
    ];

    // Frame 40 (between blocks): cam-1 is held in post-end state (+100 x), cam-2 has not started
    const midCam = sampleCamera(baseCam, blocks, 40);
    expect(midCam.x).toBe(100);
    expect(midCam.y).toBe(0);
    expect(midCam.z).toBe(0);
    expect(midCam.fov).toBe(60);

    // Frame 90 (after both): both deltas accumulate (100 + 50 = 150)
    const postCam = sampleCamera(baseCam, blocks, 90);
    expect(postCam.x).toBe(150);
    expect(postCam.y).toBe(80);
    expect(postCam.z).toBe(200);
    expect(postCam.fov).toBe(70);
  });

  it("(c) samples camera with two overlapping blocks accumulating additively", () => {
    const baseCam = createBaseCamera({ x: 0, y: 0, z: 0, fov: 60 });
    const blocks: AnimationBlock[] = [
      {
        id: "cam-1",
        sceneId: "s1",
        layerId: null,
        preset: "camera-move",
        startFrame: 0,
        endFrame: 40,
        easing: "linear",
        cameraTo: { x: 100, y: 0, z: 0, fov: 0 },
      },
      {
        id: "cam-2",
        sceneId: "s1",
        layerId: null,
        preset: "camera-move",
        startFrame: 20,
        endFrame: 60,
        easing: "linear",
        cameraTo: { x: 100, y: 50, z: 150, fov: 10 },
      },
    ];

    // At frame 30 (overlap period):
    // cam-1 is 75% complete: adds 75 to x
    // cam-2 is 25% complete: adds 25 to x, 12.5 to y, 37.5 to z, 2.5 to fov
    const overlapCam = sampleCamera(baseCam, blocks, 30);
    expect(overlapCam.x).toBeCloseTo(100, 1);
    expect(overlapCam.y).toBeCloseTo(12.5, 1);
    expect(overlapCam.z).toBeCloseTo(37.5, 1);
    expect(overlapCam.fov).toBeCloseTo(62.5, 1);

    // At frame 70 (after both):
    // Both full deltas are accumulated: x = 100 + 100 = 200
    const finalCam = sampleCamera(baseCam, blocks, 70);
    expect(finalCam.x).toBe(200);
    expect(finalCam.y).toBe(50);
    expect(finalCam.z).toBe(150);
    expect(finalCam.fov).toBe(70);
  });

  it("(d) samples camera before all blocks", () => {
    const baseCam = createBaseCamera({ x: 10, y: 20, z: 30, fov: 60 });
    const blocks: AnimationBlock[] = [
      {
        id: "cam-1",
        sceneId: "s1",
        layerId: null,
        preset: "camera-move",
        startFrame: 30,
        endFrame: 60,
        easing: "linear",
        cameraTo: { x: 100, y: 100, z: 100, fov: 20 },
      },
    ];

    const result = sampleCamera(baseCam, blocks, 10);
    expect(result.x).toBe(10);
    expect(result.y).toBe(20);
    expect(result.z).toBe(30);
    expect(result.fov).toBe(60);
  });

  it("(e) samples camera after all blocks", () => {
    const baseCam = createBaseCamera({ x: 0, y: 0, z: 0, fov: 60 });
    const blocks: AnimationBlock[] = [
      {
        id: "cam-1",
        sceneId: "s1",
        layerId: null,
        preset: "camera-move",
        startFrame: 10,
        endFrame: 40,
        easing: "linear",
        cameraTo: { x: 80, y: 40, z: 120, fov: 15 },
      },
    ];

    const result = sampleCamera(baseCam, blocks, 100);
    expect(result.x).toBe(80);
    expect(result.y).toBe(40);
    expect(result.z).toBe(120);
    expect(result.fov).toBe(75);
  });

  it("(f) clamps camera fov to between 10 and 160 degrees at extremes", () => {
    const baseCam = createBaseCamera({ fov: 60 });
    const extremeZoomIn: AnimationBlock[] = [
      {
        id: "cam-extreme-in",
        sceneId: "s1",
        layerId: null,
        preset: "camera-move",
        startFrame: 0,
        endFrame: 10,
        easing: "linear",
        cameraTo: { fov: -100 }, // 60 - 100 = -40 => should clamp to 10
      },
    ];
    const extremeZoomOut: AnimationBlock[] = [
      {
        id: "cam-extreme-out",
        sceneId: "s1",
        layerId: null,
        preset: "camera-move",
        startFrame: 0,
        endFrame: 10,
        easing: "linear",
        cameraTo: { fov: 200 }, // 60 + 200 = 260 => should clamp to 160
      },
    ];

    expect(sampleCamera(baseCam, extremeZoomIn, 10).fov).toBe(10);
    expect(sampleCamera(baseCam, extremeZoomOut, 10).fov).toBe(160);
  });
});

describe("Keyframe Tracks & sampleKeyframeTrack", () => {
  it("interpolates numeric properties linearly between keyframes", () => {
    const track = {
      id: "kf-1",
      kind: "keyframe" as const,
      sceneId: "s1",
      layerId: "l1",
      property: "rotation" as const,
      keyframes: [
        { frame: 10, value: 0, easing: "linear" as const },
        { frame: 30, value: 180, easing: "linear" as const },
      ],
      startFrame: 10,
      endFrame: 30,
      easing: "linear" as const,
      preset: "custom" as const,
    };

    // Before first keyframe clamps to first value
    expect(sampleKeyframeTrack(track, 0)).toBe(0);
    // At first keyframe
    expect(sampleKeyframeTrack(track, 10)).toBe(0);
    // Midpoint (frame 20) -> 90 degrees
    expect(sampleKeyframeTrack(track, 20)).toBeCloseTo(90, 2);
    // At end keyframe
    expect(sampleKeyframeTrack(track, 30)).toBe(180);
    // After last keyframe clamps to last value
    expect(sampleKeyframeTrack(track, 50)).toBe(180);
  });

  it("interpolates color properties in RGB space", () => {
    const track = {
      id: "kf-col",
      kind: "keyframe" as const,
      sceneId: "s1",
      layerId: "l1",
      property: "fill" as const,
      keyframes: [
        { frame: 0, value: "#000000", easing: "linear" as const },
        { frame: 100, value: "#ffffff", easing: "linear" as const },
      ],
      startFrame: 0,
      endFrame: 100,
      easing: "linear" as const,
      preset: "custom" as const,
    };

    // Midpoint (frame 50) of black to white should be rgb(128, 128, 128) -> #808080
    const midColor = sampleKeyframeTrack(track, 50);
    expect(midColor).toBe("#808080");
  });

  it("handles multi-keyframe piecewise tracks with ease-in-out and custom curves", () => {
    const track = {
      id: "kf-multi",
      kind: "keyframe" as const,
      sceneId: "s1",
      layerId: "l1",
      property: "x" as const,
      keyframes: [
        { frame: 0, value: 100, easing: "linear" as const },
        { frame: 20, value: 200, easing: "custom" as const, customCurve: [0.25, 0.1, 0.25, 1.0] as [number, number, number, number] },
        { frame: 60, value: 400, easing: "linear" as const },
      ],
      startFrame: 0,
      endFrame: 60,
      easing: "linear" as const,
      preset: "custom" as const,
    };

    expect(sampleKeyframeTrack(track, 0)).toBe(100);
    expect(sampleKeyframeTrack(track, 10)).toBeCloseTo(150, 1);
    expect(sampleKeyframeTrack(track, 20)).toBe(200);
    expect(sampleKeyframeTrack(track, 60)).toBe(400);
  });

  it("integrates keyframe tracks into computeRenderedLayer seamlessly with preset blocks", () => {
    const layer = createBaseLayer({
      transform: {
        x: 100,
        y: 100,
        width: 80,
        height: 80,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        depth: 0,
      },
    });

    const blocks: AnimationBlock[] = [
      // Preset block: fade-in from 0 to 20
      {
        id: "preset-1",
        sceneId: "s1",
        layerId: "layer-1",
        preset: "fade-in",
        startFrame: 0,
        endFrame: 20,
        easing: "linear",
      },
      // Keyframe track: rotation from 0 to 360 between frame 0 and 40
      {
        id: "kf-rot",
        kind: "keyframe",
        sceneId: "s1",
        layerId: "layer-1",
        property: "rotation",
        keyframes: [
          { frame: 0, value: 0, easing: "linear" },
          { frame: 40, value: 360, easing: "linear" },
        ],
        startFrame: 0,
        endFrame: 40,
        easing: "linear",
        preset: "custom",
      },
    ];

    // At frame 10:
    // opacity should be 0.5 (from fade-in preset)
    // rotation should be 90 (from keyframe track)
    const rendered = computeRenderedLayer(layer, blocks, 10);
    expect(rendered.opacity).toBeCloseTo(0.5, 2);
    expect(rendered.transform.rotation).toBeCloseTo(90, 2);
  });
});

describe("sampleCubicBezier", () => {
  it("spot-checks linear cubic-bezier (0, 0, 1, 1) against reference values", () => {
    expect(sampleCubicBezier(0, 0, 0, 1, 1)).toBe(0);
    expect(sampleCubicBezier(0.25, 0, 0, 1, 1)).toBeCloseTo(0.25, 4);
    expect(sampleCubicBezier(0.5, 0, 0, 1, 1)).toBeCloseTo(0.5, 4);
    expect(sampleCubicBezier(0.75, 0, 0, 1, 1)).toBeCloseTo(0.75, 4);
    expect(sampleCubicBezier(1, 0, 0, 1, 1)).toBe(1);
  });

  it("spot-checks CSS ease-in-out curve (0.42, 0, 0.58, 1) symmetry and midpoint", () => {
    // By symmetry of ease-in-out, f(0.5) must be 0.5
    expect(sampleCubicBezier(0.5, 0.42, 0, 0.58, 1)).toBeCloseTo(0.5, 3);

    // Symmetric points f(t) and f(1 - t) sum to 1
    const y20 = sampleCubicBezier(0.2, 0.42, 0, 0.58, 1);
    const y80 = sampleCubicBezier(0.8, 0.42, 0, 0.58, 1);
    expect(y20 + y80).toBeCloseTo(1.0, 3);
    expect(y20).toBeLessThan(0.2); // slow start
    expect(y80).toBeGreaterThan(0.8); // fast approach before deceleration
  });

  it("spot-checks CSS ease curve (0.25, 0.1, 0.25, 1.0)", () => {
    expect(sampleCubicBezier(0, 0.25, 0.1, 0.25, 1.0)).toBe(0);
    expect(sampleCubicBezier(1, 0.25, 0.1, 0.25, 1.0)).toBe(1);
    // Known CSS ease midpoint reference: t=0.5 -> y ≈ 0.802
    expect(sampleCubicBezier(0.5, 0.25, 0.1, 0.25, 1.0)).toBeCloseTo(0.802, 2);
  });

  it("spot-checks CSS ease-in (0.42, 0, 1, 1) and CSS ease-out (0, 0, 0.58, 1)", () => {
    // ease-in starts slow: at midpoint y < 0.5
    const easeInMid = sampleCubicBezier(0.5, 0.42, 0, 1, 1);
    expect(easeInMid).toBeLessThan(0.4);
    expect(easeInMid).toBeGreaterThan(0.25);

    // ease-out starts fast: at midpoint y > 0.5
    const easeOutMid = sampleCubicBezier(0.5, 0, 0, 0.58, 1);
    expect(easeOutMid).toBeGreaterThan(0.6);
    expect(easeOutMid).toBeLessThan(0.75);
  });

  it("clamps boundary frames: t <= 0 returns 0, t >= 1 returns 1", () => {
    expect(sampleCubicBezier(-0.5, 0.25, 0.1, 0.25, 1.0)).toBe(0);
    expect(sampleCubicBezier(0, 0.25, 0.1, 0.25, 1.0)).toBe(0);
    expect(sampleCubicBezier(1, 0.25, 0.1, 0.25, 1.0)).toBe(1);
    expect(sampleCubicBezier(1.5, 0.25, 0.1, 0.25, 1.0)).toBe(1);
  });
});

describe("applyEasing", () => {
  it("evaluates linear mode across boundary and internal frames", () => {
    expect(applyEasing(-0.5, "linear")).toBe(0);
    expect(applyEasing(0, "linear")).toBe(0);
    expect(applyEasing(0.35, "linear")).toBe(0.35);
    expect(applyEasing(0.7, "linear")).toBe(0.7);
    expect(applyEasing(1, "linear")).toBe(1);
    expect(applyEasing(1.5, "linear")).toBe(1);
  });

  it("evaluates ease-in-out mode with smooth inflection", () => {
    expect(applyEasing(0, "ease-in-out")).toBe(0);
    expect(applyEasing(0.5, "ease-in-out")).toBeCloseTo(0.5, 3);
    expect(applyEasing(1, "ease-in-out")).toBe(1);
    // S-curve monotonic growth
    expect(applyEasing(0.25, "ease-in-out")).toBeLessThan(0.25);
    expect(applyEasing(0.75, "ease-in-out")).toBeGreaterThan(0.75);
  });

  it("evaluates spring mode with boundary pinning and characteristic overshoot", () => {
    expect(applyEasing(0, "spring")).toBe(0);
    expect(applyEasing(1, "spring")).toBe(1);

    // Spring formula: 1 - exp(-6*t)*cos(9*t).
    // Test that overshoot occurs (> 1.0) around t ≈ 0.35 - 0.45
    const midValues = [0.3, 0.35, 0.4, 0.45].map((t) => applyEasing(t, "spring"));
    const maxVal = Math.max(...midValues);
    expect(maxVal).toBeGreaterThan(1.0);
  });

  it("evaluates custom bezier curve mode with custom or fallback parameters", () => {
    // Custom linear-like curve
    expect(applyEasing(0.4, "custom", [0, 0, 1, 1])).toBeCloseTo(0.4, 4);

    // Custom ease curve [0.25, 0.1, 0.25, 1.0]
    expect(applyEasing(0, "custom", [0.25, 0.1, 0.25, 1.0])).toBe(0);
    expect(applyEasing(1, "custom", [0.25, 0.1, 0.25, 1.0])).toBe(1);
    expect(applyEasing(0.5, "custom", [0.25, 0.1, 0.25, 1.0])).toBeCloseTo(0.802, 2);
  });
});

describe("sampleBlock (each of the 9 presets)", () => {
  const baseTransform = {
    x: 200,
    y: 150,
    width: 100,
    height: 100,
    rotation: 0,
    depth: 0,
  };
  const baseOpacity = 1.0;

  const makePresetBlock = (preset: any): AnimationBlock => ({
    id: `block-${preset}`,
    sceneId: "s1",
    layerId: "layer-1",
    preset,
    startFrame: 0,
    endFrame: 40,
    easing: "linear",
  });

  it("1. fade-in: start=0 opacity, midpoint=0.5 opacity, end=1.0 opacity", () => {
    const block = makePresetBlock("fade-in");
    expect(sampleBlock(block, 0, baseTransform, baseOpacity).opacity).toBe(0);
    expect(sampleBlock(block, 20, baseTransform, baseOpacity).opacity).toBeCloseTo(0.5, 4);
    expect(sampleBlock(block, 40, baseTransform, baseOpacity).opacity).toBe(1);
  });

  it("2. fade-out: start=1.0 opacity, midpoint=0.5 opacity, end=0 opacity", () => {
    const block = makePresetBlock("fade-out");
    expect(sampleBlock(block, 0, baseTransform, baseOpacity).opacity).toBe(1);
    expect(sampleBlock(block, 20, baseTransform, baseOpacity).opacity).toBeCloseTo(0.5, 4);
    expect(sampleBlock(block, 40, baseTransform, baseOpacity).opacity).toBe(0);
  });

  it("3. slide-in-left: slides from x-240 to x", () => {
    const block = makePresetBlock("slide-in-left");
    expect(sampleBlock(block, 0, baseTransform).transform.x).toBe(baseTransform.x - 240);
    expect(sampleBlock(block, 20, baseTransform).transform.x).toBe(baseTransform.x - 120);
    expect(sampleBlock(block, 40, baseTransform).transform.x).toBe(baseTransform.x);
  });

  it("4. slide-in-right: slides from x+240 to x", () => {
    const block = makePresetBlock("slide-in-right");
    expect(sampleBlock(block, 0, baseTransform).transform.x).toBe(baseTransform.x + 240);
    expect(sampleBlock(block, 20, baseTransform).transform.x).toBe(baseTransform.x + 120);
    expect(sampleBlock(block, 40, baseTransform).transform.x).toBe(baseTransform.x);
  });

  it("5. slide-in-up: slides from y+200 upwards to y", () => {
    const block = makePresetBlock("slide-in-up");
    expect(sampleBlock(block, 0, baseTransform).transform.y).toBe(baseTransform.y + 200);
    expect(sampleBlock(block, 20, baseTransform).transform.y).toBe(baseTransform.y + 100);
    expect(sampleBlock(block, 40, baseTransform).transform.y).toBe(baseTransform.y);
  });

  it("6. slide-in-down: slides from y-200 downwards to y", () => {
    const block = makePresetBlock("slide-in-down");
    expect(sampleBlock(block, 0, baseTransform).transform.y).toBe(baseTransform.y - 200);
    expect(sampleBlock(block, 20, baseTransform).transform.y).toBe(baseTransform.y - 100);
    expect(sampleBlock(block, 40, baseTransform).transform.y).toBe(baseTransform.y);
  });

  it("7. scale-in: zooms up from 50% to 100% while staying centered", () => {
    const block = makePresetBlock("scale-in");
    // Start (s = 0.5): width = 50, height = 50, centered at cx=250, cy=200 -> x=225, y=175
    const start = sampleBlock(block, 0, baseTransform);
    expect(start.transform.width).toBe(50);
    expect(start.transform.height).toBe(50);
    expect(start.transform.x).toBe(225);
    expect(start.transform.y).toBe(175);

    // Midpoint (s = 0.75): width = 75, height = 75 -> x=212.5, y=162.5
    const mid = sampleBlock(block, 20, baseTransform);
    expect(mid.transform.width).toBeCloseTo(75, 4);
    expect(mid.transform.height).toBeCloseTo(75, 4);
    expect(mid.transform.x).toBeCloseTo(212.5, 4);
    expect(mid.transform.y).toBeCloseTo(162.5, 4);

    // End (s = 1.0): width = 100, height = 100 -> x=200, y=150
    const end = sampleBlock(block, 40, baseTransform);
    expect(end.transform.width).toBe(100);
    expect(end.transform.height).toBe(100);
    expect(end.transform.x).toBe(200);
    expect(end.transform.y).toBe(150);
  });

  it("8. scale-out: shrinks from 100% to 40% while fading opacity to 0", () => {
    const block = makePresetBlock("scale-out");
    // Start (s = 1.0): width = 100, height = 100, opacity = 1
    const start = sampleBlock(block, 0, baseTransform, baseOpacity);
    expect(start.transform.width).toBe(100);
    expect(start.transform.height).toBe(100);
    expect(start.transform.x).toBe(200);
    expect(start.transform.y).toBe(150);
    expect(start.opacity).toBe(1);

    // Midpoint (s = 0.7): width = 70, height = 70 -> x=215, y=165, opacity = 0.5
    const mid = sampleBlock(block, 20, baseTransform, baseOpacity);
    expect(mid.transform.width).toBeCloseTo(70, 4);
    expect(mid.transform.height).toBeCloseTo(70, 4);
    expect(mid.transform.x).toBeCloseTo(215, 4);
    expect(mid.transform.y).toBeCloseTo(165, 4);
    expect(mid.opacity).toBeCloseTo(0.5, 4);

    // End (s = 0.4): width = 40, height = 40 -> x=230, y=180, opacity = 0
    const end = sampleBlock(block, 40, baseTransform, baseOpacity);
    expect(end.transform.width).toBeCloseTo(40, 4);
    expect(end.transform.height).toBeCloseTo(40, 4);
    expect(end.transform.x).toBeCloseTo(230, 4);
    expect(end.transform.y).toBeCloseTo(180, 4);
    expect(end.opacity).toBe(0);
  });

  it("9. camera-move: leaves layer transform unchanged", () => {
    const block = makePresetBlock("camera-move");
    const res = sampleBlock(block, 20, baseTransform, baseOpacity);
    expect(res.transform).toEqual({});
    expect(res.opacity).toBeUndefined();
  });
});

describe("projectLayer and focalLength", () => {
  it("computes focalLength from fov and canvasHeight", () => {
    const h = 1080;
    // fov = 60°: f = 540 / tan(30°) = 540 * sqrt(3) ≈ 935.307
    const f60 = focalLength(60, h);
    expect(f60).toBeCloseTo(935.307, 2);

    // fov = 90°: f = 540 / tan(45°) = 540
    const f90 = focalLength(90, h);
    expect(f90).toBeCloseTo(540, 2);

    // Wider fov yields shorter focal length (more dramatic perspective)
    expect(f90).toBeLessThan(f60);
  });

  it("verifies scale=1.0 at depth=0 and camera.z=0", () => {
    const layer = createBaseLayer({
      transform: { x: 500, y: 300, width: 100, height: 100, rotation: 0, depth: 0 },
    });
    const ctx = {
      camera: createBaseCamera({ x: 0, y: 0, z: 0, fov: 60 }),
      canvasWidth: 1920,
      canvasHeight: 1080,
    };

    const proj = projectLayer(layer, ctx);
    expect(proj.scale).toBe(1.0);
    // At scale=1.0 and camera=(0,0,0), projected x and y match layer x and y exactly
    expect(proj.x).toBe(500);
    expect(proj.y).toBe(300);
  });

  it("verifies correct scale direction for push-in (camera.z > 0) vs push-out (camera.z < 0)", () => {
    const layer = createBaseLayer({
      transform: { x: 960, y: 540, width: 100, height: 100, rotation: 0, depth: 0 },
    });

    // Push-in: camera moves closer (+z)
    const ctxPushIn = {
      camera: createBaseCamera({ x: 0, y: 0, z: 200, fov: 60 }),
      canvasWidth: 1920,
      canvasHeight: 1080,
    };
    const projIn = projectLayer(layer, ctxPushIn);
    expect(projIn.scale).toBeGreaterThan(1.0);

    // Push-out: camera moves farther (-z)
    const ctxPushOut = {
      camera: createBaseCamera({ x: 0, y: 0, z: -200, fov: 60 }),
      canvasWidth: 1920,
      canvasHeight: 1080,
    };
    const projOut = projectLayer(layer, ctxPushOut);
    expect(projOut.scale).toBeLessThan(1.0);
  });

  it("verifies depth behavior: layer behind (depth > 0) is smaller; layer in front (depth < 0) is larger", () => {
    const backLayer = createBaseLayer({
      transform: { x: 960, y: 540, width: 100, height: 100, rotation: 0, depth: 400 },
    });
    const frontLayer = createBaseLayer({
      transform: { x: 960, y: 540, width: 100, height: 100, rotation: 0, depth: -400 },
    });
    const ctx = {
      camera: createBaseCamera({ x: 0, y: 0, z: 0, fov: 60 }),
      canvasWidth: 1920,
      canvasHeight: 1080,
    };

    const projBack = projectLayer(backLayer, ctx);
    const projFront = projectLayer(frontLayer, ctx);

    expect(projBack.scale).toBeLessThan(1.0);
    expect(projFront.scale).toBeGreaterThan(1.0);
  });

  it("verifies parallax shift with camera pan", () => {
    const layer = createBaseLayer({
      transform: { x: 1000, y: 540, width: 100, height: 100, rotation: 0, depth: 0 },
    });
    // Camera panned right by 100px (x=100) -> layer appears to shift left
    const ctx = {
      camera: createBaseCamera({ x: 100, y: 0, z: 0, fov: 60 }),
      canvasWidth: 1920,
      canvasHeight: 1080,
    };

    const proj = projectLayer(layer, ctx);
    // Shift is exactly -100px when scale=1.0
    expect(proj.x).toBe(900);
  });

  it("clamps distance at extreme push-in to prevent divide-by-zero or inversion", () => {
    const layer = createBaseLayer({
      transform: { x: 960, y: 540, width: 100, height: 100, rotation: 0, depth: 0 },
    });
    // Camera pushed in far past focal plane
    const ctx = {
      camera: createBaseCamera({ x: 0, y: 0, z: 5000, fov: 60 }),
      canvasWidth: 1920,
      canvasHeight: 1080,
    };

    const proj = projectLayer(layer, ctx);
    expect(Number.isFinite(proj.scale)).toBe(true);
    expect(proj.scale).toBeGreaterThan(0);
    // Should be clamped to 1 / 0.05 = 20
    expect(proj.scale).toBeCloseTo(20, 2);
  });
});

describe("dofBlurPx", () => {
  it("returns 0px blur when layer depth equals camera focusDistance", () => {
    const layer = createBaseLayer({ transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, depth: 1000 } });
    const camera = createBaseCamera({ focusDistance: 1000 });
    expect(dofBlurPx(layer, camera)).toBe(0);
  });

  it("scales blur linearly with distance from focusDistance", () => {
    const camera = createBaseCamera({ focusDistance: 1000 });
    // 200 units away from focus: 200 / 40 = 5px blur
    const layerBehind = createBaseLayer({ transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, depth: 1200 } });
    const layerInFront = createBaseLayer({ transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, depth: 800 } });

    expect(dofBlurPx(layerBehind, camera)).toBe(5);
    expect(dofBlurPx(layerInFront, camera)).toBe(5);
  });

  it("clamps blur at extreme distances to maxBlur (default 12px)", () => {
    const camera = createBaseCamera({ focusDistance: 1000 });
    // Very far back: depth = 4000 (distance = 3000 -> 3000/40 = 75px -> clamped to 12)
    const farLayer = createBaseLayer({ transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, depth: 4000 } });
    expect(dofBlurPx(farLayer, camera)).toBe(12);

    // Negative extreme depth: depth = -2000 (distance = 3000 -> clamped to 12)
    const negLayer = createBaseLayer({ transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, depth: -2000 } });
    expect(dofBlurPx(negLayer, camera)).toBe(12);
  });

  it("respects custom maxBlur parameter", () => {
    const camera = createBaseCamera({ focusDistance: 1000 });
    const farLayer = createBaseLayer({ transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, depth: 4000 } });
    expect(dofBlurPx(farLayer, camera, 25)).toBe(25);
  });
});
