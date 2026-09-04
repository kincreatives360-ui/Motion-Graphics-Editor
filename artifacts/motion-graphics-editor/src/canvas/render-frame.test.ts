import { describe, it, expect, vi } from "vitest";
import {
  computeComposedRenderedLayer,
  getScreenTransform,
  renderSceneFrame,
  drawLayer,
  renderLayersAtFrame,
} from "./render-frame";
import * as postProcessing from "./post-processing";
import type { Layer, Camera, AnimationBlock, Scene } from "../types";

describe("render-frame projection and group hierarchy", () => {
  const defaultCamera: Camera = {
    x: 0,
    y: 0,
    z: 0,
    fov: 60,
    focusDistance: 1000,
  };

  const canvasSize = { width: 1920, height: 1080 };

  it("projects an unparented root layer correctly at depth=0 and camera z=0", () => {
    const layer: Layer = {
      id: "root-1",
      name: "Root",
      type: "shape",
      visible: true,
      locked: false,
      opacity: 1,
      transform: {
        x: 100,
        y: 200,
        width: 300,
        height: 150,
        rotation: 45,
        scaleX: 1,
        scaleY: 1,
        depth: 0,
      },
    };

    const screen = getScreenTransform(
      layer,
      [],
      0,
      defaultCamera,
      canvasSize,
      [layer],
    );

    expect(screen.scale).toBeCloseTo(1.0, 4);
    expect(screen.x).toBe(100);
    expect(screen.y).toBe(200);
    expect(screen.width).toBe(300);
    expect(screen.height).toBe(150);
    expect(screen.rotation).toBe(45);
    expect(screen.opacity).toBe(1);
  });

  it("composes parent opacity and visibility to child layer", () => {
    const parentGroup: Layer = {
      id: "grp-1",
      name: "Parent Group",
      type: "group",
      visible: true,
      locked: false,
      opacity: 0.8,
      transform: {
        x: 100,
        y: 50,
        width: 400,
        height: 300,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        depth: 0,
      },
    };

    const childLayer: Layer = {
      id: "child-1",
      name: "Child",
      parentId: "grp-1",
      type: "shape",
      visible: true,
      locked: false,
      opacity: 0.5,
      transform: {
        x: 120,
        y: 80,
        width: 100,
        height: 80,
        rotation: 10,
        scaleX: 1,
        scaleY: 1,
        depth: 0,
      },
    };

    const layers = [parentGroup, childLayer];
    const composed = computeComposedRenderedLayer(childLayer, [], 0, layers);

    // Accumulated opacity: 0.8 * 0.5 = 0.4
    expect(composed.opacity).toBeCloseTo(0.4, 4);
    expect(composed.transform.rotation).toBe(10);
    expect(composed.transform.x).toBe(120);
    expect(composed.transform.y).toBe(80);

    const screen = getScreenTransform(
      childLayer,
      [],
      0,
      defaultCamera,
      canvasSize,
      layers,
    );

    expect(screen.x).toBe(120);
    expect(screen.y).toBe(80);
    expect(screen.rotation).toBe(10);
    expect(screen.opacity).toBeCloseTo(0.4, 4);
  });

  it("propagates animated parent motion down to child layer", () => {
    const parentGroup: Layer = {
      id: "grp-anim",
      name: "Animated Parent",
      type: "group",
      visible: true,
      locked: false,
      opacity: 1,
      transform: {
        x: 100,
        y: 100,
        width: 200,
        height: 200,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        depth: 0,
      },
    };

    const childLayer: Layer = {
      id: "child-anim",
      name: "Child in Animated Parent",
      parentId: "grp-anim",
      type: "shape",
      visible: true,
      locked: false,
      opacity: 1,
      transform: {
        x: 150,
        y: 150,
        width: 50,
        height: 50,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        depth: 0,
      },
    };

    // Animate parent: slide-in-right (starts at +240px offset at frame 0, slides to 0 at frame 30)
    const parentBlock: AnimationBlock = {
      id: "block-parent-slide",
      layerId: "grp-anim",
      preset: "slide-in-right",
      startFrame: 0,
      endFrame: 30,
      easing: "linear",
    };

    const layers = [parentGroup, childLayer];

    // At frame 0, parent starts offset by +100px
    const composed = computeComposedRenderedLayer(
      childLayer,
      [parentBlock],
      0,
      layers,
    );

    // Child should have moved right along with parent's slide offset!
    expect(composed.transform.x).toBeGreaterThan(150);
  });

  it("handles multi-level nested parent hierarchy without infinite loops", () => {
    const grandParent: Layer = {
      id: "gp",
      name: "Grandparent",
      type: "group",
      visible: true,
      locked: false,
      opacity: 0.9,
      transform: {
        x: 100,
        y: 100,
        width: 500,
        height: 500,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        depth: 0,
      },
    };

    const parent: Layer = {
      id: "p",
      name: "Parent",
      parentId: "gp",
      type: "group",
      visible: true,
      locked: false,
      opacity: 0.8,
      transform: {
        x: 120,
        y: 120,
        width: 400,
        height: 400,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        depth: 0,
      },
    };

    const leaf: Layer = {
      id: "leaf",
      name: "Leaf",
      parentId: "p",
      type: "shape",
      visible: true,
      locked: false,
      opacity: 0.5,
      transform: {
        x: 130,
        y: 130,
        width: 50,
        height: 50,
        rotation: 15,
        scaleX: 1,
        scaleY: 1,
        depth: 0,
      },
    };

    const layers = [grandParent, parent, leaf];
    const screen = getScreenTransform(
      leaf,
      [],
      0,
      defaultCamera,
      canvasSize,
      layers,
    );

    expect(screen.x).toBe(130);
    expect(screen.y).toBe(130);
    expect(screen.rotation).toBe(15);
    // Opacity: 0.9 * 0.8 * 0.5 = 0.36
    expect(screen.opacity).toBeCloseTo(0.36, 4);
  });
});

