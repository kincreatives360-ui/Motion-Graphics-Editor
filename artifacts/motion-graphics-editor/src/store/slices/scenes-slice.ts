import type { Scene } from "../editor-store";

export type ScenesSlice = {
  setActiveScene: (id: string) => void;
  addScene: (scene?: Partial<Scene>) => string;
  updateScene: (sceneId: string, partial: Partial<Scene>) => void;
  reorderScenes: (fromIndex: number, toIndex: number) => void;
  deleteScene: (sceneId: string) => void;
  duplicateScene: (sceneId: string) => string;
};

type SetState = <T>(partial: T | ((state: T) => T)) => void;
type GetState = () => any;

export const createScenesSlice = (set: SetState, get: GetState): ScenesSlice => ({
  setActiveScene: (id) => {
    set({ activeSceneId: id, selectedLayerIds: [] });
  },

  addScene: (sceneOverride) => {
    const newSceneId = `scene-${Date.now()}`;
    const newScene: Scene = {
      id: newSceneId,
      name: `Scene ${get().scenes.length + 1}`,
      durationFrames: 180,
      fps: 30,
      layers: [],
      animationBlocks: [],
      camera: {
        x: 960,
        y: 540,
        z: 0,
        fov: 60,
        focusDistance: 1000,
      },
      effects: [],
      effectsOrder: [],
      ...sceneOverride,
    };

    set((state: any) => ({
      scenes: [...state.scenes, newScene],
      activeSceneId: newSceneId,
      selectedLayerIds: [],
    }));

    return newSceneId;
  },

  updateScene: (sceneId, partial) => {
    set((state: any) => ({
      scenes: state.scenes.map((scene: any) =>
        scene.id === sceneId ? { ...scene, ...partial } : scene,
      ),
    }));
  },

  reorderScenes: (fromIndex, toIndex) => {
    const state = get();
    if (
      fromIndex < 0 ||
      fromIndex >= state.scenes.length ||
      toIndex < 0 ||
      toIndex >= state.scenes.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const updated = [...state.scenes];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    set({ scenes: updated });
  },

  deleteScene: (sceneId) => {
    const state = get();
    if (state.scenes.length <= 1) return;
    const remaining = state.scenes.filter((s: any) => s.id !== sceneId);
    const nextActiveId =
      state.activeSceneId === sceneId ? remaining[0].id : state.activeSceneId;
    set({
      scenes: remaining,
      activeSceneId: nextActiveId,
      selectedLayerIds: state.activeSceneId === sceneId ? [] : state.selectedLayerIds,
    });
  },

  duplicateScene: (sceneId) => {
    const state = get();
    const target = state.scenes.find((s: any) => s.id === sceneId);
    if (!target) return "";
    const newSceneId = `scene-${Date.now()}`;
    const cloned: Scene = JSON.parse(JSON.stringify(target));
    cloned.id = newSceneId;
    cloned.name = `${target.name} (Copy)`;
    const targetIndex = state.scenes.findIndex((s: any) => s.id === sceneId);
    const updated = [...state.scenes];
    updated.splice(targetIndex + 1, 0, cloned);
    set({
      scenes: updated,
      activeSceneId: newSceneId,
      selectedLayerIds: [],
    });
    return newSceneId;
  },
});
