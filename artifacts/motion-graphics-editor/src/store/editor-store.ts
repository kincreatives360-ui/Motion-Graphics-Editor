import { create } from "zustand";
import { temporal } from "zundo";
import { useStore } from "zustand";
import { saveDocument } from "../persistence/local-store";
import type {
  AnimationBlock,
  BlockPreset,
  AnimatableProperty,
  Keyframe,
  KeyframeTrackBlock,
} from "./animation-blocks";
import { isKeyframeTrack } from "./animation-blocks";
import type { AnimationPreset, SceneTemplate } from "../presets/preset-library";

export type LayerType = "shape" | "text" | "image" | "group";

export interface Transform {
  x: number;
  y: number; // canvas-space position, top-left anchor
  width: number;
  height: number;
  rotation: number; // degrees
  depth: number; // 0 = camera plane, positive = further away
}

export interface Layer {
  id: string;
  parentId: string | null; // for grouping
  type: LayerType;
  name: string;
  transform: Transform;
  opacity: number; // 0-1
  visible: boolean;
  locked: boolean;
  // type-specific payload, keep it a discriminated union on `type`
  shape?: {
    kind: "rect" | "ellipse" | "path";
    fill: string;
    stroke?: string;
    strokeWidth?: number;
    radius?: number;
    path?: string; // raw SVG path data
    pathOriginX?: number;
    pathOriginY?: number;
  };
  text?: {
    content: string;
    fontSize: number;
    fontFamily: string;
    color: string;
    align: "left" | "center" | "right";
  };
  image?: {
    src: string;
    naturalWidth: number;
    naturalHeight: number;
    assetId?: string;
  };
}

export interface ProjectAsset {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  createdAt: number;
}

export interface Camera {
  x: number;
  y: number;
  z: number;
  fov: number; // degrees
  focusDistance: number; // for depth of field, added later
}

export interface BloomSettings {
  enabled: boolean;
  threshold: number; // luminance threshold (0 - 255)
  intensity: number; // bloom intensity (0.1 - 2.0)
  blurPx: number;    // diffusion blur radius
}

export interface Scene {
  id: string;
  name: string;
  durationFrames: number;
  fps: number;
  layers: Layer[];
  animationBlocks: AnimationBlock[];
  camera: Camera;
}

export interface EditorDocument {
  projectName: string;
  aspectRatio: "16:9" | "9:16" | "1:1";
  scenes: Scene[];
  activeSceneId: string;
  selectedLayerIds: string[];
  bloom?: BloomSettings;
  assets?: ProjectAsset[];
}

export type SaveStatus = "idle" | "saving" | "saved";
export type ToolId =
  | "scene"
  | "hand"
  | "tilt"
  | "move"
  | "scissors"
  | "shape"
  | "text"
  | "node"
  | "grid"
  | "camera";
export type BackgroundMode = "Color" | "Image" | "Shader";

export interface EditorStoreState extends EditorDocument {
  assets: ProjectAsset[];
  setAspectRatio: (ratio: "16:9" | "9:16" | "1:1") => void;
  setProjectName: (name: string) => void;
  hydrateDocument: (doc: Partial<EditorDocument>) => void;
  updateBloom: (partial: Partial<BloomSettings>) => void;
  addAsset: (
    asset: Omit<ProjectAsset, "id" | "createdAt"> & {
      id?: string;
      createdAt?: number;
    },
  ) => ProjectAsset;
  removeAsset: (id: string) => void;
  addImportedLayers: (layers: Layer[], selectIds?: string[]) => void;
  addLayer: (sceneId?: string, layer?: Partial<Layer>) => string;
  updateLayer: (id: string, partial: Partial<Layer>) => void;
  removeLayer: (id: string) => void;
  removeLayers: (ids: string[]) => void;
  toggleLayerVisibility: (id: string) => void;
  toggleLayerLock: (id: string) => void;
  reorderLayers: (sceneId: string, orderedLayers: Layer[]) => void;
  reparentLayer: (layerId: string, newParentId: string | null, targetIndex?: number) => void;
  groupSelectedLayers: () => string | null;
  duplicateSelectedLayers: () => string[];
  nudgeSelectedLayers: (dx: number, dy: number) => void;
  pasteLayers: (layers: Layer[]) => string[];
  selectLayers: (ids: string[]) => void;
  setActiveScene: (id: string) => void;
  addScene: (scene?: Partial<Scene>) => string;
  moveLayerDepth: (id: string, delta: number) => void;
  updateCamera: (partial: Partial<Camera>, sceneId?: string) => void;
  addAnimationBlock: (
    sceneId: string | undefined,
    block: Omit<AnimationBlock, "id"> & { id?: string },
  ) => string;
  updateAnimationBlock: (id: string, partial: Partial<AnimationBlock>) => void;
  removeAnimationBlock: (id: string) => void;
  addKeyframeTrack: (
    sceneId: string | undefined,
    layerId: string,
    property: AnimatableProperty,
    initialKeyframes?: Keyframe<number | string>[],
  ) => string;
  addKeyframe: (
    sceneId: string | undefined,
    blockId: string,
    keyframe: Keyframe<number | string>,
  ) => void;
  updateKeyframe: (
    sceneId: string | undefined,
    blockId: string,
    frame: number,
    partial: Partial<Keyframe<number | string>>,
  ) => void;
  removeKeyframe: (
    sceneId: string | undefined,
    blockId: string,
    frame: number,
  ) => void;
  applyAnimationPreset: (preset: AnimationPreset) => void;
  applySceneTemplate: (template: SceneTemplate, mode: "new" | "merge") => string;
}

