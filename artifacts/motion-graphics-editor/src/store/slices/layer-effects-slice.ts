import type {
  Layer,
  LayerEffect,
  LayerEffectType,
} from "../editor-store";
import { createDefaultLayerEffect, isLayerEffectAvailable } from "../editor-store";

export type LayerEffectsSlice = {
  addLayerEffect: (layerId: string, type: LayerEffectType) => string;
  updateLayerEffect: (
    layerId: string,
    effectId: string,
    partial: Partial<LayerEffect>,
  ) => void;
  removeLayerEffect: (layerId: string, effectId: string) => void;
  toggleLayerEffectVisible: (layerId: string, effectId: string) => void;
  reorderLayerEffects: (layerId: string, newOrder: string[]) => void;
  replaceLayerEffectType: (
    layerId: string,
    effectId: string,
    newType: LayerEffectType,
  ) => void;
};

type SetState = <T>(partial: T | ((state: T) => T)) => void;
type GetState = () => any;

export const createLayerEffectsSlice = (
  set: SetState,
  get: GetState,
): LayerEffectsSlice => ({
  addLayerEffect: (layerId, type) => {
    const state = get();
    let targetLayer: Layer | undefined;
    for (const s of state.scenes) {
      const l = s.layers.find((ly: any) => ly.id === layerId);
      if (l) {
        targetLayer = l;
        break;
      }
    }
    if (targetLayer && !isLayerEffectAvailable(targetLayer, type)) {
      return "";
    }
    const newEffect = createDefaultLayerEffect(type);

    set((s: any) => ({
      scenes: s.scenes.map((scene: any) => ({
        ...scene,
        layers: scene.layers.map((layer: any) => {
          if (layer.id !== layerId) return layer;
          const currentEffects = layer.effects || [];
          const currentOrder =
            layer.effectsOrder && layer.effectsOrder.length > 0
              ? layer.effectsOrder
              : currentEffects.map((e: any) => e.id);
          return {
            ...layer,
            effects: [...currentEffects, newEffect],
            effectsOrder: [...currentOrder, newEffect.id],
          };
        }),
      })),
    }));

    return newEffect.id;
  },

  updateLayerEffect: (layerId, effectId, partial) => {
    set((state: any) => ({
      scenes: state.scenes.map((scene: any) => ({
        ...scene,
        layers: scene.layers.map((layer: any) => {
          if (layer.id !== layerId) return layer;
          return {
            ...layer,
            effects: (layer.effects || []).map((fx: any) =>
              fx.id === effectId
                ? ({ ...fx, ...partial } as LayerEffect)
                : fx,
            ),
          };
        }),
      })),
    }));
  },

  removeLayerEffect: (layerId, effectId) => {
    set((state: any) => ({
      scenes: state.scenes.map((scene: any) => ({
        ...scene,
        layers: scene.layers.map((layer: any) => {
          if (layer.id !== layerId) return layer;
          return {
            ...layer,
            effects: (layer.effects || []).filter((fx: any) => fx.id !== effectId),
            effectsOrder: (layer.effectsOrder || []).filter((id: string) => id !== effectId),
          };
        }),
      })),
    }));
  },

  toggleLayerEffectVisible: (layerId, effectId) => {
    set((state: any) => ({
      scenes: state.scenes.map((scene: any) => ({
        ...scene,
        layers: scene.layers.map((layer: any) => {
          if (layer.id !== layerId) return layer;
          return {
            ...layer,
            effects: (layer.effects || []).map((fx: any) =>
              fx.id === effectId ? { ...fx, visible: !fx.visible } : fx,
            ),
          };
        }),
      })),
    }));
  },

  reorderLayerEffects: (layerId, newOrder) => {
    set((state: any) => ({
      scenes: state.scenes.map((scene: any) => ({
        ...scene,
        layers: scene.layers.map((layer: any) => {
          if (layer.id !== layerId) return layer;
          return {
            ...layer,
            effectsOrder: newOrder,
          };
        }),
      })),
    }));
  },

  replaceLayerEffectType: (layerId, effectId, newType) => {
    const state = get();
    let targetLayer: Layer | undefined;
    for (const s of state.scenes) {
      const l = s.layers.find((ly: any) => ly.id === layerId);
      if (l) {
        targetLayer = l;
        break;
      }
    }
    if (targetLayer && !isLayerEffectAvailable(targetLayer, newType)) {
      return;
    }
    const freshDefault = createDefaultLayerEffect(newType);

    set((s: any) => ({
      scenes: s.scenes.map((scene: any) => ({
        ...scene,
        layers: scene.layers.map((layer: any) => {
          if (layer.id !== layerId) return layer;
          return {
            ...layer,
            effects: (layer.effects || []).map((fx: any) => {
              if (fx.id !== effectId) return fx;
              return {
                ...freshDefault,
                id: fx.id,
                enabled: fx.enabled,
                visible: fx.visible,
              } as LayerEffect;
            }),
          };
        }),
      })),
    }));
  },
});
