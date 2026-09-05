import { describe, it, expect, beforeEach } from "vitest";
import {
  useEditorStore,
  useEditorUIStore,
  isLayerEffectAvailable,
  createDefaultLayerEffect,
  type Layer,
} from "./editor-store";
import { filterLayersBySearch } from "../components/LayerTree";

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

  describe("Scene Filmstrip & Multi-Scene Management", () => {
    it("updates scene properties such as durationFrames and name", () => {
      const store = useEditorStore.getState();
      store.updateScene("scene-1", { durationFrames: 240, name: "Intro Sequence" });
      const updated = useEditorStore.getState().scenes.find((s) => s.id === "scene-1")!;
      expect(updated.durationFrames).toBe(240);
      expect(updated.name).toBe("Intro Sequence");
    });

    it("reorders scenes properly", () => {
      const store = useEditorStore.getState();
      const scene2Id = store.addScene({ name: "Scene 2" });
      const scene3Id = store.addScene({ name: "Scene 3" });

      expect(useEditorStore.getState().scenes.map((s) => s.id)).toEqual([
        "scene-1",
        scene2Id,
        scene3Id,
      ]);

      // Move scene-1 to index 2
      store.reorderScenes(0, 2);
      expect(useEditorStore.getState().scenes.map((s) => s.id)).toEqual([
        scene2Id,
        scene3Id,
        "scene-1",
      ]);
    });

    it("duplicates scene with cloned contents and new ID", () => {
      const store = useEditorStore.getState();
      store.addLayer("scene-1", { name: "Card Layer", type: "shape" });
      const copyId = store.duplicateScene("scene-1");

      expect(copyId).toBeTruthy();
      expect(copyId).not.toBe("scene-1");
      const scenes = useEditorStore.getState().scenes;
      expect(scenes.length).toBe(2);
      const copyScene = scenes.find((s) => s.id === copyId)!;
      expect(copyScene.name).toContain("(Copy)");
      expect(copyScene.layers.length).toBe(1);
      expect(useEditorStore.getState().activeSceneId).toBe(copyId);
    });

    it("deletes scene and falls back to remaining active scene, never deleting the last scene", () => {
      const store = useEditorStore.getState();
      const scene2Id = store.addScene({ name: "Scene 2" });
      expect(useEditorStore.getState().scenes.length).toBe(2);

      // Active is scene2Id; delete it
      store.deleteScene(scene2Id);
      expect(useEditorStore.getState().scenes.length).toBe(1);
      expect(useEditorStore.getState().activeSceneId).toBe("scene-1");

      // Cannot delete the only remaining scene
      store.deleteScene("scene-1");
      expect(useEditorStore.getState().scenes.length).toBe(1);
      expect(useEditorStore.getState().activeSceneId).toBe("scene-1");
    });
  });

  describe("Alignment, Flip, Restack, and Ungroup (Phase 2)", () => {
    beforeEach(() => {
      useEditorStore.setState((state) => ({
        ...state,
        selectedLayerIds: [],
        scenes: state.scenes.map((s) => ({ ...s, layers: [] })),
      }));
    });

    it("aligns a single layer to canvas bounds (16:9 = 1920x1080)", () => {
      const store = useEditorStore.getState();
      const layerId = store.addLayer("scene-1", {
        name: "Box",
        type: "shape",
        transform: { x: 500, y: 300, width: 200, height: 100, rotation: 0, opacity: 1 },
      });
      store.selectLayers([layerId]);

      // Align Left -> x should be 0
      store.alignLeft();
      let layer = useEditorStore.getState().scenes[0].layers.find((l) => l.id === layerId)!;
      expect(layer.transform.x).toBe(0);

      // Align Right -> x + width should be 1920 => x = 1720
      store.alignRight();
      layer = useEditorStore.getState().scenes[0].layers.find((l) => l.id === layerId)!;
      expect(layer.transform.x).toBe(1720);

      // Align Top -> y should be 0
      store.alignTop();
      layer = useEditorStore.getState().scenes[0].layers.find((l) => l.id === layerId)!;
      expect(layer.transform.y).toBe(0);

      // Align Bottom -> y + height should be 1080 => y = 980
      store.alignBottom();
      layer = useEditorStore.getState().scenes[0].layers.find((l) => l.id === layerId)!;
      expect(layer.transform.y).toBe(980);

      // Align Center Horizontal -> center X = 960 => x = 960 - 100 = 860
      store.alignCenterHorizontal();
      layer = useEditorStore.getState().scenes[0].layers.find((l) => l.id === layerId)!;
      expect(layer.transform.x).toBe(860);

      // Align Center Vertical -> center Y = 540 => y = 540 - 50 = 490
      store.alignCenterVertical();
      layer = useEditorStore.getState().scenes[0].layers.find((l) => l.id === layerId)!;
      expect(layer.transform.y).toBe(490);
    });

    it("aligns multiple selected layers to collective bounding box", () => {
      const store = useEditorStore.getState();
      const l1Id = store.addLayer("scene-1", {
        name: "L1",
        type: "shape",
        transform: { x: 100, y: 200, width: 100, height: 100, rotation: 0, opacity: 1 },
      });
      const l2Id = store.addLayer("scene-1", {
        name: "L2",
        type: "shape",
        transform: { x: 300, y: 400, width: 100, height: 100, rotation: 0, opacity: 1 },
      });
      store.selectLayers([l1Id, l2Id]);

      // Align Left: bounding minX is 100 -> both layers x should become 100
      store.alignLeft();
      let scene = useEditorStore.getState().scenes[0];
      expect(scene.layers.find((l) => l.id === l1Id)!.transform.x).toBe(100);
      expect(scene.layers.find((l) => l.id === l2Id)!.transform.x).toBe(100);

      // Align Bottom: bounding maxY is 500 (from L2 y:400 + 100) -> both layers maxY should be 500
      store.alignBottom();
      scene = useEditorStore.getState().scenes[0];
      expect(scene.layers.find((l) => l.id === l1Id)!.transform.y).toBe(400);
      expect(scene.layers.find((l) => l.id === l2Id)!.transform.y).toBe(400);
    });

    it("flips single layer horizontally and vertically", () => {
      const store = useEditorStore.getState();
      const layerId = store.addLayer("scene-1", {
        name: "Card",
        type: "shape",
        transform: { x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1 },
      });
      store.selectLayers([layerId]);

      store.flipHorizontal();
      let layer = useEditorStore.getState().scenes[0].layers.find((l) => l.id === layerId)!;
      expect(layer.transform.flipX).toBe(true);

      store.flipHorizontal();
      layer = useEditorStore.getState().scenes[0].layers.find((l) => l.id === layerId)!;
      expect(layer.transform.flipX).toBe(false);

      store.flipVertical();
      layer = useEditorStore.getState().scenes[0].layers.find((l) => l.id === layerId)!;
      expect(layer.transform.flipY).toBe(true);
    });

    it("flips multiple layers mirroring around collective center", () => {
      const store = useEditorStore.getState();
      // L1 center is at (150, 150), L2 center is at (350, 150). Collective center X = 250.
      const l1Id = store.addLayer("scene-1", {
        name: "L1",
        type: "shape",
        transform: { x: 100, y: 100, width: 100, height: 100, rotation: 0, opacity: 1 },
      });
      const l2Id = store.addLayer("scene-1", {
        name: "L2",
        type: "shape",
        transform: { x: 300, y: 100, width: 100, height: 100, rotation: 0, opacity: 1 },
      });
      store.selectLayers([l1Id, l2Id]);

      store.flipHorizontal();
      const scene = useEditorStore.getState().scenes[0];
      const l1 = scene.layers.find((l) => l.id === l1Id)!;
      const l2 = scene.layers.find((l) => l.id === l2Id)!;

      expect(l1.transform.flipX).toBe(true);
      expect(l2.transform.flipX).toBe(true);
      // L1 was mirrored across 250: new center is 250 + (250 - 150) = 350 => x = 300
      expect(l1.transform.x).toBe(300);
      // L2 was mirrored across 250: new center is 250 - (350 - 250) = 150 => x = 100
      expect(l2.transform.x).toBe(100);
    });

    it("restacks layers forward, backward, to front, and to back preserving sibling hierarchy", () => {
      const store = useEditorStore.getState();
      const l1 = store.addLayer("scene-1", { name: "L1", type: "shape" });
      const l2 = store.addLayer("scene-1", { name: "L2", type: "shape" });
      const l3 = store.addLayer("scene-1", { name: "L3", type: "shape" });

      const getOrder = () =>
        useEditorStore.getState().scenes[0].layers.map((l) => l.id);

      expect(getOrder()).toEqual([l1, l2, l3]);

      // Bring L1 forward -> swaps with L2
      store.selectLayers([l1]);
      store.bringLayerForward();
      expect(getOrder()).toEqual([l2, l1, l3]);

      // Bring L2 to front -> moves to highest index (end)
      store.selectLayers([l2]);
      store.bringLayerToFront();
      expect(getOrder()).toEqual([l1, l3, l2]);

      // Send L2 backward -> swaps with L3
      store.selectLayers([l2]);
      store.sendLayerBackward();
      expect(getOrder()).toEqual([l1, l2, l3]);

      // Send L3 to back -> moves to index 0
      store.selectLayers([l3]);
      store.sendLayerToBack();
      expect(getOrder()).toEqual([l3, l1, l2]);
    });

    it("ungroups selected group and composes transforms into children", () => {
      const store = useEditorStore.getState();
      const l1 = store.addLayer("scene-1", {
        name: "Child 1",
        type: "shape",
        opacity: 0.8,
        transform: { x: 50, y: 50, width: 100, height: 100, rotation: 10 },
      });
      const l2 = store.addLayer("scene-1", {
        name: "Child 2",
        type: "shape",
        opacity: 1,
        transform: { x: 200, y: 50, width: 100, height: 100, rotation: 0 },
      });

      store.selectLayers([l1, l2]);
      const groupId = store.groupSelectedLayers();
      expect(groupId).toBeTruthy();

      // Modify group transform and opacity
      store.updateLayer(groupId!, {
        opacity: 0.5,
        transform: {
          x: 100,
          y: 200,
          width: 300,
          height: 150,
          rotation: 30,
          depth: 25,
        },
      });

      // Select group and ungroup
      store.selectLayers([groupId!]);
      store.ungroupSelectedLayers();

      const scene = useEditorStore.getState().scenes[0];
      // Group container should be gone
      expect(scene.layers.some((l) => l.id === groupId)).toBe(false);

      // Children should have parentId = null
      const child1 = scene.layers.find((l) => l.id === l1)!;
      const child2 = scene.layers.find((l) => l.id === l2)!;
      expect(child1).toBeTruthy();
      expect(child2).toBeTruthy();
      expect(child1.parentId).toBeNull();
      expect(child2.parentId).toBeNull();

      // Transform composed: rotation = 10 + 30 = 40, opacity = 0.8 * 0.5 = 0.4, depth composed
      expect(child1.transform.rotation).toBeCloseTo(40, 1);
      expect(child1.opacity).toBeCloseTo(0.4, 2);
      expect(child1.transform.depth).toBe(25);

      // Children should now be selected
      expect(useEditorStore.getState().selectedLayerIds).toEqual([l1, l2]);
    });
  });

  describe("Animate Mode and Keyframe Recording", () => {
    it("manages animateMode flag in UI store without affecting document history", () => {
      const uiStore = useEditorUIStore.getState();
      expect(uiStore.animateMode).toBe(false);

      uiStore.toggleAnimateMode();
      expect(useEditorUIStore.getState().animateMode).toBe(true);

      uiStore.setAnimateMode(false);
      expect(useEditorUIStore.getState().animateMode).toBe(false);

      // UI store changes should not pollute document temporal history
      expect(useEditorStore.temporal.getState().pastStates.length).toBe(0);
    });

    it("records new keyframe track with baseline and target keyframes when no track exists", () => {
      const store = useEditorStore.getState();
      const layerId = store.addLayer("scene-1", {
        name: "Animated Box",
        type: "shape",
        opacity: 0.8,
        transform: { x: 100, y: 150, width: 200, height: 200, rotation: 0 },
      });

      // Initially no animation blocks
      expect(useEditorStore.getState().scenes[0].animationBlocks.length).toBe(0);

      // Record x keyframe at frame 40 with value 300
      useEditorStore.getState().recordKeyframe(layerId, "x", 300, 40, "scene-1");

      const blocks = useEditorStore.getState().scenes[0].animationBlocks;
      expect(blocks.length).toBe(1);
      const track = blocks[0];
      expect(track.layerId).toBe(layerId);
      expect(track.property).toBe("x");
      expect(track.keyframes.length).toBe(2);

      // Baseline keyframe at targetFrame - 30 = 10 with initial layer value 100
      expect(track.keyframes[0].frame).toBe(10);
      expect(track.keyframes[0].value).toBe(100);

      // Target keyframe at frame 40 with value 300
      expect(track.keyframes[1].frame).toBe(40);
      expect(track.keyframes[1].value).toBe(300);
    });

    it("updates existing keyframe when recording at the exact same frame", () => {
      const store = useEditorStore.getState();
      const layerId = store.addLayer("scene-1", {
        name: "Box",
        type: "shape",
        transform: { x: 100, y: 100, width: 100, height: 100, rotation: 0 },
      });

      store.recordKeyframe(layerId, "y", 200, 30, "scene-1");
      let blocks = useEditorStore.getState().scenes[0].animationBlocks;
      expect(blocks[0].keyframes.find((k) => k.frame === 30)?.value).toBe(200);

      // Update at frame 30 with new value 450
      useEditorStore.getState().recordKeyframe(layerId, "y", 450, 30, "scene-1");
      blocks = useEditorStore.getState().scenes[0].animationBlocks;
      expect(blocks.length).toBe(1);
      const kf30 = blocks[0].keyframes.find((k) => k.frame === 30);
      expect(kf30?.value).toBe(450);
      // Keyframe count should still be 2 (baseline + frame 30)
      expect(blocks[0].keyframes.length).toBe(2);
    });

    it("appends and maintains sorted order when recording keyframe at a new frame on existing track", () => {
      const store = useEditorStore.getState();
      const layerId = store.addLayer("scene-1", {
        name: "Box",
        type: "shape",
        transform: { x: 100, y: 100, width: 100, height: 100, rotation: 0 },
      });

      // Create initial track at frame 60
      store.recordKeyframe(layerId, "rotation", 45, 60, "scene-1");
      // Add keyframe at frame 90
      useEditorStore.getState().recordKeyframe(layerId, "rotation", 90, 90, "scene-1");
      // Add keyframe at frame 45 (between baseline 30 and 60)
      useEditorStore.getState().recordKeyframe(layerId, "rotation", 30, 45, "scene-1");

      const track = useEditorStore.getState().scenes[0].animationBlocks[0];
      expect(track.keyframes.length).toBe(4);
      const frames = track.keyframes.map((k) => k.frame);
      expect(frames).toEqual([30, 45, 60, 90]);
    });

    it("records keyframes during nudgeSelectedLayers when animateMode is enabled", () => {
      const store = useEditorStore.getState();
      const layerId = store.addLayer("scene-1", {
        name: "Nudge Box",
        type: "shape",
        transform: { x: 50, y: 50, width: 100, height: 100, rotation: 0 },
      });
      store.selectLayers([layerId]);

      // When animateMode is false: nudge does not record keyframes
      useEditorUIStore.getState().setAnimateMode(false);
      useEditorUIStore.getState().setCurrentFrame(30);
      store.nudgeSelectedLayers(10, 20);

      expect(useEditorStore.getState().scenes[0].animationBlocks.length).toBe(0);
      let layer = useEditorStore.getState().scenes[0].layers.find((l) => l.id === layerId)!;
      expect(layer.transform.x).toBe(60);
      expect(layer.transform.y).toBe(70);

      // When animateMode is true: nudge records x and y keyframes
      useEditorUIStore.getState().setAnimateMode(true);
      useEditorUIStore.getState().setCurrentFrame(50);
      useEditorStore.getState().nudgeSelectedLayers(15, -10);

      layer = useEditorStore.getState().scenes[0].layers.find((l) => l.id === layerId)!;
      expect(layer.transform.x).toBe(75);
      expect(layer.transform.y).toBe(60);

      const blocks = useEditorStore.getState().scenes[0].animationBlocks;
      expect(blocks.length).toBe(2);
      const xTrack = blocks.find((b) => b.property === "x");
      const yTrack = blocks.find((b) => b.property === "y");
      expect(xTrack).toBeDefined();
      expect(yTrack).toBeDefined();
      expect(xTrack?.keyframes.find((k) => k.frame === 50)?.value).toBe(75);
      expect(yTrack?.keyframes.find((k) => k.frame === 50)?.value).toBe(60);
    });
  });

  describe("Keyboard Shortcuts and Timeline Editing Actions", () => {
    it("toggles visibility of selected layers", () => {
      const store = useEditorStore.getState();
      const l1 = store.addLayer("scene-1", { name: "L1", visible: true });
      const l2 = store.addLayer("scene-1", { name: "L2", visible: true });

      store.selectLayers([l1, l2]);
      // If visible, toggleSelectedLayersVisibility sets both to false
      store.toggleSelectedLayersVisibility();

      let scene = useEditorStore.getState().scenes[0];
      expect(scene.layers.find((l) => l.id === l1)?.visible).toBe(false);
      expect(scene.layers.find((l) => l.id === l2)?.visible).toBe(false);

      // Toggle again sets both back to true
      store.toggleSelectedLayersVisibility();
      scene = useEditorStore.getState().scenes[0];
      expect(scene.layers.find((l) => l.id === l1)?.visible).toBe(true);
      expect(scene.layers.find((l) => l.id === l2)?.visible).toBe(true);
    });

    it("sets opacity on selected layers and records keyframe if animateMode is true", () => {
      const store = useEditorStore.getState();
      const l1 = store.addLayer("scene-1", { name: "L1", opacity: 1 });
      store.selectLayers([l1]);

      useEditorUIStore.getState().setAnimateMode(false);
      store.setSelectedLayersOpacity(0.4);

      let scene = useEditorStore.getState().scenes[0];
      expect(scene.layers.find((l) => l.id === l1)?.opacity).toBe(0.4);
      expect(scene.animationBlocks.length).toBe(0);

      // Now with animateMode = true
      useEditorUIStore.getState().setAnimateMode(true);
      useEditorUIStore.getState().setCurrentFrame(45);
      store.setSelectedLayersOpacity(0.8);

      scene = useEditorStore.getState().scenes[0];
      expect(scene.layers.find((l) => l.id === l1)?.opacity).toBe(0.8);
      expect(scene.animationBlocks.length).toBe(1);
      const opTrack = scene.animationBlocks[0];
      expect(opTrack.property).toBe("opacity");
      expect(opTrack.keyframes.find((k) => k.frame === 45)?.value).toBe(0.8);
    });

    it("splits animation block at playhead into two continuous blocks", () => {
      const store = useEditorStore.getState();
      const layerId = store.addLayer("scene-1", { name: "Block Layer" });
      store.selectLayers([layerId]);

      // Add a preset animation block spanning frames 10 to 70
      store.addAnimationBlock("scene-1", {
        layerId,
        preset: "fade-in",
        startFrame: 10,
        endFrame: 70,
        easing: "ease-in-out",
      });

      expect(useEditorStore.getState().scenes[0].animationBlocks.length).toBe(1);

      // Split at frame 40
      store.splitBlocksAtPlayhead(40, "scene-1");

      const blocks = useEditorStore.getState().scenes[0].animationBlocks;
      expect(blocks.length).toBe(2);
      expect(blocks[0].startFrame).toBe(10);
      expect(blocks[0].endFrame).toBe(40);
      expect(blocks[1].startFrame).toBe(40);
      expect(blocks[1].endFrame).toBe(70);
    });

    it("trims in-point and out-point of animation blocks at playhead", () => {
      const store = useEditorStore.getState();
      const layerId = store.addLayer("scene-1", { name: "Trim Layer" });
      store.selectLayers([layerId]);

      store.addAnimationBlock("scene-1", {
        layerId,
        preset: "fade-in",
        startFrame: 10,
        endFrame: 80,
        easing: "ease-in-out",
      });

      // Trim In at frame 30 -> startFrame becomes 30
      store.trimInPointAtPlayhead(30, "scene-1");
      let block = useEditorStore.getState().scenes[0].animationBlocks[0];
      expect(block.startFrame).toBe(30);
      expect(block.endFrame).toBe(80);

      // Trim Out at frame 65 -> endFrame becomes 65
      store.trimOutPointAtPlayhead(65, "scene-1");
      block = useEditorStore.getState().scenes[0].animationBlocks[0];
      expect(block.startFrame).toBe(30);
      expect(block.endFrame).toBe(65);
    });

    it("manages timelineZoom state in UI store within [0, 100]", () => {
      const ui = useEditorUIStore.getState();
      expect(ui.timelineZoom).toBe(54);

      ui.setTimelineZoom(80);
      expect(useEditorUIStore.getState().timelineZoom).toBe(80);

      // Clamp max 100
      ui.setTimelineZoom(150);
      expect(useEditorUIStore.getState().timelineZoom).toBe(100);

      // Clamp min 0
      ui.setTimelineZoom(-20);
      expect(useEditorUIStore.getState().timelineZoom).toBe(0);
    });

    it("manages helpOpen state in UI store", () => {
      const ui = useEditorUIStore.getState();
      expect(ui.helpOpen).toBe(false);

      ui.setHelpOpen(true);
      expect(useEditorUIStore.getState().helpOpen).toBe(true);

      ui.setHelpOpen(false);
      expect(useEditorUIStore.getState().helpOpen).toBe(false);
    });

    it("manages isLightSelected state in UI store and coordinates with camera and layers", () => {
      const ui = useEditorUIStore.getState();
      const store = useEditorStore.getState();

      expect(ui.isLightSelected).toBe(false);

      // Select camera first
      ui.setIsCameraSelected(true);
      expect(useEditorUIStore.getState().isCameraSelected).toBe(true);

      // Select light -> camera should be deselected
      ui.setIsLightSelected(true);
      expect(useEditorUIStore.getState().isLightSelected).toBe(true);
      expect(useEditorUIStore.getState().isCameraSelected).toBe(false);

      // Select camera again -> light should be deselected
      ui.setIsCameraSelected(true);
      expect(useEditorUIStore.getState().isCameraSelected).toBe(true);
      expect(useEditorUIStore.getState().isLightSelected).toBe(false);

      // Select light again, then select layers -> light should be deselected
      ui.setIsLightSelected(true);
      expect(useEditorUIStore.getState().isLightSelected).toBe(true);
      store.selectLayers(["layer-1"]);
      expect(useEditorUIStore.getState().isLightSelected).toBe(false);
    });

    it("detects device mockup on layers for conditional Light track rendering", () => {
      const plainLayers: Layer[] = [
        { id: "l1", name: "Text 1", type: "text", opacity: 1, visible: true, locked: false, transform: { x: 0, y: 0, width: 100, height: 50, rotation: 0 } },
        { id: "l2", name: "Shape 1", type: "shape", opacity: 1, visible: true, locked: false, transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0 } },
      ];
      expect(plainLayers.some((l) => Boolean(l.mockup && l.mockup !== "none"))).toBe(false);

      const mockupLayers: Layer[] = [
        ...plainLayers,
        { id: "l3", name: "Phone Mockup", type: "image", opacity: 1, visible: true, locked: false, mockup: "iphone", transform: { x: 0, y: 0, width: 400, height: 800, rotation: 0 } },
      ];
      expect(mockupLayers.some((l) => Boolean(l.mockup && l.mockup !== "none"))).toBe(true);

      const noneMockupLayers: Layer[] = [
        ...plainLayers,
        { id: "l4", name: "None Mockup", type: "image", opacity: 1, visible: true, locked: false, mockup: "none", transform: { x: 0, y: 0, width: 400, height: 800, rotation: 0 } },
      ];
      expect(noneMockupLayers.some((l) => Boolean(l.mockup && l.mockup !== "none"))).toBe(false);
    });

    it("filters layers by search query while preserving ancestor groups and hierarchy", () => {
      const groupA: Layer = { id: "g-a", name: "Hero Section", type: "group", opacity: 1, visible: true, locked: false, transform: { x: 0, y: 0, width: 200, height: 200, rotation: 0 } };
      const childA1: Layer = { id: "c-a1", parentId: "g-a", name: "Headline Text", type: "text", opacity: 1, visible: true, locked: false, transform: { x: 10, y: 10, width: 100, height: 30, rotation: 0 } };
      const childA2: Layer = { id: "c-a2", parentId: "g-a", name: "Accent Badge", type: "shape", opacity: 1, visible: true, locked: false, transform: { x: 10, y: 50, width: 40, height: 20, rotation: 0 } };
      const groupB: Layer = { id: "g-b", name: "Footer Group", type: "group", opacity: 1, visible: true, locked: false, transform: { x: 0, y: 400, width: 200, height: 100, rotation: 0 } };
      const childB1: Layer = { id: "c-b1", parentId: "g-b", name: "Copyright Text", type: "text", opacity: 1, visible: true, locked: false, transform: { x: 10, y: 10, width: 80, height: 20, rotation: 0 } };

      const allLayers = [groupA, childA1, childA2, groupB, childB1];

      // Empty search returns all layers
      expect(filterLayersBySearch(allLayers, "")).toEqual(allLayers);
      expect(filterLayersBySearch(allLayers, "   ")).toEqual(allLayers);

      // Search matching childA1 ("headline"):
      // Must include childA1 AND its ancestor groupA so hierarchy remains legible
      const resultHeadline = filterLayersBySearch(allLayers, "headline");
      const resultHeadlineIds = resultHeadline.map((l) => l.id);
      expect(resultHeadlineIds).toContain("c-a1");
      expect(resultHeadlineIds).toContain("g-a");
      // Does not contain unrelated siblings or other groups
      expect(resultHeadlineIds).not.toContain("c-a2");
      expect(resultHeadlineIds).not.toContain("g-b");
      expect(resultHeadlineIds).not.toContain("c-b1");

      // Search matching a group ("footer"):
      // Includes groupB AND its children
      const resultFooter = filterLayersBySearch(allLayers, "footer");
      const resultFooterIds = resultFooter.map((l) => l.id);
      expect(resultFooterIds).toContain("g-b");
      expect(resultFooterIds).toContain("c-b1");
      expect(resultFooterIds).not.toContain("g-a");

      // Search matching both text layers ("text"):
      // Includes childA1 (and parent groupA) and childB1 (and parent groupB)
      const resultText = filterLayersBySearch(allLayers, "TEXT");
      const resultTextIds = resultText.map((l) => l.id);
      expect(resultTextIds).toEqual(expect.arrayContaining(["g-a", "c-a1", "g-b", "c-b1"]));
      expect(resultTextIds).not.toContain("c-a2");

      // Search matching nothing:
      expect(filterLayersBySearch(allLayers, "nonexistent-xyz")).toEqual([]);
    });
  });

  describe("Camera Controls & Reset", () => {
    it("resets all camera parameters to standard defaults", () => {
      const docStore = useEditorStore.getState();

      // Modify every camera parameter to non-default values
      docStore.updateCamera({
        x: 350,
        y: -120,
        z: 800,
        pitch: 45,
        yaw: -30,
        roll: 15,
        fov: 90,
        focalLengthMm: 85,
        apertureFStop: 1.4,
        aperture: 1.4,
        focusDistance: 350,
        target: { x: 400, y: 300, z: 50 },
      });

      const updatedCam = useEditorStore.getState().scenes[0].camera;
      expect(updatedCam.x).toBe(350);
      expect(updatedCam.y).toBe(-120);
      expect(updatedCam.z).toBe(800);
      expect(updatedCam.pitch).toBe(45);
      expect(updatedCam.yaw).toBe(-30);
      expect(updatedCam.roll).toBe(15);
      expect(updatedCam.fov).toBe(90);
      expect(updatedCam.focalLengthMm).toBe(85);
      expect(updatedCam.aperture).toBe(1.4);
      expect(updatedCam.focusDistance).toBe(350);

      // Invoke resetCamera
      docStore.resetCamera();

      // Verify all parameters are completely reset
      const resetCam = useEditorStore.getState().scenes[0].camera;
      expect(resetCam.x).toBe(0);
      expect(resetCam.y).toBe(0);
      expect(resetCam.z).toBe(0);
      expect(resetCam.pitch).toBe(0);
      expect(resetCam.yaw).toBe(0);
      expect(resetCam.roll).toBe(0);
      expect(resetCam.fov).toBe(60);
      expect(resetCam.focalLengthMm).toBe(50);
      expect(resetCam.apertureFStop).toBe(2.8);
      expect(resetCam.aperture).toBe(2.8);
      expect(resetCam.focusDistance).toBe(1000);
      expect(resetCam.target).toEqual({ x: 960, y: 540, z: 0 });
    });
  });
});