export interface EditorUIStoreState {
  zoom: number; // e.g. 73
  pan: { x: number; y: number };
  playing: boolean;
  currentFrame: number;
  activeTool: ToolId;
  isCameraSelected: boolean;
  setIsCameraSelected: (selected: boolean) => void;
  presetsOpen: boolean;
  presetsTab: "animations" | "templates";
  exportModalOpen: boolean;
  saveStatus: SaveStatus;
  setSaveStatus: (status: SaveStatus) => void;
  setZoom: (zoom: number | ((prev: number) => number)) => void;
  setPan: (
    pan:
      | { x: number; y: number }
      | ((prev: { x: number; y: number }) => { x: number; y: number }),
  ) => void;
  setPlaying: (playing: boolean | ((prev: boolean) => boolean)) => void;
  setCurrentFrame: (frame: number | ((prev: number) => number)) => void;
  setActiveTool: (tool: ToolId) => void;
  openPresets: (tab?: "animations" | "templates") => void;
  closePresets: () => void;
  setPresetsTab: (tab: "animations" | "templates") => void;
  setExportModalOpen: (open: boolean) => void;
}

const initialSceneId = "scene-1";

const initialScene: Scene = {
  id: initialSceneId,
  name: "Scene 1",
  durationFrames: 180, // 6 seconds at 30 fps default
  fps: 30,
  layers: [
    {
      id: "layer-bg-card",
      parentId: null,
      type: "shape",
      name: "Background Layer (Depth 600)",
      transform: {
        x: 710,
        y: 340,
        width: 500,
        height: 320,
        rotation: 0,
        depth: 600,
      },
      opacity: 0.9,
      visible: true,
      locked: false,
      shape: {
        kind: "rect",
        fill: "#1e293b",
        stroke: "#334155",
        strokeWidth: 2,
        radius: 8,
      },
    },
    {
      id: "layer-fg-card",
      parentId: null,
      type: "shape",
      name: "Foreground Layer (Depth 0)",
      transform: {
        x: 810,
        y: 440,
        width: 300,
        height: 200,
        rotation: 0,
        depth: 0,
      },
      opacity: 1,
      visible: true,
      locked: false,
      shape: {
        kind: "rect",
        fill: "#0284c7",
        stroke: "#38bdf8",
        strokeWidth: 2,
        radius: 8,
      },
    },
  ],
  animationBlocks: [],
  camera: {
    x: 0,
    y: 0,
    z: 0,
    fov: 60,
    focusDistance: 1000,
  },
};

const initialDocument: EditorDocument = {
  projectName: "Untitled Project",
  aspectRatio: "16:9",
  scenes: [initialScene],
  activeSceneId: initialSceneId,
  selectedLayerIds: [],
  assets: [],
  bloom: {
    enabled: false,
    threshold: 200,
    intensity: 1.0,
    blurPx: 16,
  },
};

