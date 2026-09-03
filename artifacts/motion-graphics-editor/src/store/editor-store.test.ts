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
});
