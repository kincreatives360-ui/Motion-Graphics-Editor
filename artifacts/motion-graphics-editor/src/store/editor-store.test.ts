import { describe, it, expect, beforeEach } from "vitest";
import { useEditorStore, useEditorUIStore } from "./editor-store";

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

  it("manages Scene Effects stack (add, update, swap, remove, reorder)", () => {
    const store = useEditorStore.getState();

    // Add depthOfField & bloom
    store.addSceneEffect("scene-1", "depthOfField");
    store.addSceneEffect("scene-1", "bloom");

    let sceneEffects = useEditorStore.getState().scenes[0].sceneEffects;
    expect(sceneEffects?.effectsOrder).toEqual(["depthOfField", "bloom"]);
    expect(sceneEffects?.depthOfField?.enabled).toBe(true);

    // Update bloom params
    useEditorStore.getState().updateSceneEffects("scene-1", {
      bloom: { enabled: true, intensity: 2.5, threshold: 0.7 },
    });
    sceneEffects = useEditorStore.getState().scenes[0].sceneEffects;
    expect(sceneEffects?.bloom?.intensity).toBe(2.5);

    // Swap depthOfField for glitch
    useEditorStore.getState().swapSceneEffect("scene-1", "depthOfField", "glitch");
    sceneEffects = useEditorStore.getState().scenes[0].sceneEffects;
    expect(sceneEffects?.effectsOrder).toEqual(["glitch", "bloom"]);

    // Remove bloom
    useEditorStore.getState().removeSceneEffect("scene-1", "bloom");
    sceneEffects = useEditorStore.getState().scenes[0].sceneEffects;
    expect(sceneEffects?.effectsOrder).toEqual(["glitch"]);
  });

  it("manages Layer Effects stack and Effect Presets", () => {
    const store = useEditorStore.getState();
    const layerId = store.addLayer("scene-1", { name: "Card Layer", type: "shape" });

    // Add dropShadow & glow
    store.addLayerEffect(layerId, "dropShadow");
    store.addLayerEffect(layerId, "glow");

    let layer = useEditorStore.getState().scenes[0].layers.find((l) => l.id === layerId);
    expect(layer?.layerEffects?.layerEffectsOrder).toEqual(["dropShadow", "glow"]);

    // Save and apply Effect Preset
    const presetId = store.saveEffectPreset({
      name: "Custom Neon",
      category: "Custom",
      sceneEffects: {
        glitch: { enabled: true, intensity: 0.5 },
        effectsOrder: ["glitch"],
      },
    });

    expect(presetId).toBeDefined();
    expect(useEditorStore.getState().effectPresets?.length).toBe(1);

    store.applyEffectPreset("scene-1", presetId);
    const sceneEffects = useEditorStore.getState().scenes[0].sceneEffects;
    expect(sceneEffects?.glitch?.intensity).toBe(0.5);
  });
});