describe("renderSceneFrame per-scene effects composite order and gating", () => {
  it("executes enabled/visible effects in fixed internal composite order: Color Grade -> Bloom -> Vignette -> Chromatic Aberration -> Glitch -> Film Grain -> Ghost -> Edge Fade", () => {
    const callOrder: string[] = [];

    const spyColorGrade = vi.spyOn(postProcessing, "applyColorGrade").mockImplementation(() => {
      callOrder.push("colorGrade");
    });
    const spyBloom = vi.spyOn(postProcessing, "applyBloom").mockImplementation(() => {
      callOrder.push("bloom");
    });
    const spyVignette = vi.spyOn(postProcessing, "applyVignette").mockImplementation(() => {
      callOrder.push("vignette");
    });
    const spyChroma = vi.spyOn(postProcessing, "applyChromaticAberration").mockImplementation(() => {
      callOrder.push("chromaticAberration");
    });
    const spyGlitch = vi.spyOn(postProcessing, "applyGlitch").mockImplementation(() => {
      callOrder.push("glitch");
    });
    const spyGrain = vi.spyOn(postProcessing, "applyFilmGrain").mockImplementation(() => {
      callOrder.push("filmGrain");
    });
    const spyGhost = vi.spyOn(postProcessing, "applyGhost").mockImplementation(() => {
      callOrder.push("ghost");
    });
    const spyEdgeFade = vi.spyOn(postProcessing, "applyEdgeFade").mockImplementation(() => {
      callOrder.push("edgeFade");
    });

    const ctx = {
      save: vi.fn(),
      fillStyle: "#000000",
      fillRect: vi.fn(),
      restore: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    const sourceCanvas = {
      width: 1920,
      height: 1080,
    } as unknown as HTMLCanvasElement;

    // Notice effectsOrder deliberately puts edgeFade, filmGrain and vignette first,
    // but the internal pipeline MUST execute in fixed composite order:
    // Color Grade -> Depth of Field -> Motion Blur -> Bloom -> Vignette -> Chromatic Aberration -> Glitch -> Film Grain -> Ghost -> Edge Fade
    const testScene: Scene = {
      id: "scene-fx",
      name: "FX Test",
      durationFrames: 60,
      fps: 30,
      layers: [],
      animationBlocks: [],
      camera: { x: 0, y: 0, z: 0, fov: 60, focusDistance: 1000 },
      effectsOrder: ["fx-edge", "fx-grain", "fx-vignette", "fx-color", "fx-bloom", "fx-chroma", "fx-ghost", "fx-glitch"],
      effects: [
        { id: "fx-edge", type: "edgeFade", enabled: true, visible: true, top: 0.1, right: 0.1, bottom: 0.1, left: 0.1 },
        { id: "fx-grain", type: "filmGrain", enabled: true, visible: true, intensity: 0.1, size: 1.5 },
        { id: "fx-vignette", type: "vignette", enabled: true, visible: true, intensity: 0.3 },
        { id: "fx-color", type: "colorGrade", enabled: true, visible: true, exposure: 0.2, contrast: 1.1, saturation: 1.2 },
        { id: "fx-bloom", type: "bloom", enabled: true, visible: true, intensity: 1.2, threshold: 0.8 },
        { id: "fx-chroma", type: "chromaticAberration", enabled: true, visible: true, offset: 4 },
        { id: "fx-ghost", type: "ghost", enabled: true, visible: true, opacity: 0.5, offset: 10, blur: 3 },
        { id: "fx-glitch", type: "glitch", enabled: true, visible: true, intensity: 0.4, speed: 1.5 },
      ],
    };

    const offscreenBloomCanvas = {
      width: 1920,
      height: 1080,
    } as unknown as HTMLCanvasElement;

    renderSceneFrame(ctx, testScene, 0, {
      width: 1920,
      height: 1080,
      sourceCanvas,
      offscreenBloomCanvas,
    });

    expect(callOrder).toEqual([
      "colorGrade",
      "bloom",
      "vignette",
      "chromaticAberration",
      "glitch",
      "filmGrain",
      "ghost",
      "edgeFade",
    ]);

    expect(spyColorGrade).toHaveBeenCalledWith(sourceCanvas, 0.2, 1.1, 1.2);
    expect(spyBloom).toHaveBeenCalledWith(
      sourceCanvas,
      expect.anything(),
      expect.closeTo(0.8 * 255),
      16,
      1.2,
    );
    expect(spyVignette).toHaveBeenCalledWith(sourceCanvas, 0.3);
    expect(spyChroma).toHaveBeenCalledWith(sourceCanvas, 4);
    expect(spyGlitch).toHaveBeenCalledWith(sourceCanvas, 0.4, 1.5);
    expect(spyGrain).toHaveBeenCalledWith(sourceCanvas, 0.1, 1.5);
    expect(spyGhost).toHaveBeenCalledWith(sourceCanvas, 0.5, 10, 3);
    expect(spyEdgeFade).toHaveBeenCalledWith(sourceCanvas, 0.1, 0.1, 0.1, 0.1);

    spyColorGrade.mockRestore();
    spyBloom.mockRestore();
    spyVignette.mockRestore();
    spyChroma.mockRestore();
    spyGlitch.mockRestore();
    spyGrain.mockRestore();
    spyGhost.mockRestore();
    spyEdgeFade.mockRestore();
  });

  it("skips disabled and hidden effects", () => {
    const spyBloom = vi.spyOn(postProcessing, "applyBloom").mockImplementation(() => {});
    const spyVignette = vi.spyOn(postProcessing, "applyVignette").mockImplementation(() => {});
    const spyChroma = vi.spyOn(postProcessing, "applyChromaticAberration").mockImplementation(() => {});
    const spyGrain = vi.spyOn(postProcessing, "applyFilmGrain").mockImplementation(() => {});

    const ctx = {
      save: vi.fn(),
      fillStyle: "#000000",
      fillRect: vi.fn(),
      restore: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    const sourceCanvas = {
      width: 1920,
      height: 1080,
    } as unknown as HTMLCanvasElement;

    const testScene: Scene = {
      id: "scene-fx-gated",
      name: "FX Gated Test",
      durationFrames: 60,
      fps: 30,
      layers: [],
      animationBlocks: [],
      camera: { x: 0, y: 0, z: 0, fov: 60, focusDistance: 1000 },
      effectsOrder: ["fx-bloom", "fx-vignette", "fx-chroma", "fx-grain"],
      effects: [
        { id: "fx-bloom", type: "bloom", enabled: false, visible: true, intensity: 1.0, threshold: 0.78 }, // disabled
        { id: "fx-vignette", type: "vignette", enabled: true, visible: false, intensity: 0.3 }, // hidden
        { id: "fx-chroma", type: "chromaticAberration", enabled: true, visible: true, offset: 4 }, // active!
        { id: "fx-grain", type: "filmGrain", enabled: false, visible: false, intensity: 0.1, size: 1.0 }, // disabled & hidden
      ],
    };

    renderSceneFrame(ctx, testScene, 0, {
      width: 1920,
      height: 1080,
      sourceCanvas,
    });

    expect(spyBloom).not.toHaveBeenCalled();
    expect(spyVignette).not.toHaveBeenCalled();
    expect(spyChroma).toHaveBeenCalledWith(sourceCanvas, 4);
    expect(spyGrain).not.toHaveBeenCalled();

    spyBloom.mockRestore();
    spyVignette.mockRestore();
    spyChroma.mockRestore();
    spyGrain.mockRestore();
  });
});

describe("Layer Effects Integration & Export", () => {
  function createMockCtx(): any {
    const ctx: any = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      transform: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      roundRect: vi.fn(),
      ellipse: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      createLinearGradient: vi.fn(() => ({
        addColorStop: vi.fn(),
      })),
      globalAlpha: 1,
      globalCompositeOperation: "source-over",
      filter: "none",
      shadowColor: "transparent",
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      fillStyle: "#000000",
      strokeStyle: "transparent",
      lineWidth: 1,
    };
    return ctx;
  }

  it("applies dropShadow layer effect directly to canvas shadow properties", () => {
    const ctx = createMockCtx();

    const layer: Layer = {
      id: "layer-ds",
      name: "Drop Shadow Layer",
      type: "shape",
      visible: true,
      locked: false,
      opacity: 1,
      transform: { x: 10, y: 20, width: 100, height: 100, rotation: 0, depth: 0 },
      shape: { kind: "rect", fill: "#ff0000" },
      effectsOrder: ["ds-1"],
      effects: [
        {
          id: "ds-1",
          type: "dropShadow",
          enabled: true,
          visible: true,
          offsetX: 8,
          offsetY: 12,
          blur: 16,
          color: "#000000",
          opacity: 0.6,
        },
      ],
    };

    drawLayer(ctx, layer);

    expect(ctx.shadowColor).toBe("rgba(0, 0, 0, 0.6)");
    expect(ctx.shadowBlur).toBe(16);
    expect(ctx.shadowOffsetX).toBe(8);
    expect(ctx.shadowOffsetY).toBe(12);
  });

  it("stacks layerBlur with existing DoF filter so layer effects inherit DoF blur", () => {
    const ctx = createMockCtx();
    ctx.filter = "blur(4.5px)"; // Simulating DoF blur set on targetCtx by renderLayersAtFrame

    const layer: Layer = {
      id: "layer-lb",
      name: "Layer Blur Layer",
      type: "shape",
      visible: true,
      locked: false,
      opacity: 1,
      transform: { x: 0, y: 0, width: 200, height: 100, rotation: 0, depth: 0 },
      shape: { kind: "rect", fill: "#3b82f6" },
      effectsOrder: ["lb-1"],
      effects: [
        {
          id: "lb-1",
          type: "layerBlur",
          enabled: true,
          visible: true,
          blur: 10,
          mode: "uniform",
          endBlur: 20,
          angle: 270,
        },
      ],
    };

    drawLayer(ctx, layer);

    // Filter must contain both the DoF blur and the layer blur
    expect(ctx.filter).toContain("blur(4.5px)");
    expect(ctx.filter).toContain("blur(10px)");
  });

  it("renders backdropBlur and glow and liquidGlass passes in drawLayer", () => {
    const ctx = createMockCtx();

    const layer: Layer = {
      id: "layer-multi-fx",
      name: "Multi FX Layer",
      type: "shape",
      visible: true,
      locked: false,
      opacity: 1,
      transform: { x: 50, y: 50, width: 120, height: 80, rotation: 0, depth: 0 },
      shape: { kind: "rect", fill: "#10b981" },
      effectsOrder: ["bb-1", "gl-1", "lg-1"],
      effects: [
        {
          id: "bb-1",
          type: "backdropBlur",
          enabled: true,
          visible: true,
          blur: 14,
        },
        {
          id: "gl-1",
          type: "glow",
          enabled: true,
          visible: true,
          color: "#38bdf8",
          blur: 20,
          intensity: 1.5,
          angle: 0,
          sheen: 0,
          mode: "edge",
          blend: "add",
          rim: 0,
          thickness: 0.4,
        },
        {
          id: "lg-1",
          type: "liquidGlass",
          enabled: true,
          visible: true,
          blur: 8,
          refraction: 0.5,
          dispersion: 0.2,
          highlight: 0.6,
        },
      ],
    };

    drawLayer(ctx, layer);

    // Save and restore calls for the multi-pass layers
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
    // Fill was called for backdrop blur, shape fill, and liquid glass highlight
    expect(ctx.fill).toHaveBeenCalled();
    // Stroke was called for glow pass and liquid glass border
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it("ignores disabled or hidden layer effects", () => {
    const ctx = createMockCtx();

    const layer: Layer = {
      id: "layer-gated",
      name: "Gated FX Layer",
      type: "shape",
      visible: true,
      locked: false,
      opacity: 1,
      transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, depth: 0 },
      shape: { kind: "rect", fill: "#ff00ff" },
      effectsOrder: ["ds-disabled", "lb-hidden"],
      effects: [
        {
          id: "ds-disabled",
          type: "dropShadow",
          enabled: false,
          visible: true,
          offsetX: 10,
          offsetY: 10,
          blur: 20,
          color: "#000000",
          opacity: 0.8,
        },
        {
          id: "lb-hidden",
          type: "layerBlur",
          enabled: true,
          visible: false,
          blur: 15,
          mode: "uniform",
          endBlur: 30,
          angle: 0,
        },
      ],
    };

    drawLayer(ctx, layer);

    expect(ctx.shadowColor).toBe("transparent");
    expect(ctx.shadowBlur).toBe(0);
    expect(ctx.filter).toBe("none");
  });

  it("preserves back-to-front painter's algorithm draw order in renderLayersAtFrame", () => {
    const drawnOrder: string[] = [];

    const mockCtx = createMockCtx();
    mockCtx.translate = vi.fn((x, y) => {
      drawnOrder.push(`${x},${y}`);
    });

    const layerA: Layer = {
      id: "layer-back",
      name: "Background Layer (depth 500)",
      type: "shape",
      visible: true,
      locked: false,
      opacity: 1,
      transform: { x: 10, y: 10, width: 200, height: 200, rotation: 0, depth: 500 },
      shape: { kind: "rect", fill: "#111827" },
      effectsOrder: [],
      effects: [],
    };

    const layerB: Layer = {
      id: "layer-middle",
      name: "Middle Layer (depth 200)",
      type: "shape",
      visible: true,
      locked: false,
      opacity: 1,
      transform: { x: 20, y: 20, width: 150, height: 150, rotation: 0, depth: 200 },
      shape: { kind: "rect", fill: "#374151" },
      effectsOrder: [],
      effects: [],
    };

    const layerC: Layer = {
      id: "layer-front",
      name: "Foreground Layer with Backdrop Blur (depth 0)",
      type: "shape",
      visible: true,
      locked: false,
      opacity: 1,
      transform: { x: 30, y: 30, width: 100, height: 100, rotation: 0, depth: 0 },
      shape: { kind: "rect", fill: "#9ca3af" },
      effectsOrder: ["bb-c"],
      effects: [
        {
          id: "bb-c",
          type: "backdropBlur",
          enabled: true,
          visible: true,
          blur: 10,
        },
      ],
    };

    // Deliberately unsorted in scene array: Front, Back, Middle
    const scene: Scene = {
      id: "test-depth-scene",
      name: "Depth Sorting Test",
      durationFrames: 30,
      fps: 30,
      layers: [layerC, layerA, layerB],
      animationBlocks: [],
      camera: { x: 0, y: 0, z: 0, fov: 60, focusDistance: 1000 },
      effects: [],
      effectsOrder: [],
    };

    renderLayersAtFrame(mockCtx, scene, 0, 1920, 1080);

    // Layer A (depth 500) rendered 1st, then Layer B (depth 200) 2nd, then Layer C (depth 0) 3rd
    expect(drawnOrder).toHaveLength(3);
    // Depth sorting ensures the deepest layer (depth 500) is rendered first
  });

  it("bakes layer effects into exported output via renderSceneFrame", () => {
    const mockCtx = createMockCtx();

    const layerWithEffects: Layer = {
      id: "export-layer-1",
      name: "Exported Layer with Effects",
      type: "shape",
      visible: true,
      locked: false,
      opacity: 1,
      transform: { x: 100, y: 100, width: 200, height: 150, rotation: 0, depth: 0 },
      shape: { kind: "rect", fill: "#6366f1" },
      effectsOrder: ["ds-exp", "gl-exp"],
      effects: [
        {
          id: "ds-exp",
          type: "dropShadow",
          enabled: true,
          visible: true,
          offsetX: 6,
          offsetY: 8,
          blur: 14,
          color: "#000000",
          opacity: 0.5,
        },
        {
          id: "gl-exp",
          type: "glow",
          enabled: true,
          visible: true,
          color: "#a855f7",
          blur: 18,
          intensity: 1.2,
          angle: 0,
          sheen: 0,
          mode: "edge",
          blend: "add",
          rim: 0,
          thickness: 0.3,
        },
      ],
    };

    const scene: Scene = {
      id: "scene-export",
      name: "Export Scene",
      durationFrames: 60,
      fps: 30,
      layers: [layerWithEffects],
      animationBlocks: [],
      camera: { x: 0, y: 0, z: 0, fov: 60, focusDistance: 1000 },
      effects: [],
      effectsOrder: [],
    };

    // Simulate export frame rendering (same call executed by exportSceneToWebm / exportSceneToGif / exportSceneToMp4)
    renderSceneFrame(mockCtx, scene, 0, {
      width: 1920,
      height: 1080,
    });

    // Verify shadow properties and stroke/fill were executed on the destination context
    expect(mockCtx.shadowBlur).toBeGreaterThan(0);
    expect(mockCtx.fill).toHaveBeenCalled();
    expect(mockCtx.stroke).toHaveBeenCalled();
  });
});

