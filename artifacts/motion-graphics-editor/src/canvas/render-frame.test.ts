import { describe, it, expect, vi } from "vitest";
import {
  computeComposedRenderedLayer,
  getScreenTransform,
  renderSceneFrame,
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
