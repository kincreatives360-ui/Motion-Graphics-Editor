import type {
  SceneEffect,
  SceneEffectType,
  SceneLighting,
} from "../editor-store";
import { createDefaultSceneEffect } from "../editor-store";

export type SceneEffectsSlice = {
  updateSceneLighting: (partial: Partial<SceneLighting>, sceneId?: string) => void;
  addSceneEffect: (sceneId: string | undefined, type: SceneEffectType) => string;
  updateSceneEffect: (
    sceneId: string | undefined,
    effectId: string,
    partial: Partial<SceneEffect>,
  ) => void;
  removeSceneEffect: (sceneId: string | undefined, effectId: string) => void;
  toggleSceneEffectVisible: (sceneId: string | undefined, effectId: string) => void;
  reorderSceneEffects: (sceneId: string | undefined, newOrder: string[]) => void;
  replaceSceneEffectType: (
    sceneId: string | undefined,
    effectId: string,
    newType: SceneEffectType,
  ) => void;
};

type SetState = <T>(partial: T | ((state: T) => T)) => void;
type GetState = () => any;

export const createSceneEffectsSlice = (
  set: SetState,
  get: GetState,
): SceneEffectsSlice => ({
  updateSceneLighting: (partial, sceneId) => {
    const targetSceneId = sceneId || get().activeSceneId;
    set((state: any) => ({
      scenes: state.scenes.map((scene: any) =>
        scene.id === targetSceneId
          ? {
              ...scene,
              lighting: {
                ...(scene.lighting || {
                  enabled: true,
                  intensity: 0.6,
                  lightX: -300,
                  lightY: -450,
                  shadowBlur: 24,
                  shadowOpacity: 0.35,
                }),
                ...partial,
              },
            }
          : scene,
      ),
    }));
  },

  addSceneEffect: (sceneId, type) => {
    const targetSceneId = sceneId || get().activeSceneId;
    const newEffect = createDefaultSceneEffect(type);

    set((state: any) => ({
      scenes: state.scenes.map((scene: any) => {
        if (scene.id !== targetSceneId) return scene;
        const currentEffects = scene.effects || [];
        const currentOrder = scene.effectsOrder || currentEffects.map((e: any) => e.id);
        return {
          ...scene,
          effects: [...currentEffects, newEffect],
          effectsOrder: [...currentOrder, newEffect.id],
        };
      }),
    }));

    return newEffect.id;
  },

  updateSceneEffect: (sceneId, effectId, partial) => {
    const targetSceneId = sceneId || get().activeSceneId;
    set((state: any) => ({
      scenes: state.scenes.map((scene: any) => {
        if (scene.id !== targetSceneId) return scene;
        return {
          ...scene,
          effects: (scene.effects || []).map((fx: any) =>
            fx.id === effectId ? ({ ...fx, ...partial } as SceneEffect) : fx,
          ),
        };
      }),
    }));
  },

  removeSceneEffect: (sceneId, effectId) => {
    const targetSceneId = sceneId || get().activeSceneId;
    set((state: any) => ({
      scenes: state.scenes.map((scene: any) => {
        if (scene.id !== targetSceneId) return scene;
        return {
          ...scene,
          effects: (scene.effects || []).filter((fx: any) => fx.id !== effectId),
          effectsOrder: (scene.effectsOrder || []).filter((id: string) => id !== effectId),
        };
      }),
    }));
  },

  toggleSceneEffectVisible: (sceneId, effectId) => {
    const targetSceneId = sceneId || get().activeSceneId;
    set((state: any) => ({
      scenes: state.scenes.map((scene: any) => {
        if (scene.id !== targetSceneId) return scene;
        return {
          ...scene,
          effects: (scene.effects || []).map((fx: any) =>
            fx.id === effectId ? { ...fx, visible: !fx.visible } : fx,
          ),
        };
      }),
    }));
  },

  reorderSceneEffects: (sceneId, newOrder) => {
    const targetSceneId = sceneId || get().activeSceneId;
    set((state: any) => ({
      scenes: state.scenes.map((scene: any) => {
        if (scene.id !== targetSceneId) return scene;
        return {
          ...scene,
          effectsOrder: newOrder,
        };
      }),
    }));
  },

  replaceSceneEffectType: (sceneId, effectId, newType) => {
    const targetSceneId = sceneId || get().activeSceneId;
    const freshDefault = createDefaultSceneEffect(newType);

    set((state: any) => ({
      scenes: state.scenes.map((scene: any) => {
        if (scene.id !== targetSceneId) return scene;
        return {
          ...scene,
          effects: (scene.effects || []).map((fx: any) => {
            if (fx.id !== effectId) return fx;
            return {
              ...freshDefault,
              id: fx.id,
              enabled: fx.enabled,
              visible: fx.visible,
            };
          }),
        };
      }),
    }));
  },
});
