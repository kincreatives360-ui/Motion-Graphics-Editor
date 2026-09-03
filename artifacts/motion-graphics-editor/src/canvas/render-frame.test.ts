import { describe, it, expect } from "vitest";
import {
  computeComposedRenderedLayer,
  getScreenTransform,
} from "./render-frame";
import type { Layer, Camera, AnimationBlock } from "../types";

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
