import type { AnimationBlock } from "../animation-blocks";
import type {
  Layer,
  LayerType,
  Transform,
} from "../editor-store";
import { getLayerVisualAABB } from "../editor-store";
import { useEditorUIStore } from "../editor-store";

export type LayersSlice = {
  addImportedLayers: (layers: Layer[], selectIds?: string[]) => void;
  addLayer: (sceneId?: string, layer?: Partial<Layer>) => string;
  updateLayer: (id: string, partial: Partial<Layer>) => void;
  removeLayer: (id: string) => void;
  removeLayers: (ids: string[]) => void;
  toggleLayerVisibility: (id: string) => void;
  toggleLayerLock: (id: string) => void;
  reorderLayers: (sceneId: string, orderedLayers: Layer[]) => void;
  bringLayerForward: (sceneId?: string, layerId?: string) => void;
  sendLayerBackward: (sceneId?: string, layerId?: string) => void;
  bringLayerToFront: (sceneId?: string, layerId?: string) => void;
  sendLayerToBack: (sceneId?: string, layerId?: string) => void;
  reparentLayer: (layerId: string, newParentId: string | null, targetIndex?: number) => void;
  groupSelectedLayers: () => string | null;
  ungroupSelectedLayers: () => string[];
  alignLeft: () => void;
  alignRight: () => void;
  alignTop: () => void;
  alignBottom: () => void;
  alignCenterHorizontal: () => void;
  alignCenterVertical: () => void;
  flipHorizontal: () => void;
  flipVertical: () => void;
  duplicateSelectedLayers: () => string[];
  nudgeSelectedLayers: (dx: number, dy: number) => void;
  pasteLayers: (layers: Layer[]) => string[];
  selectLayers: (ids: string[]) => void;
  moveLayerDepth: (id: string, delta: number) => void;
  toggleSelectedLayersVisibility: () => void;
  setSelectedLayersOpacity: (opacity: number) => void;
  applyZSpread: (sceneId?: string, spacing?: number) => void;
};

type SetState = <T>(partial: T | ((state: T) => T)) => void;
type GetState = () => any;

