import { create } from "zustand";
import { temporal } from "zundo";
import { useStore } from "zustand";
import { saveDocument } from "../persistence/local-store";

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
  shape?: { kind: "rect" | "ellipse"; fill: string; stroke?: string };
  text?: {
    content: string;
    fontSize: number;
    fontFamily: string;
    color: string;
    align: "left" | "center" | "right";
  };
  image?: { src: string; naturalWidth: number; naturalHeight: number };
}

export interface Camera {
  x: number;
  y: number;
  z: number;
  fov: number; // degrees
  focusDistance: number; // for depth of field, added later
}

export interface Scene {
  id: string;
  name: string;
  durationFrames: number;
  fps: number;
  layers: Layer[];
  camera: Camera;
}

export interface EditorDocument {
  projectName: string;
  aspectRatio: "16:9" | "9:16" | "1:1";
  scenes: Scene[];
  activeSceneId: string;
  selectedLayerIds: string[];
}

export type SaveStatus = "idle" | "saving" | "saved";
export type ToolId = "scene" | "hand" | "shape" | "text" | "node" | "grid";

export interface EditorStoreState extends EditorDocument {
  saveStatus: SaveStatus;
  zoom: number; // e.g. 73
  pan: { x: number; y: number };
  playing: boolean;
  activeTool: ToolId;
  setSaveStatus: (status: SaveStatus) => void;
  setZoom: (zoom: number | ((prev: number) => number)) => void;
  setPan: (
    pan:
      | { x: number; y: number }
      | ((prev: { x: number; y: number }) => { x: number; y: number }),
  ) => void;
  setPlaying: (playing: boolean | ((prev: boolean) => boolean)) => void;
  setActiveTool: (tool: ToolId) => void;
  setAspectRatio: (ratio: "16:9" | "9:16" | "1:1") => void;
  setProjectName: (name: string) => void;
  hydrateDocument: (doc: Partial<EditorDocument>) => void;
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
}

const initialSceneId = "scene-1";

const initialScene: Scene = {
  id: initialSceneId,
  name: "Scene 1",
  durationFrames: 180, // 6 seconds at 30 fps default
  fps: 30,
  layers: [],
  camera: {
    x: 960,
    y: 540,
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
};

export const useEditorStore = create<EditorStoreState>()(
  temporal(
    (set, get) => ({
      ...initialDocument,
      saveStatus: "saved",
      zoom: 73,
      pan: { x: 0, y: 0 },
      playing: false,
      activeTool: "scene",

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

      setActiveTool: (tool) => {
        set({ activeTool: tool });
      },

      setAspectRatio: (ratio) => {
        set({ aspectRatio: ratio });
      },

      setProjectName: (name) => {
        set({ projectName: name });
      },

      hydrateDocument: (doc) => {
        set((state) => ({
          ...state,
          ...doc,
          projectName: doc.projectName ?? state.projectName,
          aspectRatio: doc.aspectRatio ?? state.aspectRatio,
          scenes: doc.scenes && doc.scenes.length > 0 ? doc.scenes : state.scenes,
          activeSceneId:
            doc.activeSceneId ??
            (doc.scenes && doc.scenes.length > 0 ? doc.scenes[0].id : state.activeSceneId),
          selectedLayerIds: [],
          saveStatus: "saved",
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

        set({
          scenes: state.scenes.map((sc) =>
            sc.id === state.activeSceneId
              ? { ...sc, layers: [...sc.layers, ...clonedLayers] }
              : sc,
          ),
          selectedLayerIds: newSelectedIds,
        });

        return newSelectedIds;
      },

      nudgeSelectedLayers: (dx, dy) => {
        set((state) => ({
          scenes: state.scenes.map((scene) =>
            scene.id === state.activeSceneId
              ? {
                  ...scene,
                  layers: scene.layers.map((l) =>
                    state.selectedLayerIds.includes(l.id)
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
        }));
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
    }),
    {
      limit: 100,
      // Exclude selectedLayerIds, saveStatus and actions from being tracked in history
      partialize: (state) => ({
        projectName: state.projectName,
        aspectRatio: state.aspectRatio,
        scenes: state.scenes,
        activeSceneId: state.activeSceneId,
      }),
      // Equality check on partialize output for step tracking
      equality: (pastState, currentState) =>
        JSON.stringify(pastState) === JSON.stringify(currentState),
    },
  ),
);

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

export function initAutosave() {
  // Snapshot initial state
  const initial = useEditorStore.getState();
  const initialDoc: EditorDocument = {
    projectName: initial.projectName,
    aspectRatio: initial.aspectRatio,
    scenes: initial.scenes,
    activeSceneId: initial.activeSceneId,
    selectedLayerIds: [],
  };
  lastSavedSnapshot = JSON.stringify(initialDoc);

  useEditorStore.subscribe((state) => {
    const docSnapshot: EditorDocument = {
      projectName: state.projectName,
      aspectRatio: state.aspectRatio,
      scenes: state.scenes,
      activeSceneId: state.activeSceneId,
      selectedLayerIds: [], // excluded from save tracking
    };
    const serialized = JSON.stringify(docSnapshot);
    if (serialized === lastSavedSnapshot) return;

    useEditorStore.getState().setSaveStatus("saving");
    if (saveTimeout) clearTimeout(saveTimeout);

    saveTimeout = setTimeout(async () => {
      try {
        await saveDocument(docSnapshot);
        lastSavedSnapshot = serialized;
        useEditorStore.getState().setSaveStatus("saved");
      } catch (err) {
        console.error("Autosave error:", err);
        useEditorStore.getState().setSaveStatus("idle");
      }
    }, 2000);
  });
}

