import type { AnimationBlock } from "../animation-blocks";
import type { Layer, Scene } from "../editor-store";
import type { AnimationPreset, SceneTemplate } from "../../presets/preset-library";
import { useEditorUIStore } from "../editor-store";

export type PresetsSlice = {
  applyAnimationPreset: (preset: AnimationPreset) => void;
  applySceneTemplate: (template: SceneTemplate, mode: "new" | "merge") => string;
};

type SetState = <T>(partial: T | ((state: T) => T)) => void;
type GetState = () => any;

export const createPresetsSlice = (set: SetState, get: GetState): PresetsSlice => ({
  applyAnimationPreset: (preset) => {
    const state = get();
    const scene = state.scenes.find((s: any) => s.id === state.activeSceneId);
    if (!scene) return;

    const playhead = useEditorUIStore.getState().currentFrame;
    const newBlocks: AnimationBlock[] = [];

    if (preset.category === "camera") {
      for (const def of preset.blocks) {
        const blockId = `anim-cam-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const start = playhead + (def.offsetFrames || 0);
        const end = Math.min(scene.durationFrames, start + def.durationFrames);
        newBlocks.push({
          id: blockId,
          layerId: null,
          preset: def.preset,
          startFrame: start,
          endFrame: end,
          easing: def.easing,
          customCurve: def.customCurve,
          cameraTo: def.cameraTo,
        });
      }
    } else {
      const targets = state.selectedLayerIds.length > 0 ? state.selectedLayerIds : [];
      if (targets.length === 0) return;

      for (const layerId of targets) {
        for (const def of preset.blocks) {
          const blockId = `anim-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const start = playhead + (def.offsetFrames || 0);
          const end = Math.min(scene.durationFrames, start + def.durationFrames);
          newBlocks.push({
            id: blockId,
            layerId,
            preset: def.preset,
            startFrame: start,
            endFrame: end,
            easing: def.easing,
            customCurve: def.customCurve,
            cameraTo: def.cameraTo,
          });
        }
      }
    }

    set((s: any) => ({
      scenes: s.scenes.map((sc: any) =>
        sc.id === s.activeSceneId
          ? {
              ...sc,
              animationBlocks: [...sc.animationBlocks, ...newBlocks],
            }
          : sc,
      ),
    }));
  },

  applySceneTemplate: (template, mode) => {
    const state = get();

    const idMap = new Map<string, string>();
    for (const layer of template.layers) {
      idMap.set(layer.id, `layer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    }

    const remappedLayers: Layer[] = template.layers.map((layer) => ({
      ...layer,
      id: idMap.get(layer.id)!,
      parentId: layer.parentId && idMap.has(layer.parentId) ? idMap.get(layer.parentId)! : null,
      effects: layer.effects ? [...layer.effects] : [],
      effectsOrder: layer.effectsOrder ? [...layer.effectsOrder] : (layer.effects ? layer.effects.map((e) => e.id) : []),
    }));

    const remappedBlocks: AnimationBlock[] = template.animationBlocks.map((block) => {
      const remappedLayerId = block.layerId && idMap.has(block.layerId)
        ? idMap.get(block.layerId)!
        : block.layerId;
      return {
        ...block,
        id: `anim-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        layerId: remappedLayerId,
      } as AnimationBlock;
    });

    if (mode === "new") {
      const newSceneId = `scene-${Date.now()}`;
      const newScene: Scene = {
        id: newSceneId,
        name: template.name,
        durationFrames: template.durationFrames || 180,
        fps: template.fps || 30,
        camera: template.camera || {
          x: 0,
          y: 0,
          z: 0,
          fov: 60,
          focusDistance: 1000,
        },
        layers: remappedLayers,
        animationBlocks: remappedBlocks,
        effects: (template as any).effects || [],
        effectsOrder: (template as any).effectsOrder || ((template as any).effects ? (template as any).effects.map((e: any) => e.id) : []),
      };

      set((s: any) => ({
        scenes: [...s.scenes, newScene],
        activeSceneId: newSceneId,
        selectedLayerIds: remappedLayers.map((l) => l.id),
      }));
      useEditorUIStore.getState().setCurrentFrame(0);
      return newSceneId;
    } else {
      const currentScene = state.scenes.find((s: any) => s.id === state.activeSceneId);
      if (!currentScene) return state.activeSceneId;

      set((s: any) => ({
        scenes: s.scenes.map((sc: any) =>
          sc.id === s.activeSceneId
            ? {
                ...sc,
                layers: [...sc.layers, ...remappedLayers],
                animationBlocks: [...sc.animationBlocks, ...remappedBlocks],
              }
            : sc,
        ),
        selectedLayerIds: remappedLayers.map((l) => l.id),
      }));
      return state.activeSceneId;
    }
  },
});