export const createLayersSlice = (set: SetState, get: GetState): LayersSlice => ({
  addImportedLayers: (layers, selectIds) => {
    if (!layers.length) return;
    const normalized = layers.map((l) => ({
      ...l,
      effects: l.effects ? [...l.effects] : [],
      effectsOrder: l.effectsOrder
        ? [...l.effectsOrder]
        : (l.effects ? l.effects.map((e) => e.id) : []),
    }));
    set((state: any) => ({
      scenes: state.scenes.map((sc: any) =>
        sc.id === state.activeSceneId
          ? { ...sc, layers: [...sc.layers, ...normalized] }
          : sc,
      ),
      selectedLayerIds: selectIds ?? [normalized[0].id],
    }));
  },

  addLayer: (sceneId, layerOverride) => {
    const targetSceneId = sceneId || get().activeSceneId;
    const newLayerId = `layer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const type: LayerType = layerOverride?.type || "shape";

    const defaultTransform: Transform = {
      x: 100,
      y: 100,
      width: 200,
      height: 200,
      rotation: 0,
      depth: 0,
    };

    const newLayer: Layer = {
      id: newLayerId,
      parentId: null,
      type,
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${
        (get().scenes.find((s: any) => s.id === targetSceneId)?.layers.length || 0) + 1
      }`,
      transform: {
        ...defaultTransform,
        ...(layerOverride?.transform || {}),
      },
      opacity: 1,
      visible: true,
      locked: false,
      effects: layerOverride?.effects ? [...layerOverride.effects] : [],
      effectsOrder: layerOverride?.effectsOrder ? [...layerOverride.effectsOrder] : [],
      ...(type === "shape"
        ? { shape: { kind: "rect", fill: "#38bdf8", stroke: "#0284c7" } }
        : type === "text"
        ? {
            text: {
              content: "Heading Text",
              fontSize: 32,
              fontFamily: "Inter",
              color: "#ffffff",
              align: "left",
            },
          }
        : type === "image"
        ? { image: { src: "", naturalWidth: 1920, naturalHeight: 1080 } }
        : {}),
      ...layerOverride,
    };

    set((state: any) => ({
      scenes: state.scenes.map((scene: any) =>
        scene.id === targetSceneId
          ? { ...scene, layers: [...scene.layers, newLayer] }
          : scene,
      ),
      selectedLayerIds: [newLayerId],
    }));

    return newLayerId;
  },

  updateLayer: (id, partial) => {
    set((state: any) => ({
      scenes: state.scenes.map((scene: any) => ({
        ...scene,
        layers: scene.layers.map((layer: any) => {
          if (layer.id !== id) return layer;
          return {
            ...layer,
            ...partial,
            transform: partial.transform
              ? { ...layer.transform, ...partial.transform }
              : layer.transform,
            shape: partial.shape ? { ...layer.shape, ...partial.shape } : layer.shape,
            text: partial.text ? { ...layer.text, ...partial.text } : layer.text,
            image: partial.image ? { ...layer.image, ...partial.image } : layer.image,
          };
        }),
      })),
    }));
  },

  removeLayer: (id) => {
    get().removeLayers([id]);
  },

  removeLayers: (ids) => {
    if (!ids.length) return;
    const idSet = new Set(ids);
    set((state: any) => {
      const scene = state.scenes.find((s: any) => s.id === state.activeSceneId);
      if (scene) {
        let changed = true;
        while (changed) {
          changed = false;
          for (const l of scene.layers) {
            if (l.parentId && idSet.has(l.parentId) && !idSet.has(l.id)) {
              idSet.add(l.id);
              changed = true;
            }
          }
        }
      }

      return {
        scenes: state.scenes.map((sc: any) =>
          sc.id === state.activeSceneId
            ? {
                ...sc,
                layers: sc.layers.filter((l: any) => !idSet.has(l.id)),
                animationBlocks: (sc.animationBlocks || []).filter(
                  (b: any) => !b.layerId || !idSet.has(b.layerId),
                ),
              }
            : sc,
        ),
        selectedLayerIds: state.selectedLayerIds.filter((selId: any) => !idSet.has(selId)),
      };
    });
  },

  toggleLayerVisibility: (id) => {
    set((state: any) => ({
      scenes: state.scenes.map((scene: any) => ({
        ...scene,
        layers: scene.layers.map((l: any) =>
          l.id === id ? { ...l, visible: !l.visible } : l,
        ),
      })),
    }));
  },

  toggleLayerLock: (id) => {
    set((state: any) => ({
      scenes: state.scenes.map((scene: any) => ({
        ...scene,
        layers: scene.layers.map((l: any) =>
          l.id === id ? { ...l, locked: !l.locked } : l,
        ),
      })),
    }));
  },

  reorderLayers: (sceneId, orderedLayers) => {
    set((state: any) => ({
      scenes: state.scenes.map((scene: any) =>
        scene.id === sceneId ? { ...scene, layers: orderedLayers } : scene,
      ),
    }));
  },

  bringLayerForward: (sceneId, layerId) => {
    const state = get();
    const scId = sceneId || state.activeSceneId;
    const scene = state.scenes.find((s: any) => s.id === scId);
    if (!scene || scene.layers.length <= 1) return;

    const targetIds = layerId ? [layerId] : state.selectedLayerIds;
    if (targetIds.length === 0) return;

    const targetSet = new Set(targetIds);
    const layers = [...scene.layers];
    for (let i = layers.length - 2; i >= 0; i--) {
      if (targetSet.has(layers[i].id) && !targetSet.has(layers[i + 1].id)) {
        const temp = layers[i];
        layers[i] = layers[i + 1];
        layers[i + 1] = temp;
      }
    }
    set((s: any) => ({
      scenes: s.scenes.map((sc: any) =>
        sc.id === scId ? { ...sc, layers } : sc,
      ),
    }));
  },

  sendLayerBackward: (sceneId, layerId) => {
    const state = get();
    const scId = sceneId || state.activeSceneId;
    const scene = state.scenes.find((s: any) => s.id === scId);
    if (!scene || scene.layers.length <= 1) return;

    const targetIds = layerId ? [layerId] : state.selectedLayerIds;
    if (targetIds.length === 0) return;

    const targetSet = new Set(targetIds);
    const layers = [...scene.layers];
    for (let i = 1; i < layers.length; i++) {
      if (targetSet.has(layers[i].id) && !targetSet.has(layers[i - 1].id)) {
        const temp = layers[i];
        layers[i] = layers[i - 1];
        layers[i - 1] = temp;
      }
    }
    set((s: any) => ({
      scenes: s.scenes.map((sc: any) =>
        sc.id === scId ? { ...sc, layers } : sc,
      ),
    }));
  },

  bringLayerToFront: (sceneId, layerId) => {
    const state = get();
    const scId = sceneId || state.activeSceneId;
    const scene = state.scenes.find((s: any) => s.id === scId);
    if (!scene || scene.layers.length <= 1) return;

    const targetIds = layerId ? [layerId] : state.selectedLayerIds;
    if (targetIds.length === 0) return;

    const targetSet = new Set(targetIds);
    const unselected = scene.layers.filter((l: any) => !targetSet.has(l.id));
    const selected = scene.layers.filter((l: any) => targetSet.has(l.id));
    const layers = [...unselected, ...selected];

    set((s: any) => ({
      scenes: s.scenes.map((sc: any) =>
        sc.id === scId ? { ...sc, layers } : sc,
      ),
    }));
  },

  sendLayerToBack: (sceneId, layerId) => {
    const state = get();
    const scId = sceneId || state.activeSceneId;
    const scene = state.scenes.find((s: any) => s.id === scId);
    if (!scene || scene.layers.length <= 1) return;

    const targetIds = layerId ? [layerId] : state.selectedLayerIds;
    if (targetIds.length === 0) return;

    const targetSet = new Set(targetIds);
    const unselected = scene.layers.filter((l: any) => !targetSet.has(l.id));
    const selected = scene.layers.filter((l: any) => targetSet.has(l.id));
    const layers = [...selected, ...unselected];

    set((s: any) => ({
      scenes: s.scenes.map((sc: any) =>
        sc.id === scId ? { ...sc, layers } : sc,
      ),
    }));
  },

  reparentLayer: (layerId, newParentId, targetIndex) => {
    set((state: any) => {
      const scene = state.scenes.find((s: any) => s.id === state.activeSceneId);
      if (!scene) return state;

      const layer = scene.layers.find((l: any) => l.id === layerId);
      if (!layer) return state;

      if (newParentId) {
        let curr: string | null = newParentId;
        while (curr) {
          if (curr === layerId) return state;
          const parentLayer = scene.layers.find((l: any) => l.id === curr);
          curr = parentLayer ? (parentLayer.parentId ?? null) : null;
        }
      }

      const updatedLayer = { ...layer, parentId: newParentId };
      const withoutMoved = scene.layers.filter((l: any) => l.id !== layerId);

      let newLayers: Layer[];
      if (typeof targetIndex === "number" && targetIndex >= 0) {
        const safeIndex = Math.min(targetIndex, withoutMoved.length);
        newLayers = [
          ...withoutMoved.slice(0, safeIndex),
          updatedLayer,
          ...withoutMoved.slice(safeIndex),
        ];
      } else if (newParentId) {
        const parentIdx = withoutMoved.findIndex((l: any) => l.id === newParentId);
        if (parentIdx >= 0) {
          newLayers = [
            ...withoutMoved.slice(0, parentIdx + 1),
            updatedLayer,
            ...withoutMoved.slice(parentIdx + 1),
          ];
        } else {
          newLayers = [...withoutMoved, updatedLayer];
        }
      } else {
        newLayers = [...withoutMoved, updatedLayer];
      }

      return {
        scenes: state.scenes.map((sc: any) =>
          sc.id === state.activeSceneId ? { ...sc, layers: newLayers } : sc,
        ),
      };
    });
  },

  groupSelectedLayers: () => {
    const state = get();
    const scene = state.scenes.find((s: any) => s.id === state.activeSceneId);
    if (!scene || state.selectedLayerIds.length === 0) return null;

    const selectedLayers = scene.layers.filter((l: any) =>
      state.selectedLayerIds.includes(l.id),
    );
    if (!selectedLayers.length) return null;

    const minX = Math.min(...selectedLayers.map((l: any) => l.transform.x));
    const minY = Math.min(...selectedLayers.map((l: any) => l.transform.y));
    const maxX = Math.max(
      ...selectedLayers.map((l: any) => l.transform.x + l.transform.width),
    );
    const maxY = Math.max(
      ...selectedLayers.map((l: any) => l.transform.y + l.transform.height),
    );

    const groupId = `group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const groupCount = scene.layers.filter((l: any) => l.type === "group").length;

    const groupLayer: Layer = {
      id: groupId,
      parentId: null,
      type: "group",
      name: `Group ${groupCount + 1}`,
      transform: {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
        rotation: 0,
        depth: 0,
      },
      opacity: 1,
      visible: true,
      locked: false,
      effects: [],
      effectsOrder: [],
    };

    const firstIdx = scene.layers.findIndex((l: any) =>
      state.selectedLayerIds.includes(l.id),
    );

    const selectedIdSet = new Set(state.selectedLayerIds);
    const unselectedLayers = scene.layers.filter((l: any) => !selectedIdSet.has(l.id));
    const reparentedChildren = selectedLayers.map((l: any) => ({
      ...l,
      parentId: groupId,
    }));

    const insertPos = firstIdx >= 0 ? Math.min(firstIdx, unselectedLayers.length) : 0;
    const newLayers = [
      ...unselectedLayers.slice(0, insertPos),
      groupLayer,
      ...reparentedChildren,
      ...unselectedLayers.slice(insertPos),
    ];

    set({
      scenes: state.scenes.map((sc: any) =>
        sc.id === state.activeSceneId ? { ...sc, layers: newLayers } : sc,
      ),
      selectedLayerIds: [groupId],
    });

    return groupId;
  },

  ungroupSelectedLayers: () => {
    const state = get();
    const scene = state.scenes.find((s: any) => s.id === state.activeSceneId);
    if (!scene || state.selectedLayerIds.length === 0) return [];

    const selectedGroups = scene.layers.filter(
      (l: any) => state.selectedLayerIds.includes(l.id) && l.type === "group",
    );
    if (selectedGroups.length === 0) return [];

    let currentLayers = [...scene.layers];
    const allUnparentedChildIds: string[] = [];

    for (const group of selectedGroups) {
      const groupParentId = group.parentId ?? null;
      const groupIdx = currentLayers.findIndex((l: any) => l.id === group.id);
      if (groupIdx === -1) continue;

      const children = currentLayers.filter((l: any) => l.parentId === group.id);

      const groupW = Math.max(1, group.transform.width);
      const groupH = Math.max(1, group.transform.height);
      const groupCX = group.transform.x + groupW / 2;
      const groupCY = group.transform.y + groupH / 2;
      const dRot = group.transform.rotation || 0;
      const dRotRad = (dRot * Math.PI) / 180;
      const cosRot = Math.cos(dRotRad);
      const sinRot = Math.sin(dRotRad);

      const reparentedChildren = children.map((child: any) => {
        allUnparentedChildIds.push(child.id);
        const childCX = child.transform.x + child.transform.width / 2;
        const childCY = child.transform.y + child.transform.height / 2;
        const relX = childCX - groupCX;
        const relY = childCY - groupCY;
        const rotRelX = relX * cosRot - relY * sinRot;
        const rotRelY = relX * sinRot + relY * cosRot;
        const newChildCX = groupCX + rotRelX;
        const newChildCY = groupCY + rotRelY;

        const composedOpacity = Math.max(
          0,
          Math.min(1, (child.opacity ?? 1) * (group.opacity ?? 1)),
        );

        return {
          ...child,
          parentId: groupParentId,
          transform: {
            ...child.transform,
            x: Math.round(newChildCX - child.transform.width / 2),
            y: Math.round(newChildCY - child.transform.height / 2),
            rotation: Math.round((child.transform.rotation || 0) + dRot),
            depth: (child.transform.depth || 0) + (group.transform.depth || 0),
          },
          opacity: composedOpacity,
        };
      });

      const remaining = currentLayers.filter(
        (l: any) => l.id !== group.id && l.parentId !== group.id,
      );
      const insertPos = Math.min(groupIdx, remaining.length);
      currentLayers = [
        ...remaining.slice(0, insertPos),
        ...reparentedChildren,
        ...remaining.slice(insertPos),
      ];
    }

    set({
      scenes: state.scenes.map((sc: any) =>
        sc.id === state.activeSceneId ? { ...sc, layers: currentLayers } : sc,
      ),
      selectedLayerIds: allUnparentedChildIds,
    });

    return allUnparentedChildIds;
  },

  alignLeft: () => {
    const state = get();
    const scene = state.scenes.find((s: any) => s.id === state.activeSceneId);
    if (!scene || state.selectedLayerIds.length === 0) return;
    const selected = scene.layers.filter((l: any) => state.selectedLayerIds.includes(l.id));
    if (selected.length === 0) return;

    let targetMinX: number;
    if (selected.length >= 2) {
      targetMinX = Math.min(...selected.map((l: any) => getLayerVisualAABB(l).minX));
    } else {
      targetMinX = 0;
    }

    set({
      scenes: state.scenes.map((sc: any) =>
        sc.id === state.activeSceneId
          ? {
              ...sc,
              layers: sc.layers.map((layer: any) => {
                if (!state.selectedLayerIds.includes(layer.id)) return layer;
                const aabb = getLayerVisualAABB(layer);
                const deltaX = targetMinX - aabb.minX;
                return {
                  ...layer,
                  transform: { ...layer.transform, x: Math.round(layer.transform.x + deltaX) },
                };
              }),
            }
          : sc,
      ),
    });
  },

  alignRight: () => {
    const state = get();
    const scene = state.scenes.find((s: any) => s.id === state.activeSceneId);
    if (!scene || state.selectedLayerIds.length === 0) return;
    const selected = scene.layers.filter((l: any) => state.selectedLayerIds.includes(l.id));
    if (selected.length === 0) return;

    let targetMaxX: number;
    if (selected.length >= 2) {
      targetMaxX = Math.max(...selected.map((l: any) => getLayerVisualAABB(l).maxX));
    } else {
      targetMaxX = state.aspectRatio === "9:16" ? 1080 : state.aspectRatio === "1:1" ? 1080 : 1920;
    }

    set({
      scenes: state.scenes.map((sc: any) =>
        sc.id === state.activeSceneId
          ? {
              ...sc,
              layers: sc.layers.map((layer: any) => {
                if (!state.selectedLayerIds.includes(layer.id)) return layer;
                const aabb = getLayerVisualAABB(layer);
                const deltaX = targetMaxX - aabb.maxX;
                return {
                  ...layer,
                  transform: { ...layer.transform, x: Math.round(layer.transform.x + deltaX) },
                };
              }),
            }
          : sc,
      ),
    });
  },

  alignTop: () => {
    const state = get();
    const scene = state.scenes.find((s: any) => s.id === state.activeSceneId);
    if (!scene || state.selectedLayerIds.length === 0) return;
    const selected = scene.layers.filter((l: any) => state.selectedLayerIds.includes(l.id));
    if (selected.length === 0) return;

    let targetMinY: number;
    if (selected.length >= 2) {
      targetMinY = Math.min(...selected.map((l: any) => getLayerVisualAABB(l).minY));
    } else {
      targetMinY = 0;
    }

    set({
      scenes: state.scenes.map((sc: any) =>
        sc.id === state.activeSceneId
          ? {
              ...sc,
              layers: sc.layers.map((layer: any) => {
                if (!state.selectedLayerIds.includes(layer.id)) return layer;
                const aabb = getLayerVisualAABB(layer);
                const deltaY = targetMinY - aabb.minY;
                return {
                  ...layer,
                  transform: { ...layer.transform, y: Math.round(layer.transform.y + deltaY) },
                };
              }),
            }
          : sc,
      ),
    });
  },

  alignBottom: () => {
    const state = get();
    const scene = state.scenes.find((s: any) => s.id === state.activeSceneId);
    if (!scene || state.selectedLayerIds.length === 0) return;
    const selected = scene.layers.filter((l: any) => state.selectedLayerIds.includes(l.id));
    if (selected.length === 0) return;

    let targetMaxY: number;
    if (selected.length >= 2) {
      targetMaxY = Math.max(...selected.map((l: any) => getLayerVisualAABB(l).maxY));
    } else {
      targetMaxY = state.aspectRatio === "9:16" ? 1920 : state.aspectRatio === "1:1" ? 1080 : 1080;
    }

    set({
      scenes: state.scenes.map((sc: any) =>
        sc.id === state.activeSceneId
          ? {
              ...sc,
              layers: sc.layers.map((layer: any) => {
                if (!state.selectedLayerIds.includes(layer.id)) return layer;
                const aabb = getLayerVisualAABB(layer);
                const deltaY = targetMaxY - aabb.maxY;
                return {
                  ...layer,
                  transform: { ...layer.transform, y: Math.round(layer.transform.y + deltaY) },
                };
              }),
            }
          : sc,
      ),
    });
  },

  alignCenterHorizontal: () => {
    const state = get();
    const scene = state.scenes.find((s: any) => s.id === state.activeSceneId);
    if (!scene || state.selectedLayerIds.length === 0) return;
    const selected = scene.layers.filter((l: any) => state.selectedLayerIds.includes(l.id));
    if (selected.length === 0) return;

    let targetCenterH: number;
    if (selected.length >= 2) {
      const minX = Math.min(...selected.map((l: any) => getLayerVisualAABB(l).minX));
      const maxX = Math.max(...selected.map((l: any) => getLayerVisualAABB(l).maxX));
      targetCenterH = (minX + maxX) / 2;
    } else {
      const frameW = state.aspectRatio === "9:16" ? 1080 : state.aspectRatio === "1:1" ? 1080 : 1920;
      targetCenterH = frameW / 2;
    }

    set({
      scenes: state.scenes.map((sc: any) =>
        sc.id === state.activeSceneId
          ? {
              ...sc,
              layers: sc.layers.map((layer: any) => {
                if (!state.selectedLayerIds.includes(layer.id)) return layer;
                const aabb = getLayerVisualAABB(layer);
                const deltaX = targetCenterH - aabb.centerH;
                return {
                  ...layer,
                  transform: { ...layer.transform, x: Math.round(layer.transform.x + deltaX) },
                };
              }),
            }
          : sc,
      ),
    });
  },

  alignCenterVertical: () => {
    const state = get();
    const scene = state.scenes.find((s: any) => s.id === state.activeSceneId);
    if (!scene || state.selectedLayerIds.length === 0) return;
    const selected = scene.layers.filter((l: any) => state.selectedLayerIds.includes(l.id));
    if (selected.length === 0) return;

    let targetCenterV: number;
    if (selected.length >= 2) {
      const minY = Math.min(...selected.map((l: any) => getLayerVisualAABB(l).minY));
      const maxY = Math.max(...selected.map((l: any) => getLayerVisualAABB(l).maxY));
      targetCenterV = (minY + maxY) / 2;
    } else {
      const frameH = state.aspectRatio === "9:16" ? 1920 : state.aspectRatio === "1:1" ? 1080 : 1080;
      targetCenterV = frameH / 2;
    }

    set({
      scenes: state.scenes.map((sc: any) =>
        sc.id === state.activeSceneId
          ? {
              ...sc,
              layers: sc.layers.map((layer: any) => {
                if (!state.selectedLayerIds.includes(layer.id)) return layer;
                const aabb = getLayerVisualAABB(layer);
                const deltaY = targetCenterV - aabb.centerV;
                return {
                  ...layer,
                  transform: { ...layer.transform, y: Math.round(layer.transform.y + deltaY) },
                };
              }),
            }
          : sc,
      ),
    });
  },

  flipHorizontal: () => {
    const state = get();
    const scene = state.scenes.find((s: any) => s.id === state.activeSceneId);
    if (!scene || state.selectedLayerIds.length === 0) return;
    const selected = scene.layers.filter((l: any) => state.selectedLayerIds.includes(l.id));
    if (selected.length === 0) return;

    if (selected.length === 1) {
      const target = selected[0];
      set({
        scenes: state.scenes.map((sc: any) =>
          sc.id === state.activeSceneId
            ? {
                ...sc,
                layers: sc.layers.map((l: any) =>
                  l.id === target.id
                    ? {
                        ...l,
                        transform: { ...l.transform, flipX: !l.transform.flipX },
                      }
                    : l,
                ),
              }
            : sc,
        ),
      });
      return;
    }

    const minX = Math.min(...selected.map((l: any) => getLayerVisualAABB(l).minX));
    const maxX = Math.max(...selected.map((l: any) => getLayerVisualAABB(l).maxX));
    const selCenterH = (minX + maxX) / 2;

    set({
      scenes: state.scenes.map((sc: any) =>
        sc.id === state.activeSceneId
          ? {
              ...sc,
              layers: sc.layers.map((layer: any) => {
                if (!state.selectedLayerIds.includes(layer.id)) return layer;
                const layerCX = layer.transform.x + layer.transform.width / 2;
                const newCX = 2 * selCenterH - layerCX;
                return {
                  ...layer,
                  transform: {
                    ...layer.transform,
                    x: Math.round(newCX - layer.transform.width / 2),
                    rotation: layer.transform.rotation ? -layer.transform.rotation : 0,
                    flipX: !layer.transform.flipX,
                  },
                };
              }),
            }
          : sc,
      ),
    });
  },

  flipVertical: () => {
    const state = get();
    const scene = state.scenes.find((s: any) => s.id === state.activeSceneId);
    if (!scene || state.selectedLayerIds.length === 0) return;
    const selected = scene.layers.filter((l: any) => state.selectedLayerIds.includes(l.id));
    if (selected.length === 0) return;

    if (selected.length === 1) {
      const target = selected[0];
      set({
        scenes: state.scenes.map((sc: any) =>
          sc.id === state.activeSceneId
            ? {
                ...sc,
                layers: sc.layers.map((l: any) =>
                  l.id === target.id
                    ? {
                        ...l,
                        transform: { ...l.transform, flipY: !l.transform.flipY },
                      }
                    : l,
                ),
              }
            : sc,
        ),
      });
      return;
    }

    const minY = Math.min(...selected.map((l: any) => getLayerVisualAABB(l).minY));
    const maxY = Math.max(...selected.map((l: any) => getLayerVisualAABB(l).maxY));
    const selCenterV = (minY + maxY) / 2;

    set({
      scenes: state.scenes.map((sc: any) =>
        sc.id === state.activeSceneId
          ? {
              ...sc,
              layers: sc.layers.map((layer: any) => {
                if (!state.selectedLayerIds.includes(layer.id)) return layer;
                const layerCY = layer.transform.y + layer.transform.height / 2;
                const newCY = 2 * selCenterV - layerCY;
                return {
                  ...layer,
                  transform: {
                    ...layer.transform,
                    y: Math.round(newCY - layer.transform.height / 2),
                    rotation: layer.transform.rotation ? -layer.transform.rotation : 0,
                    flipY: !layer.transform.flipY,
                  },
                };
              }),
            }
          : sc,
      ),
    });
  },

  duplicateSelectedLayers: () => {
    const state = get();
    const scene = state.scenes.find((s: any) => s.id === state.activeSceneId);
    if (!scene || state.selectedLayerIds.length === 0) return [];

    const selectedSet = new Set(state.selectedLayerIds);
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const l of scene.layers) {
        if (l.parentId && selectedSet.has(l.parentId) && !selectedSet.has(l.id)) {
          selectedSet.add(l.id);
          expanded = true;
        }
      }
    }

    const layersToDuplicate = scene.layers.filter((l: any) => selectedSet.has(l.id));
    if (!layersToDuplicate.length) return [];

    const idMap = new Map<string, string>();
    for (const l of layersToDuplicate) {
      idMap.set(
        l.id,
        `layer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      );
    }

    const clonedLayers: Layer[] = layersToDuplicate.map((l: any) => {
      const newId = idMap.get(l.id)!;
      const newParentId = l.parentId && idMap.has(l.parentId) ? idMap.get(l.parentId)! : l.parentId;
      const clonedEffects = (l.effects || []).map((fx: any) => ({
        ...fx,
        id: `lfx-${fx.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      }));
      const effectIdMap = new Map((l.effects || []).map((fx: any, i: number) => [fx.id, clonedEffects[i].id]));
      const clonedOrder = (l.effectsOrder || []).map((id: string) => effectIdMap.get(id) || id);
      return {
        ...l,
        id: newId,
        parentId: newParentId,
        name: `${l.name} Copy`,
        transform: {
          ...l.transform,
          x: l.transform.x + 10,
          y: l.transform.y + 10,
        },
        effects: clonedEffects,
        effectsOrder: clonedOrder,
      };
    });

    const newSelectedIds = layersToDuplicate
      .filter((l: any) => state.selectedLayerIds.includes(l.id))
      .map((l: any) => idMap.get(l.id)!);

    const clonedBlocks: AnimationBlock[] = [];
    for (const b of scene.animationBlocks || []) {
      if (b.layerId && idMap.has(b.layerId)) {
        clonedBlocks.push({
          ...b,
          id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          layerId: idMap.get(b.layerId)!,
        });
      }
    }

    set({
      scenes: state.scenes.map((sc: any) =>
        sc.id === state.activeSceneId
          ? {
              ...sc,
              layers: [...sc.layers, ...clonedLayers],
              animationBlocks: [...(sc.animationBlocks || []), ...clonedBlocks],
            }
          : sc,
      ),
      selectedLayerIds: newSelectedIds,
    });

    return newSelectedIds;
  },

  nudgeSelectedLayers: (dx, dy) => {
    set((state: any) => {
      const activeScene = state.scenes.find((s: any) => s.id === state.activeSceneId);
      if (!activeScene) return state;

      const allAffected = new Set(state.selectedLayerIds);
      let expanded = true;
      while (expanded) {
        expanded = false;
        for (const l of activeScene.layers) {
          if (l.parentId && allAffected.has(l.parentId) && !allAffected.has(l.id)) {
            allAffected.add(l.id);
            expanded = true;
          }
        }
      }

      return {
        scenes: state.scenes.map((scene: any) =>
          scene.id === state.activeSceneId
            ? {
                ...scene,
                layers: scene.layers.map((l: any) =>
                  allAffected.has(l.id)
                    ? {
                        ...l,
                        transform: {
                          ...l.transform,
                          x: l.transform.x + dx,
                          y: l.transform.y + dy,
                        },
                      }
                    : l,
                ),
              }
            : scene,
        ),
      };
    });

    if (useEditorUIStore.getState().animateMode) {
      const state = get();
      const activeScene = state.scenes.find((s: any) => s.id === state.activeSceneId);
      if (activeScene) {
        const currentFrame = useEditorUIStore.getState().currentFrame;
        for (const l of activeScene.layers) {
          if (state.selectedLayerIds.includes(l.id)) {
            get().recordKeyframe(l.id, "x", l.transform.x, currentFrame, state.activeSceneId);
            get().recordKeyframe(l.id, "y", l.transform.y, currentFrame, state.activeSceneId);
          }
        }
      }
    }
  },

  pasteLayers: (layers) => {
    if (!layers.length) return [];
    const state = get();
    const idMap = new Map<string, string>();
    for (const l of layers) {
      idMap.set(
        l.id,
        `layer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      );
    }

    const clonedLayers: Layer[] = layers.map((l) => {
      const newId = idMap.get(l.id)!;
      const newParentId =
        l.parentId && idMap.has(l.parentId) ? idMap.get(l.parentId)! : null;
      const clonedEffects = (l.effects || []).map((fx) => ({
        ...fx,
        id: `lfx-${fx.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      }));
      const effectIdMap = new Map((l.effects || []).map((fx, i) => [fx.id, clonedEffects[i].id]));
      const clonedOrder = (l.effectsOrder || []).map((id) => effectIdMap.get(id) || id);
      return {
        ...l,
        id: newId,
        parentId: newParentId,
        transform: {
          ...l.transform,
          x: l.transform.x + 20,
          y: l.transform.y + 20,
        },
        effects: clonedEffects,
        effectsOrder: clonedOrder,
      };
    });

    const newIds = clonedLayers.map((l) => l.id);

    set({
      scenes: state.scenes.map((sc: any) =>
        sc.id === state.activeSceneId
          ? { ...sc, layers: [...sc.layers, ...clonedLayers] }
          : sc,
      ),
      selectedLayerIds: newIds,
    });

    return newIds;
  },

  selectLayers: (ids) => {
    if (ids.length > 0) {
      useEditorUIStore.getState().setIsCameraSelected(false);
      useEditorUIStore.getState().setIsLightSelected(false);
      if (useEditorUIStore.getState().activeTool === "camera") {
        useEditorUIStore.getState().setActiveTool("scene");
      }
    }
    set({ selectedLayerIds: ids });
  },

  moveLayerDepth: (id, delta) => {
    set((state: any) => ({
      scenes: state.scenes.map((scene: any) => ({
        ...scene,
        layers: scene.layers.map((layer: any) =>
          layer.id === id
            ? {
                ...layer,
                transform: {
                  ...layer.transform,
                  depth: layer.transform.depth + delta,
                },
              }
            : layer,
        ),
      })),
    }));
  },

  toggleSelectedLayersVisibility: () => {
    const state = get();
    const scene = state.scenes.find((s: any) => s.id === state.activeSceneId);
    if (!scene || state.selectedLayerIds.length === 0) return;
    const selectedLayers = scene.layers.filter((l: any) => state.selectedLayerIds.includes(l.id));
    if (!selectedLayers.length) return;
    const anyVisible = selectedLayers.some((l: any) => l.visible);
    const nextVisible = !anyVisible;
    const selSet = new Set(state.selectedLayerIds);

    set((s: any) => ({
      scenes: s.scenes.map((sc: any) =>
        sc.id === s.activeSceneId
          ? {
              ...sc,
              layers: sc.layers.map((l: any) =>
                selSet.has(l.id) ? { ...l, visible: nextVisible } : l
              ),
            }
          : sc,
      ),
    }));
  },

  setSelectedLayersOpacity: (opacity: number) => {
    const state = get();
    const scene = state.scenes.find((s: any) => s.id === state.activeSceneId);
    if (!scene || state.selectedLayerIds.length === 0) return;
    const clamped = Math.max(0, Math.min(1, opacity));
    const ui = useEditorUIStore.getState();

    if (ui.animateMode) {
      state.selectedLayerIds.forEach((id: string) => {
        get().recordKeyframe(id, "opacity", clamped, ui.currentFrame, state.activeSceneId);
      });
    }

    const selSet = new Set(state.selectedLayerIds);
    set((s: any) => ({
      scenes: s.scenes.map((sc: any) =>
        sc.id === s.activeSceneId
          ? {
              ...sc,
              layers: sc.layers.map((l: any) =>
                selSet.has(l.id) ? { ...l, opacity: clamped } : l
              ),
            }
          : sc,
      ),
    }));
  },

  applyZSpread: (sceneId, spacing = 50) => {
    const targetSceneId = sceneId || get().activeSceneId;
    set((state: any) => ({
      scenes: state.scenes.map((scene: any) => {
        if (scene.id !== targetSceneId) return scene;
        const topLayers = scene.layers.filter((l: any) => !l.parentId);
        const topIds = new Set(topLayers.map((l: any) => l.id));
        const depthMap = new Map<string, number>();
        topLayers.forEach((layer: any, idx: number) => {
          depthMap.set(layer.id, idx * spacing);
        });
        return {
          ...scene,
          layers: scene.layers.map((layer: any) => {
            if (topIds.has(layer.id)) {
              return {
                ...layer,
                transform: {
                  ...layer.transform,
                  depth: depthMap.get(layer.id) ?? 0,
                },
              };
            }
            return layer;
          }),
        };
      }),
    }));
  },
});
