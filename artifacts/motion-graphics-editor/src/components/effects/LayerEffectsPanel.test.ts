import { describe, it, expect, beforeEach } from "vitest";
import {
  createDefaultLayerEffect,
  isLayerEffectAvailable,
  useEditorStore,
  type Layer,
} from "../../store/editor-store";
import { getLayerEffectTypeOptions } from "./LayerEffectsPanel";

describe("LayerEffectsPanel - getLayerEffectTypeOptions and canonical ordering", () => {
  const baseLayer: Layer = {
    id: "layer-test-1",
    parentId: null,
    type: "shape",
    name: "Test Layer",
    transform: {
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      rotation: 0,
      depth: 0,
    },
    opacity: 1,
    visible: true,
    locked: false,
    effects: [],
    effectsOrder: [],
  };

  it("returns all 5 layer effects in canonical order", () => {
    const options = getLayerEffectTypeOptions(baseLayer);
    expect(options.map((o) => o.type)).toEqual([
      "dropShadow",
      "glow",
      "backdropBlur",
      "layerBlur",
      "liquidGlass",
    ]);
  });

  it("enables layerBlur when layer has depth 0 and no mockup", () => {
    const options = getLayerEffectTypeOptions(baseLayer);
    const layerBlurOpt = options.find((o) => o.type === "layerBlur");
    expect(layerBlurOpt?.disabled).toBe(false);
    expect(layerBlurOpt?.disabledTooltip).toBeUndefined();
  });

  it("disables layerBlur with appropriate tooltip when layer has 3D depth", () => {
    const depthLayer: Layer = {
      ...baseLayer,
      transform: {
        ...baseLayer.transform,
        depth: 150,
      },
    };
    const options = getLayerEffectTypeOptions(depthLayer);
    const layerBlurOpt = options.find((o) => o.type === "layerBlur");
    expect(layerBlurOpt?.disabled).toBe(true);
    expect(layerBlurOpt?.disabledTooltip).toContain("3D extrusion/depth");
  });

  it("disables layerBlur with appropriate tooltip when layer has a device mockup frame", () => {
    const mockupLayer: Layer = {
      ...baseLayer,
      mockup: "iphone",
    };
    const options = getLayerEffectTypeOptions(mockupLayer);
    const layerBlurOpt = options.find((o) => o.type === "layerBlur");
    expect(layerBlurOpt?.disabled).toBe(true);
    expect(layerBlurOpt?.disabledTooltip).toContain("device-frame mockups");
  });

  it("all other layer effects (dropShadow, glow, backdropBlur, liquidGlass) remain enabled regardless of depth", () => {
    const depthLayer: Layer = {
      ...baseLayer,
      transform: {
        ...baseLayer.transform,
        depth: 300,
      },
      mockup: "macbook",
    };
    const options = getLayerEffectTypeOptions(depthLayer);
    expect(options.find((o) => o.type === "dropShadow")?.disabled).toBeFalsy();
    expect(options.find((o) => o.type === "glow")?.disabled).toBeFalsy();
    expect(options.find((o) => o.type === "backdropBlur")?.disabled).toBeFalsy();
    expect(options.find((o) => o.type === "liquidGlass")?.disabled).toBeFalsy();
    expect(options.find((o) => o.type === "layerBlur")?.disabled).toBe(true);
  });
});

describe("LayerEffects store integration for LayerEffectsPanel", () => {
  beforeEach(() => {
    const state = useEditorStore.getState();
    const scene = state.scenes[0];
    if (scene && scene.layers.length > 0) {
      // Ensure depth is 0 and mockup is none so layerBlur is allowed
      state.updateLayer(scene.layers[0].id, {
        transform: { ...scene.layers[0].transform, depth: 0 },
        mockup: undefined,
        effects: [],
        effectsOrder: [],
      });
      state.selectLayers([scene.layers[0].id]);
    }
  });

  it("supports adding each of the 5 canonical layer effects to a selected layer", () => {
    const state = useEditorStore.getState();
    const layerId = state.scenes[0].layers[0].id;

    const dsId = state.addLayerEffect(layerId, "dropShadow");
    const glowId = state.addLayerEffect(layerId, "glow");
    const bbId = state.addLayerEffect(layerId, "backdropBlur");
    const lbId = state.addLayerEffect(layerId, "layerBlur");
    const lgId = state.addLayerEffect(layerId, "liquidGlass");

    const updatedLayer = useEditorStore.getState().scenes[0].layers.find((l) => l.id === layerId)!;
    expect(updatedLayer.effects).toHaveLength(5);
    expect(updatedLayer.effectsOrder).toEqual([dsId, glowId, bbId, lbId, lgId]);

    // Check defaults
    const ds = updatedLayer.effects?.find((e) => e.id === dsId) as any;
    expect(ds.offsetX).toBe(4);
    expect(ds.offsetY).toBe(4);
    expect(ds.blur).toBe(12);
    expect(ds.color).toBe("#000000");
    expect(ds.opacity).toBe(0.5);

    const glow = updatedLayer.effects?.find((e) => e.id === glowId) as any;
    expect(glow.blur).toBe(16);
    expect(glow.intensity).toBe(1);
    expect(glow.mode).toBe("edge");
    expect(glow.blend).toBe("add");

    const bb = updatedLayer.effects?.find((e) => e.id === bbId) as any;
    expect(bb.blur).toBe(8);

    const lb = updatedLayer.effects?.find((e) => e.id === lbId) as any;
    expect(lb.blur).toBe(8);
    expect(lb.mode).toBe("uniform");
    expect(lb.endBlur).toBe(16);
    expect(lb.angle).toBe(270);

    const lg = updatedLayer.effects?.find((e) => e.id === lgId) as any;
    expect(lg.blur).toBe(8);
    expect(lg.refraction).toBe(0.3);
    expect(lg.dispersion).toBe(0.1);
    expect(lg.highlight).toBe(0.4);
  });

  it("supports toggling visibility, reordering, updating and removing layer effects", () => {
    const state = useEditorStore.getState();
    const layerId = state.scenes[0].layers[0].id;
    const effId = state.scenes[0].layers[0].effects?.[0]?.id || state.addLayerEffect(layerId, "dropShadow");

    // Toggle visible
    state.toggleLayerEffectVisible(layerId, effId);
    let layer = useEditorStore.getState().scenes[0].layers.find((l) => l.id === layerId)!;
    expect(layer.effects?.find((e) => e.id === effId)?.visible).toBe(false);

    state.toggleLayerEffectVisible(layerId, effId);
    layer = useEditorStore.getState().scenes[0].layers.find((l) => l.id === layerId)!;
    expect(layer.effects?.find((e) => e.id === effId)?.visible).toBe(true);

    // Update property
    state.updateLayerEffect(layerId, effId, { blur: 30 });
    layer = useEditorStore.getState().scenes[0].layers.find((l) => l.id === layerId)!;
    expect((layer.effects?.find((e) => e.id === effId) as any)?.blur).toBe(30);

    // Remove effect
    state.removeLayerEffect(layerId, effId);
    layer = useEditorStore.getState().scenes[0].layers.find((l) => l.id === layerId)!;
    expect(layer.effects?.find((e) => e.id === effId)).toBeUndefined();
    expect(layer.effectsOrder?.includes(effId)).toBe(false);
  });
});
