import { describe, it, expect, beforeEach } from "vitest";
import {
  useEditorStore,
  useEditorUIStore,
  isLayerEffectAvailable,
  createDefaultLayerEffect,
  type Layer,
} from "./editor-store";

describe("Editor Stores Separation", () => {
  beforeEach(() => {
    // Reset document store
    useEditorStore.setState({
      projectName: "Test Project",
      aspectRatio: "16:9",
      activeSceneId: "scene-1",
      scenes: [
        {
          id: "scene-1",
          name: "Scene 1",
          durationFrames: 180,
          fps: 30,
          layers: [],
          animationBlocks: [],
          camera: { x: 0, y: 0, z: 0, fov: 60, focusDistance: 1000 },
          effects: [],
          effectsOrder: [],
        },
      ],
      selectedLayerIds: [],
      assets: [],
    });
    useEditorStore.temporal.getState().clear();

    // Reset UI store
    useEditorUIStore.setState({
      zoom: 100,
      pan: { x: 0, y: 0 },
      playing: false,
      currentFrame: 0,
      activeTool: "scene",
      presetsOpen: false,
      presetsTab: "animations",
      exportModalOpen: false,
      saveStatus: "saved",
    });
  });

  it("modifies document state and records history in temporal middleware", () => {
    const docStore = useEditorStore.getState();
    expect(useEditorStore.temporal.getState().pastStates.length).toBe(0);

    // Add a layer
    const newLayerId = docStore.addLayer("scene-1", {
      name: "New Rectangle",
      type: "shape",
    });

    expect(newLayerId).toBeDefined();
    expect(useEditorStore.getState().scenes[0].layers.length).toBe(1);
    expect(useEditorStore.temporal.getState().pastStates.length).toBeGreaterThan(0);

    // Undo should restore layers to empty
    useEditorStore.temporal.getState().undo();
    expect(useEditorStore.getState().scenes[0].layers.length).toBe(0);

    // Redo should restore the layer
    useEditorStore.temporal.getState().redo();
    expect(useEditorStore.getState().scenes[0].layers.length).toBe(1);
  });

  it("modifies UI state without polluting document temporal history", () => {
    expect(useEditorStore.temporal.getState().pastStates.length).toBe(0);

    const uiStore = useEditorUIStore.getState();
    uiStore.setZoom(150);
    uiStore.setPan({ x: 50, y: 50 });
    uiStore.setPlaying(true);
    uiStore.setCurrentFrame(45);
    uiStore.setActiveTool("hand");
    uiStore.openPresets("templates");
    uiStore.setExportModalOpen(true);
    uiStore.setSaveStatus("saving");

    // UI store values updated
    expect(useEditorUIStore.getState().zoom).toBe(150);
    expect(useEditorUIStore.getState().pan).toEqual({ x: 50, y: 50 });
    expect(useEditorUIStore.getState().playing).toBe(true);
    expect(useEditorUIStore.getState().currentFrame).toBe(45);
    expect(useEditorUIStore.getState().activeTool).toBe("hand");
    expect(useEditorUIStore.getState().presetsOpen).toBe(true);
    expect(useEditorUIStore.getState().presetsTab).toBe("templates");
    expect(useEditorUIStore.getState().exportModalOpen).toBe(true);
    expect(useEditorUIStore.getState().saveStatus).toBe("saving");

    // Document store temporal history should NOT have any recorded states from UI changes!
    expect(useEditorStore.temporal.getState().pastStates.length).toBe(0);
  });

  it("clamps currentFrame to activeScene durationFrames", () => {
    const uiStore = useEditorUIStore.getState();
    // Scene duration is 180
    uiStore.setCurrentFrame(250);
    expect(useEditorUIStore.getState().currentFrame).toBe(180);

    uiStore.setCurrentFrame(-20);
    expect(useEditorUIStore.getState().currentFrame).toBe(0);
  });

  describe("Per-Scene Effect Stack", () => {
    it("adds scene effects and updates effectsOrder", () => {
      const store = useEditorStore.getState();
      const bloomId = store.addSceneEffect("scene-1", "bloom");
      const vignetteId = store.addSceneEffect("scene-1", "vignette");

      const scene = useEditorStore.getState().scenes[0];
      expect(scene.effects.length).toBe(2);
      expect(scene.effectsOrder).toEqual([bloomId, vignetteId]);

      const bloomFx = scene.effects.find((e) => e.id === bloomId);
      expect(bloomFx?.type).toBe("bloom");
      expect(bloomFx?.enabled).toBe(true);
      expect(bloomFx?.visible).toBe(true);
      if (bloomFx && bloomFx.type === "bloom") {
        expect(bloomFx.intensity).toBe(1.0);
        expect(bloomFx.threshold).toBeCloseTo(0.78);
      }
    });

    it("updates scene effect parameters", () => {
      const store = useEditorStore.getState();
      const grainId = store.addSceneEffect("scene-1", "filmGrain");

      store.updateSceneEffect("scene-1", grainId, {
        intensity: 0.25,
        size: 2.0,
      });

      const scene = useEditorStore.getState().scenes[0];
      const grainFx = scene.effects.find((e) => e.id === grainId);
      expect(grainFx).toBeDefined();
      if (grainFx && grainFx.type === "filmGrain") {
        expect(grainFx.intensity).toBe(0.25);
        expect(grainFx.size).toBe(2.0);
      }
    });

    it("toggles scene effect visibility", () => {
      const store = useEditorStore.getState();
      const chromaId = store.addSceneEffect("scene-1", "chromaticAberration");

      expect(useEditorStore.getState().scenes[0].effects[0].visible).toBe(true);
      store.toggleSceneEffectVisible("scene-1", chromaId);
      expect(useEditorStore.getState().scenes[0].effects[0].visible).toBe(false);
      store.toggleSceneEffectVisible("scene-1", chromaId);
      expect(useEditorStore.getState().scenes[0].effects[0].visible).toBe(true);
    });

    it("reorders scene effects", () => {
      const store = useEditorStore.getState();
      const id1 = store.addSceneEffect("scene-1", "bloom");
      const id2 = store.addSceneEffect("scene-1", "vignette");
      const id3 = store.addSceneEffect("scene-1", "filmGrain");

      expect(useEditorStore.getState().scenes[0].effectsOrder).toEqual([id1, id2, id3]);

      store.reorderSceneEffects("scene-1", [id3, id1, id2]);
      expect(useEditorStore.getState().scenes[0].effectsOrder).toEqual([id3, id1, id2]);
    });

    it("replaces scene effect type while preserving id and enabled/visible state", () => {
      const store = useEditorStore.getState();
      const fxId = store.addSceneEffect("scene-1", "bloom");
      store.toggleSceneEffectVisible("scene-1", fxId); // visible: false

      store.replaceSceneEffectType("scene-1", fxId, "vignette");

      const scene = useEditorStore.getState().scenes[0];
      expect(scene.effects.length).toBe(1);
      const replaced = scene.effects[0];
      expect(replaced.id).toBe(fxId);
      expect(replaced.type).toBe("vignette");
      expect(replaced.visible).toBe(false);
      expect(replaced.enabled).toBe(true);
      if (replaced.type === "vignette") {
        expect(replaced.intensity).toBe(0.15);
      }
    });

    it("removes scene effects and prunes effectsOrder", () => {
      const store = useEditorStore.getState();
      const id1 = store.addSceneEffect("scene-1", "bloom");
      const id2 = store.addSceneEffect("scene-1", "vignette");

      store.removeSceneEffect("scene-1", id1);

      const scene = useEditorStore.getState().scenes[0];
      expect(scene.effects.length).toBe(1);
      expect(scene.effects[0].id).toBe(id2);
      expect(scene.effectsOrder).toEqual([id2]);
    });

    it("permanently migrates legacy doc.bloom and doc.optics inside hydrateDocument", () => {
      const store = useEditorStore.getState();
      const legacyDoc = {
        projectName: "Legacy Doc",
        aspectRatio: "16:9" as const,
        scenes: [
          {
            id: "scene-legacy",
            name: "Legacy Scene",
            durationFrames: 120,
            fps: 30,
            layers: [],
            animationBlocks: [],
            camera: { x: 0, y: 0, z: 0, fov: 60, focusDistance: 1000 },
            effects: [],
            effectsOrder: [],
          },
        ],
        activeSceneId: "scene-legacy",
        bloom: {
          enabled: true,
          threshold: 204,
          intensity: 1.5,
          blurPx: 20,
        },
        optics: {
          vignette: 0.4,
          filmGrain: 0.12,
          chromaticAberration: 0.5,
        },
      };

      store.hydrateDocument(legacyDoc as any);

      const hydratedScene = useEditorStore.getState().scenes[0];
      expect(hydratedScene.effects.length).toBe(4);
      expect(hydratedScene.effectsOrder.length).toBe(4);

      const bloomFx = hydratedScene.effects.find((e) => e.type === "bloom");
      expect(bloomFx).toBeDefined();
      if (bloomFx && bloomFx.type === "bloom") {
        expect(bloomFx.enabled).toBe(true);
        expect(bloomFx.intensity).toBe(1.5);
        expect(bloomFx.threshold).toBeCloseTo(204 / 255);
      }

      const vignetteFx = hydratedScene.effects.find((e) => e.type === "vignette");
      expect(vignetteFx).toBeDefined();
      if (vignetteFx && vignetteFx.type === "vignette") {
        expect(vignetteFx.intensity).toBe(0.4);
      }

      const grainFx = hydratedScene.effects.find((e) => e.type === "filmGrain");
      expect(grainFx).toBeDefined();
      if (grainFx && grainFx.type === "filmGrain") {
        expect(grainFx.intensity).toBe(0.12);
        expect(grainFx.size).toBe(1.0);
      }

      const chromaFx = hydratedScene.effects.find((e) => e.type === "chromaticAberration");
      expect(chromaFx).toBeDefined();
      if (chromaFx && chromaFx.type === "chromaticAberration") {
        expect(chromaFx.offset).toBe(10); // 0.5 * 20
      }
    });
  });

  describe("Per-Layer Effects System", () => {
    let layerId: string;

    beforeEach(() => {
      useEditorStore.setState({
        projectName: "Layer FX Project",
        aspectRatio: "16:9",
        activeSceneId: "scene-1",
        scenes: [
          {
            id: "scene-1",
            name: "Scene 1",
            durationFrames: 180,
            fps: 30,
            layers: [],
            animationBlocks: [],
            camera: { x: 0, y: 0, z: 0, fov: 60, focusDistance: 1000 },
            effects: [],
            effectsOrder: [],
          },
        ],
        selectedLayerIds: [],
        assets: [],
      });
      useEditorStore.temporal.getState().clear();

      layerId = useEditorStore.getState().addLayer("scene-1", {
        name: "Test Layer",
        type: "shape",
      });
    });

    it("seeds effects: [] and effectsOrder: [] on layer creation", () => {
      const layer = useEditorStore.getState().scenes[0].layers.find((l) => l.id === layerId);
      expect(layer).toBeDefined();
      expect(layer?.effects).toEqual([]);
      expect(layer?.effectsOrder).toEqual([]);
    });

    it("generates correct defaults with createDefaultLayerEffect", () => {
      const ds = createDefaultLayerEffect("dropShadow");
      expect(ds.type).toBe("dropShadow");
      expect(ds.enabled).toBe(true);
      expect(ds.visible).toBe(true);
      if (ds.type === "dropShadow") {
        expect(ds.offsetX).toBe(4);
        expect(ds.offsetY).toBe(4);
        expect(ds.blur).toBe(12);
        expect(ds.color).toBe("#000000");
        expect(ds.opacity).toBe(0.5);
      }

      const glow = createDefaultLayerEffect("glow");
      expect(glow.type).toBe("glow");
      if (glow.type === "glow") {
        expect(glow.color).toBe("#6e6ef5");
        expect(glow.blur).toBe(16);
        expect(glow.intensity).toBe(1);
        expect(glow.angle).toBe(0);
        expect(glow.sheen).toBe(0);
        expect(glow.mode).toBe("edge");
        expect(glow.blend).toBe("add");
        expect(glow.rim).toBe(0);
        expect(glow.thickness).toBe(0.3);
      }

      const bdb = createDefaultLayerEffect("backdropBlur");
      expect(bdb.type).toBe("backdropBlur");
      if (bdb.type === "backdropBlur") {
        expect(bdb.blur).toBe(8);
      }

      const lb = createDefaultLayerEffect("layerBlur");
      expect(lb.type).toBe("layerBlur");
      if (lb.type === "layerBlur") {
        expect(lb.blur).toBe(8);
        expect(lb.mode).toBe("uniform");
        expect(lb.endBlur).toBe(16);
        expect(lb.angle).toBe(270);
      }

      const lg = createDefaultLayerEffect("liquidGlass");
      expect(lg.type).toBe("liquidGlass");
      if (lg.type === "liquidGlass") {
        expect(lg.blur).toBe(8);
        expect(lg.refraction).toBe(0.3);
        expect(lg.dispersion).toBe(0.1);
        expect(lg.highlight).toBe(0.4);
      }
    });

    it("enforces isLayerEffectAvailable constraints correctly", () => {
      const flatLayer: Layer = {
        id: "l-flat",
        parentId: null,
        type: "shape",
        name: "Flat",
        transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, depth: 0 },
        opacity: 1,
        visible: true,
        locked: false,
        effects: [],
        effectsOrder: [],
      };

      const depthLayer: Layer = {
        ...flatLayer,
        id: "l-depth",
        transform: { ...flatLayer.transform, depth: 250 },
      };

      const mockupLayer: Layer = {
        ...flatLayer,
        id: "l-mockup",
        mockup: "iphone",
      };

      const noneMockupLayer: Layer = {
        ...flatLayer,
        id: "l-none-mockup",
        mockup: "none",
      };

      // Non-layerBlur effects are available on all layers
      expect(isLayerEffectAvailable(flatLayer, "dropShadow")).toBe(true);
      expect(isLayerEffectAvailable(depthLayer, "glow")).toBe(true);
      expect(isLayerEffectAvailable(mockupLayer, "backdropBlur")).toBe(true);
      expect(isLayerEffectAvailable(mockupLayer, "liquidGlass")).toBe(true);

      // layerBlur availability
      expect(isLayerEffectAvailable(flatLayer, "layerBlur")).toBe(true);
      expect(isLayerEffectAvailable(noneMockupLayer, "layerBlur")).toBe(true);
      expect(isLayerEffectAvailable(depthLayer, "layerBlur")).toBe(false);
      expect(isLayerEffectAvailable(mockupLayer, "layerBlur")).toBe(false);
    });

    it("adds, updates, toggles visibility, reorders, and removes layer effects", () => {
      const store = useEditorStore.getState();

      // Add dropShadow and glow
      const dsId = store.addLayerEffect(layerId, "dropShadow");
      const glowId = store.addLayerEffect(layerId, "glow");

      let layer = useEditorStore.getState().scenes[0].layers.find((l) => l.id === layerId)!;
      expect(layer.effects.length).toBe(2);
      expect(layer.effectsOrder).toEqual([dsId, glowId]);

      // Update dropShadow
      store.updateLayerEffect(layerId, dsId, { blur: 24, opacity: 0.8 });
      layer = useEditorStore.getState().scenes[0].layers.find((l) => l.id === layerId)!;
      const dsEffect = layer.effects.find((e) => e.id === dsId);
      expect((dsEffect as any)?.blur).toBe(24);
      expect((dsEffect as any)?.opacity).toBe(0.8);

      // Toggle visibility
      store.toggleLayerEffectVisible(layerId, glowId);
      layer = useEditorStore.getState().scenes[0].layers.find((l) => l.id === layerId)!;
      const glowEffect = layer.effects.find((e) => e.id === glowId);
      expect(glowEffect?.visible).toBe(false);

      // Reorder
      store.reorderLayerEffects(layerId, [glowId, dsId]);
      layer = useEditorStore.getState().scenes[0].layers.find((l) => l.id === layerId)!;
      expect(layer.effectsOrder).toEqual([glowId, dsId]);

      // Remove effect
      store.removeLayerEffect(layerId, dsId);
      layer = useEditorStore.getState().scenes[0].layers.find((l) => l.id === layerId)!;
      expect(layer.effects.length).toBe(1);
      expect(layer.effectsOrder).toEqual([glowId]);
      expect(layer.effects[0].id).toBe(glowId);
    });

    it("replaces layer effect type while preserving id and enabled/visible flags", () => {
      const store = useEditorStore.getState();
      const fxId = store.addLayerEffect(layerId, "dropShadow");

      store.updateLayerEffect(layerId, fxId, { visible: false });
      store.replaceLayerEffectType(layerId, fxId, "liquidGlass");

      const layer = useEditorStore.getState().scenes[0].layers.find((l) => l.id === layerId)!;
      const replaced = layer.effects.find((e) => e.id === fxId);
      expect(replaced).toBeDefined();
      expect(replaced?.id).toBe(fxId);
      expect(replaced?.type).toBe("liquidGlass");
      expect(replaced?.visible).toBe(false);
      if (replaced?.type === "liquidGlass") {
        expect(replaced.refraction).toBe(0.3);
        expect(replaced.dispersion).toBe(0.1);
      }
    });

    it("blocks adding or replacing with layerBlur on a layer with depth > 0 or device mockup", () => {
      const store = useEditorStore.getState();

      store.updateLayer(layerId, {
        transform: {
          x: 100,
          y: 100,
          width: 200,
          height: 200,
          rotation: 0,
          depth: 100,
        },
      });

      const blockedId = store.addLayerEffect(layerId, "layerBlur");
      expect(blockedId).toBe("");

      let layer = useEditorStore.getState().scenes[0].layers.find((l) => l.id === layerId)!;
      expect(layer.effects.length).toBe(0);

      // Add valid effect then try to replace with layerBlur
      const dsId = store.addLayerEffect(layerId, "dropShadow");
      expect(dsId).toBeTruthy();

      store.replaceLayerEffectType(layerId, dsId, "layerBlur");
      layer = useEditorStore.getState().scenes[0].layers.find((l) => l.id === layerId)!;
      expect(layer.effects[0].type).toBe("dropShadow");
    });

    it("clones layer effects with fresh IDs during layer duplication and pasting", () => {
      const store = useEditorStore.getState();
      const fxId = store.addLayerEffect(layerId, "glow");

      store.selectLayers([layerId]);
      const [dupLayerId] = store.duplicateSelectedLayers();

      expect(dupLayerId).toBeDefined();
      const scene = useEditorStore.getState().scenes[0];
      const dupLayer = scene.layers.find((l) => l.id === dupLayerId)!;

      expect(dupLayer.effects.length).toBe(1);
      expect(dupLayer.effects[0].type).toBe("glow");
      expect(dupLayer.effects[0].id).not.toBe(fxId);
      expect(dupLayer.effectsOrder).toEqual([dupLayer.effects[0].id]);

      // Test paste
      const [pastedLayerId] = store.pasteLayers([dupLayer]);
      const pastedLayer = useEditorStore.getState().scenes[0].layers.find((l) => l.id === pastedLayerId)!;
      expect(pastedLayer.effects.length).toBe(1);
      expect(pastedLayer.effects[0].id).not.toBe(dupLayer.effects[0].id);
      expect(pastedLayer.effectsOrder).toEqual([pastedLayer.effects[0].id]);
    });
  });
});