export const useEditorStore = create<EditorStoreState>()(
  temporal(
    (set, get) => ({
      ...initialDocument,
      assets: [],

      applyAnimationPreset: (preset) => {
        const state = get();
        const scene = state.scenes.find((s) => s.id === state.activeSceneId);
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

        set((s) => ({
          scenes: s.scenes.map((sc) =>
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

        // Create ID mapping for layers
        const idMap = new Map<string, string>();
        for (const layer of template.layers) {
          idMap.set(layer.id, `layer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
        }

        const remappedLayers: Layer[] = template.layers.map((layer) => ({
          ...layer,
          id: idMap.get(layer.id)!,
          parentId: layer.parentId && idMap.has(layer.parentId) ? idMap.get(layer.parentId)! : null,
        }));

        const remappedBlocks: AnimationBlock[] = template.animationBlocks.map((block) => ({
          ...block,
          id: `anim-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          layerId: block.layerId && idMap.has(block.layerId) ? idMap.get(block.layerId)! : (block.layerId ? null : null),
        }));

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
          };

          set((s) => ({
            scenes: [...s.scenes, newScene],
            activeSceneId: newSceneId,
            selectedLayerIds: remappedLayers.map((l) => l.id),
          }));
          useEditorUIStore.getState().setCurrentFrame(0);
          return newSceneId;
        } else {
          // Merge into current active scene
          const currentScene = state.scenes.find((s) => s.id === state.activeSceneId);
          if (!currentScene) return state.activeSceneId;

          set((s) => ({
            scenes: s.scenes.map((sc) =>
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

      setAspectRatio: (ratio) => {
        set({ aspectRatio: ratio });
      },

      setProjectName: (name) => {
        set({ projectName: name });
      },

      updateBloom: (partial) => {
        set((state) => ({
          bloom: {
            ...(state.bloom || {
              enabled: false,
              threshold: 200,
              intensity: 1.0,
              blurPx: 16,
            }),
            ...partial,
          },
        }));
      },

      hydrateDocument: (doc) => {
        set((state) => ({
          ...state,
          ...doc,
          projectName: doc.projectName ?? state.projectName,
          aspectRatio: doc.aspectRatio ?? state.aspectRatio,
          bloom: doc.bloom ?? state.bloom,
          scenes:
            doc.scenes && doc.scenes.length > 0
              ? doc.scenes.map((s) => ({
                  ...s,
                  animationBlocks: (s.animationBlocks || []).map((b) => ({
                    ...b,
                    preset:
                      typeof b.preset === "string"
                        ? b.preset
                        : (b.preset as any)?.id || "fade-in",
                  })),
                }))
              : state.scenes,
          activeSceneId:
            doc.activeSceneId ??
            (doc.scenes && doc.scenes.length > 0 ? doc.scenes[0].id : state.activeSceneId),
          selectedLayerIds: [],
          assets: doc.assets ?? state.assets ?? [],
        }));
        useEditorUIStore.getState().setSaveStatus("saved");
      },

      addAsset: (asset) => {
        const existing = get().assets.find(
          (a) => a.dataUrl === asset.dataUrl || (asset.id && a.id === asset.id),
        );
        if (existing) return existing;

        const newAsset: ProjectAsset = {
          id:
            asset.id ||
            `asset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: asset.name || "Image Asset",
          dataUrl: asset.dataUrl,
          width: asset.width || 800,
          height: asset.height || 600,
          createdAt: asset.createdAt || Date.now(),
        };

        set((state) => ({
          assets: [newAsset, ...state.assets],
        }));

        return newAsset;
      },

      removeAsset: (id) => {
        set((state) => ({
          assets: state.assets.filter((a) => a.id !== id),
        }));
      },

      addImportedLayers: (layers, selectIds) => {
        if (!layers.length) return;
        set((state) => ({
          scenes: state.scenes.map((sc) =>
            sc.id === state.activeSceneId
              ? { ...sc, layers: [...sc.layers, ...layers] }
              : sc,
          ),
          selectedLayerIds: selectIds ?? [layers[0].id],
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
            (get().scenes.find((s) => s.id === targetSceneId)?.layers.length || 0) + 1
          }`,
          transform: {
            ...defaultTransform,
            ...(layerOverride?.transform || {}),
          },
          opacity: 1,
          visible: true,
          locked: false,
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

        set((state) => ({
          scenes: state.scenes.map((scene) =>
            scene.id === targetSceneId
              ? { ...scene, layers: [...scene.layers, newLayer] }
              : scene,
          ),
          selectedLayerIds: [newLayerId],
        }));

        return newLayerId;
      },

      updateLayer: (id, partial) => {
        set((state) => ({
          scenes: state.scenes.map((scene) => ({
            ...scene,
            layers: scene.layers.map((layer) => {
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
        set((state) => {
          // Also collect nested descendants
          const scene = state.scenes.find((s) => s.id === state.activeSceneId);
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
            scenes: state.scenes.map((sc) =>
              sc.id === state.activeSceneId
                ? {
                    ...sc,
                    layers: sc.layers.filter((l) => !idSet.has(l.id)),
                    animationBlocks: (sc.animationBlocks || []).filter(
                      (b) => !b.layerId || !idSet.has(b.layerId),
                    ),
                  }
                : sc,
            ),
            selectedLayerIds: state.selectedLayerIds.filter((selId) => !idSet.has(selId)),
          };
        });
      },

      toggleLayerVisibility: (id) => {
        set((state) => ({
          scenes: state.scenes.map((scene) => ({
            ...scene,
            layers: scene.layers.map((l) =>
              l.id === id ? { ...l, visible: !l.visible } : l,
            ),
          })),
        }));
      },

      toggleLayerLock: (id) => {
        set((state) => ({
          scenes: state.scenes.map((scene) => ({
            ...scene,
            layers: scene.layers.map((l) =>
              l.id === id ? { ...l, locked: !l.locked } : l,
            ),
          })),
        }));
      },

      reorderLayers: (sceneId, orderedLayers) => {
        set((state) => ({
          scenes: state.scenes.map((scene) =>
            scene.id === sceneId ? { ...scene, layers: orderedLayers } : scene,
          ),
        }));
      },

      reparentLayer: (layerId, newParentId, targetIndex) => {
        set((state) => {
          const scene = state.scenes.find((s) => s.id === state.activeSceneId);
          if (!scene) return state;

          const layer = scene.layers.find((l) => l.id === layerId);
          if (!layer) return state;

          // Prevent cyclic nesting (a group cannot be reparented into its own child)
          if (newParentId) {
            let curr: string | null = newParentId;
            while (curr) {
              if (curr === layerId) return state;
              const parentLayer = scene.layers.find((l) => l.id === curr);
              curr = parentLayer ? parentLayer.parentId : null;
            }
          }

          const updatedLayer = { ...layer, parentId: newParentId };
          const withoutMoved = scene.layers.filter((l) => l.id !== layerId);

          let newLayers: Layer[];
          if (typeof targetIndex === "number" && targetIndex >= 0) {
            const safeIndex = Math.min(targetIndex, withoutMoved.length);
            newLayers = [
              ...withoutMoved.slice(0, safeIndex),
              updatedLayer,
              ...withoutMoved.slice(safeIndex),
            ];
          } else if (newParentId) {
            // Put right after parent
            const parentIdx = withoutMoved.findIndex((l) => l.id === newParentId);
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
            scenes: state.scenes.map((sc) =>
              sc.id === state.activeSceneId ? { ...sc, layers: newLayers } : sc,
            ),
          };
        });
      },

      groupSelectedLayers: () => {
        const state = get();
        const scene = state.scenes.find((s) => s.id === state.activeSceneId);
        if (!scene || state.selectedLayerIds.length === 0) return null;

        const selectedLayers = scene.layers.filter((l) =>
          state.selectedLayerIds.includes(l.id),
        );
        if (!selectedLayers.length) return null;

        const minX = Math.min(...selectedLayers.map((l) => l.transform.x));
        const minY = Math.min(...selectedLayers.map((l) => l.transform.y));
        const maxX = Math.max(
          ...selectedLayers.map((l) => l.transform.x + l.transform.width),
        );
        const maxY = Math.max(
          ...selectedLayers.map((l) => l.transform.y + l.transform.height),
        );

        const groupId = `group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const groupCount = scene.layers.filter((l) => l.type === "group").length;

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
        };

        // First index among selected layers
        const firstIdx = scene.layers.findIndex((l) =>
          state.selectedLayerIds.includes(l.id),
        );

        // Reparent selected layers under groupLayer
        const selectedIdSet = new Set(state.selectedLayerIds);
        const unselectedLayers = scene.layers.filter((l) => !selectedIdSet.has(l.id));
        const reparentedChildren = selectedLayers.map((l) => ({
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
          scenes: state.scenes.map((sc) =>
            sc.id === state.activeSceneId ? { ...sc, layers: newLayers } : sc,
          ),
          selectedLayerIds: [groupId],
        });

        return groupId;
      },

      duplicateSelectedLayers: () => {
        const state = get();
        const scene = state.scenes.find((s) => s.id === state.activeSceneId);
        if (!scene || state.selectedLayerIds.length === 0) return [];

        const selectedSet = new Set(state.selectedLayerIds);
        // Include any descendants of selected groups
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

        const layersToDuplicate = scene.layers.filter((l) => selectedSet.has(l.id));
        if (!layersToDuplicate.length) return [];

        const idMap = new Map<string, string>();
        for (const l of layersToDuplicate) {
          idMap.set(
            l.id,
            `layer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          );
        }

        const clonedLayers: Layer[] = layersToDuplicate.map((l) => {
          const newId = idMap.get(l.id)!;
          const newParentId = l.parentId && idMap.has(l.parentId) ? idMap.get(l.parentId)! : l.parentId;
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
          };
        });

        const newSelectedIds = layersToDuplicate
          .filter((l) => state.selectedLayerIds.includes(l.id))
          .map((l) => idMap.get(l.id)!);

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
          scenes: state.scenes.map((sc) =>
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
        set((state) => {
          const activeScene = state.scenes.find((s) => s.id === state.activeSceneId);
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
            scenes: state.scenes.map((scene) =>
              scene.id === state.activeSceneId
                ? {
                    ...scene,
                    layers: scene.layers.map((l) =>
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
          return {
            ...l,
            id: newId,
            parentId: newParentId,
            transform: {
              ...l.transform,
              x: l.transform.x + 20,
              y: l.transform.y + 20,
            },
          };
        });

        const newIds = clonedLayers.map((l) => l.id);

        set({
          scenes: state.scenes.map((sc) =>
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
          if (useEditorUIStore.getState().activeTool === "camera") {
            useEditorUIStore.getState().setActiveTool("scene");
          }
        }
        set({ selectedLayerIds: ids });
      },

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
          ...sceneOverride,
        };

        set((state) => ({
          scenes: [...state.scenes, newScene],
          activeSceneId: newSceneId,
          selectedLayerIds: [],
        }));

        return newSceneId;
      },

      moveLayerDepth: (id, delta) => {
        set((state) => ({
          scenes: state.scenes.map((scene) => ({
            ...scene,
            layers: scene.layers.map((layer) =>
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

      updateCamera: (partial, sceneId) => {
        const targetSceneId = sceneId || get().activeSceneId;
        set((state) => ({
          scenes: state.scenes.map((scene) =>
            scene.id === targetSceneId
              ? {
                  ...scene,
                  camera: {
                    ...(scene.camera || {
                      x: 0,
                      y: 0,
                      z: 0,
                      fov: 60,
                      focusDistance: 1000,
                    }),
                    ...partial,
                  },
                }
              : scene,
          ),
        }));
      },

      addAnimationBlock: (sceneId, blockData) => {
        const targetSceneId = sceneId || get().activeSceneId;
        const targetScene =
          get().scenes.find((s) => s.id === targetSceneId) || get().scenes[0];
        const maxFrames = targetScene ? targetScene.durationFrames : 180;

        const newBlockId =
          blockData.id || `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

        if (blockData.kind === "keyframe" || (blockData as any).keyframes) {
          const kfBlock = blockData as any;
          const keyframes = Array.isArray(kfBlock.keyframes)
            ? [...kfBlock.keyframes].sort((a, b) => a.frame - b.frame)
            : [];
          const startFrame =
            keyframes.length > 0 ? keyframes[0].frame : (blockData.startFrame ?? 0);
          const endFrame =
            keyframes.length > 0
              ? keyframes[keyframes.length - 1].frame
              : Math.max(startFrame + 1, blockData.endFrame ?? startFrame + 30);

          const newBlock: KeyframeTrackBlock = {
            id: newBlockId,
            kind: "keyframe",
            layerId: blockData.layerId!,
            property: kfBlock.property || "x",
            keyframes,
            startFrame,
            endFrame,
            preset: kfBlock.property || "keyframe",
            easing: blockData.easing,
            customCurve: blockData.customCurve,
          };

          set((state) => ({
            scenes: state.scenes.map((scene) =>
              scene.id === targetSceneId
                ? {
                    ...scene,
                    animationBlocks: [...(scene.animationBlocks || []), newBlock],
                  }
                : scene,
            ),
          }));

          return newBlockId;
        }

        const startFrame = Math.max(0, Math.min(maxFrames - 1, blockData.startFrame ?? 0));
        const defaultDuration = 30; // 1 second at 30 fps
        const endFrame = Math.max(
          startFrame + 1,
          Math.min(maxFrames, blockData.endFrame ?? startFrame + defaultDuration),
        );

        const presetVal: BlockPreset =
          typeof blockData.preset === "string"
            ? (blockData.preset as BlockPreset)
            : (blockData.preset as any)?.id || "fade-in";

        const isCameraBlock = presetVal === "camera-move" || blockData.layerId === null;

        const newBlock: AnimationBlock = {
          id: newBlockId,
          kind: "preset",
          layerId: isCameraBlock ? null : (blockData.layerId !== undefined ? blockData.layerId : null),
          preset: presetVal,
          startFrame,
          endFrame,
          easing: blockData.easing || "ease-in-out",
          customCurve: blockData.customCurve || [0.25, 0.1, 0.25, 1.0],
          cameraTo: isCameraBlock
            ? blockData.cameraTo || { x: 200, y: 0, z: 300, fov: 0 }
            : blockData.cameraTo,
        };

        set((state) => ({
          scenes: state.scenes.map((scene) =>
            scene.id === targetSceneId
              ? {
                  ...scene,
                  animationBlocks: [...(scene.animationBlocks || []), newBlock],
                }
              : scene,
          ),
        }));

        return newBlockId;
      },

      updateAnimationBlock: (id, partial) => {
        set((state) => ({
          scenes: state.scenes.map((scene) => {
            const hasBlock = (scene.animationBlocks || []).some((b) => b.id === id);
            if (!hasBlock) return scene;

            return {
              ...scene,
              animationBlocks: (scene.animationBlocks || []).map((b) => {
                if (b.id !== id) return b;
                const updated = { ...b, ...partial };

                if (isKeyframeTrack(updated as AnimationBlock)) {
                  const kfTrack = updated as KeyframeTrackBlock;
                  if (partial.keyframes) {
                    const sorted = [...partial.keyframes].sort((k1, k2) => k1.frame - k2.frame);
                    kfTrack.keyframes = sorted;
                    if (sorted.length > 0) {
                      kfTrack.startFrame = sorted[0].frame;
                      kfTrack.endFrame = sorted[sorted.length - 1].frame;
                    }
                  }
                  return kfTrack;
                }

                const maxFrames = scene.durationFrames;
                let startFrame =
                  updated.startFrame !== undefined
                    ? Math.max(0, Math.min(maxFrames - 1, Math.round(updated.startFrame)))
                    : b.startFrame;
                let endFrame =
                  updated.endFrame !== undefined
                    ? Math.max(
                        startFrame + 1,
                        Math.min(maxFrames, Math.round(updated.endFrame)),
                      )
                    : b.endFrame;

                if (startFrame >= endFrame) {
                  if (partial.startFrame !== undefined && partial.endFrame === undefined) {
                    endFrame = Math.min(maxFrames, startFrame + 1);
                  } else {
                    startFrame = Math.max(0, endFrame - 1);
                  }
                }

                return {
                  ...updated,
                  startFrame,
                  endFrame,
                } as AnimationBlock;
              }),
            };
          }),
        }));
      },

      removeAnimationBlock: (id) => {
        set((state) => ({
          scenes: state.scenes.map((scene) => ({
            ...scene,
            animationBlocks: (scene.animationBlocks || []).filter((b) => b.id !== id),
          })),
        }));
      },

      addKeyframeTrack: (sceneId, layerId, property, initialKeyframes) => {
        const targetSceneId = sceneId || get().activeSceneId;
        const scene = get().scenes.find((s) => s.id === targetSceneId) || get().scenes[0];
        const layer = scene?.layers.find((l) => l.id === layerId);

        let keyframes: Keyframe<number | string>[] = [];
        if (initialKeyframes && initialKeyframes.length > 0) {
          keyframes = [...initialKeyframes].sort((a, b) => a.frame - b.frame);
        } else if (layer) {
          let initialValue: number | string = 0;
          switch (property) {
            case "x":
              initialValue = layer.transform.x;
              break;
            case "y":
              initialValue = layer.transform.y;
              break;
            case "width":
              initialValue = layer.transform.width;
              break;
            case "height":
              initialValue = layer.transform.height;
              break;
            case "rotation":
              initialValue = layer.transform.rotation;
              break;
            case "opacity":
              initialValue = layer.opacity ?? 1;
              break;
            case "fill":
              initialValue = layer.shape?.fill ?? layer.text?.color ?? "#38bdf8";
              break;
            case "stroke":
              initialValue = layer.shape?.stroke ?? "#ffffff";
              break;
            case "fontSize":
              initialValue = layer.text?.fontSize ?? 32;
              break;
          }
          const currentF = useEditorUIStore.getState().currentFrame;
          const maxF = scene?.durationFrames ?? 180;
          const f1 = Math.min(Math.max(0, maxF - 20), currentF);
          const f2 = Math.min(maxF, f1 + 30);
          keyframes = [
            { frame: f1, value: initialValue, easing: "ease-in-out" },
            { frame: f2, value: initialValue, easing: "ease-in-out" },
          ];
        }

        const trackId = `kf-track-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const startFrame = keyframes.length > 0 ? keyframes[0].frame : 0;
        const endFrame = keyframes.length > 0 ? keyframes[keyframes.length - 1].frame : 30;

        const trackBlock: KeyframeTrackBlock = {
          id: trackId,
          kind: "keyframe",
          layerId,
          property,
          keyframes,
          startFrame,
          endFrame,
          preset: property,
        };

        set((state) => ({
          scenes: state.scenes.map((sc) =>
            sc.id === targetSceneId
              ? {
                  ...sc,
                  animationBlocks: [...(sc.animationBlocks || []), trackBlock],
                }
              : sc,
          ),
        }));

        return trackId;
      },

      addKeyframe: (sceneId, blockId, keyframe) => {
        set((state) => ({
          scenes: state.scenes.map((scene) => ({
            ...scene,
            animationBlocks: (scene.animationBlocks || []).map((b) => {
              if (b.id !== blockId || !isKeyframeTrack(b)) return b;
              const filtered = b.keyframes.filter((k) => k.frame !== keyframe.frame);
              const sorted = [...filtered, keyframe].sort((k1, k2) => k1.frame - k2.frame);
              return {
                ...b,
                keyframes: sorted,
                startFrame: sorted[0]?.frame ?? b.startFrame,
                endFrame: sorted[sorted.length - 1]?.frame ?? b.endFrame,
              };
            }),
          })),
        }));
      },

      updateKeyframe: (sceneId, blockId, frame, partial) => {
        set((state) => ({
          scenes: state.scenes.map((scene) => ({
            ...scene,
            animationBlocks: (scene.animationBlocks || []).map((b) => {
              if (b.id !== blockId || !isKeyframeTrack(b)) return b;
              const keyframes = b.keyframes
                .map((k) => (k.frame === frame ? { ...k, ...partial } : k))
                .sort((k1, k2) => k1.frame - k2.frame);
              return {
                ...b,
                keyframes,
                startFrame: keyframes[0]?.frame ?? b.startFrame,
                endFrame: keyframes[keyframes.length - 1]?.frame ?? b.endFrame,
              };
            }),
          })),
        }));
      },

      removeKeyframe: (sceneId, blockId, frame) => {
        set((state) => ({
          scenes: state.scenes.map((scene) => ({
            ...scene,
            animationBlocks: (scene.animationBlocks || []).map((b) => {
              if (b.id !== blockId || !isKeyframeTrack(b)) return b;
              const keyframes = b.keyframes.filter((k) => k.frame !== frame);
              return {
                ...b,
                keyframes,
                startFrame: keyframes.length > 0 ? keyframes[0].frame : b.startFrame,
                endFrame:
                  keyframes.length > 0
                    ? keyframes[keyframes.length - 1].frame
                    : b.endFrame,
              };
            }),
          })),
        }));
      },
    }),
    {
      limit: 100,
      // Exclude selectedLayerIds, saveStatus and actions from being tracked in history
      partialize: (state) => ({
        projectName: state.projectName,
        aspectRatio: state.aspectRatio,
        scenes: state.scenes,
        activeSceneId: state.activeSceneId,
        bloom: state.bloom,
      }),
      // Equality check on partialize output for step tracking
      equality: (pastState, currentState) =>
        JSON.stringify(pastState) === JSON.stringify(currentState),
    },
  ),
);

export const useEditorUIStore = create<EditorUIStoreState>()((set) => ({
  saveStatus: "saved",
  zoom: 73,
  pan: { x: 0, y: 0 },
  playing: false,
  currentFrame: 0,
  activeTool: "scene",
  isCameraSelected: false,
  presetsOpen: false,
  presetsTab: "animations",
  exportModalOpen: false,

  setIsCameraSelected: (selected) => {
    set({ isCameraSelected: selected });
    if (selected) {
      useEditorStore.getState().selectLayers([]);
    }
  },

  setSaveStatus: (status) => {
    set({ saveStatus: status });
  },

  setZoom: (zoomOrFn) => {
    set((state) => ({
      zoom: typeof zoomOrFn === "function" ? zoomOrFn(state.zoom) : zoomOrFn,
    }));
  },

  setPan: (panOrFn) => {
    set((state) => ({
      pan: typeof panOrFn === "function" ? panOrFn(state.pan) : panOrFn,
    }));
  },

  setPlaying: (playingOrFn) => {
    set((state) => ({
      playing:
        typeof playingOrFn === "function"
          ? playingOrFn(state.playing)
          : playingOrFn,
    }));
  },

  setCurrentFrame: (frameOrFn) => {
    set((state) => {
      const editorState = useEditorStore.getState();
      const activeScene =
        editorState.scenes.find((s) => s.id === editorState.activeSceneId) ||
        editorState.scenes[0];
      const maxFrames = activeScene ? activeScene.durationFrames : 180;
      const next =
        typeof frameOrFn === "function" ? frameOrFn(state.currentFrame) : frameOrFn;
      const clamped = Math.max(0, Math.min(maxFrames, Math.round(next)));
      return { currentFrame: clamped };
    });
  },

  setActiveTool: (tool) => {
    set({
      activeTool: tool,
      isCameraSelected: tool === "camera",
    });
    if (tool === "camera") {
      useEditorStore.getState().selectLayers([]);
    }
  },

  openPresets: (tab) => {
    set({
      presetsOpen: true,
      ...(tab ? { presetsTab: tab } : {}),
    });
  },

  closePresets: () => {
    set({ presetsOpen: false });
  },

  setPresetsTab: (tab) => {
    set({ presetsTab: tab });
  },

  setExportModalOpen: (open) => {
    set({ exportModalOpen: open });
  },
}));

export function useEditorHistory() {
  const temporal = useEditorStore.temporal;
  const pastStates = useStore(temporal, (state) => state.pastStates);
  const futureStates = useStore(temporal, (state) => state.futureStates);
  const undo = useStore(temporal, (state) => state.undo);
  const redo = useStore(temporal, (state) => state.redo);
  const clear = useStore(temporal, (state) => state.clear);

  return {
    undo,
    redo,
    clear,
    canUndo: pastStates.length > 0,
    canRedo: futureStates.length > 0,
    pastCount: pastStates.length,
    futureCount: futureStates.length,
  };
}

// Autosave debounce timer and tracking
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let lastSavedSnapshot = "";
let lastQueuedSnapshot = "";

export function initAutosave() {
  // Snapshot initial state
  const initial = useEditorStore.getState();
  const initialDoc: EditorDocument = {
    projectName: initial.projectName,
    aspectRatio: initial.aspectRatio,
    scenes: initial.scenes,
    activeSceneId: initial.activeSceneId,
    selectedLayerIds: [],
    bloom: initial.bloom,
    assets: initial.assets,
  };
  lastSavedSnapshot = JSON.stringify(initialDoc);
  lastQueuedSnapshot = lastSavedSnapshot;

  useEditorStore.subscribe((state) => {
    const docSnapshot: EditorDocument = {
      projectName: state.projectName,
      aspectRatio: state.aspectRatio,
      scenes: state.scenes,
      activeSceneId: state.activeSceneId,
      selectedLayerIds: [], // excluded from save tracking
      bloom: state.bloom,
      assets: state.assets,
    };
    const serialized = JSON.stringify(docSnapshot);
    if (serialized === lastQueuedSnapshot) return;

    lastQueuedSnapshot = serialized;

    if (useEditorUIStore.getState().saveStatus !== "saving") {
      useEditorUIStore.getState().setSaveStatus("saving");
    }

    if (saveTimeout) clearTimeout(saveTimeout);

    saveTimeout = setTimeout(async () => {
      try {
        await saveDocument(docSnapshot);
        lastSavedSnapshot = serialized;
        useEditorUIStore.getState().setSaveStatus("saved");
      } catch (err) {
        console.error("Autosave error:", err);
        useEditorUIStore.getState().setSaveStatus("idle");
      }
    }, 2000);
  });
}

