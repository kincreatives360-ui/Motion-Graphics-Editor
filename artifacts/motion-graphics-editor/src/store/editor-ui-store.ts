import { create } from "zustand";
import type { ToolId, SaveStatus } from "./editor-store";

export interface EditorUIStoreState {
  zoom: number;
  pan: { x: number; y: number };
  playing: boolean;
  currentFrame: number;
  activeTool: ToolId;
  animateMode: boolean;
  setAnimateMode: (mode: boolean | ((prev: boolean) => boolean)) => void;
  toggleAnimateMode: () => void;
  isCameraSelected: boolean;
  setIsCameraSelected: (selected: boolean) => void;
  isLightSelected: boolean;
  setIsLightSelected: (selected: boolean) => void;
  presetsOpen: boolean;
  presetsTab: "animations" | "shaders" | "templates";
  openPresets: (tab?: "animations" | "shaders" | "templates") => void;
  setPresetsTab: (tab: "animations" | "shaders" | "templates") => void;
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
  closePresets: () => void;
  setExportModalOpen: (open: boolean) => void;
  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
  timelineViewLevel: "all-scenes" | "scene-detail";
  setTimelineViewLevel: (level: "all-scenes" | "scene-detail") => void;
  timelineZoom: number;
  setTimelineZoom: (zoom: number | ((prev: number) => number)) => void;
}

// Lazy getter to break circular dependency with editor-store.
// editor-store.ts calls setEditorStoreGetter() after it initializes.
let _getEditorStore: (() => { getState: () => any }) | null = null;

export function setEditorStoreGetter(getter: () => { getState: () => any }) {
  _getEditorStore = getter;
}

function requireEditorStore() {
  if (!_getEditorStore) {
    throw new Error(
      "editor-ui-store: editor store getter not initialized. Call setEditorStoreGetter() first.",
    );
  }
  return _getEditorStore();
}

export const useEditorUIStore = create<EditorUIStoreState>()((set) => ({
  saveStatus: "saved",
  zoom: 73,
  pan: { x: 0, y: 0 },
  playing: false,
  currentFrame: 0,
  activeTool: "scene",
  animateMode: false,
  setAnimateMode: (mode) =>
    set((state) => ({
      animateMode: typeof mode === "function" ? mode(state.animateMode) : mode,
    })),
  toggleAnimateMode: () => set((state) => ({ animateMode: !state.animateMode })),
  isCameraSelected: false,
  isLightSelected: false,
  presetsOpen: false,
  presetsTab: "animations",
  exportModalOpen: false,
  timelineViewLevel: "scene-detail",
  setTimelineViewLevel: (level) => set({ timelineViewLevel: level }),

  setIsCameraSelected: (selected) => {
    set({ isCameraSelected: selected, ...(selected ? { isLightSelected: false } : {}) });
    if (selected) {
      requireEditorStore().getState().selectLayers([]);
    }
  },

  setIsLightSelected: (selected) => {
    set({ isLightSelected: selected, ...(selected ? { isCameraSelected: false } : {}) });
    if (selected) {
      requireEditorStore().getState().selectLayers([]);
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
      const editorState = requireEditorStore().getState();
      const activeScene =
        editorState.scenes.find((s: any) => s.id === editorState.activeSceneId) ||
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
      requireEditorStore().getState().selectLayers([]);
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

  helpOpen: false,
  setHelpOpen: (open) => {
    set({ helpOpen: open });
  },

  timelineZoom: 54,
  setTimelineZoom: (zoomOrFn) =>
    set((state) => {
      const next =
        typeof zoomOrFn === "function" ? zoomOrFn(state.timelineZoom) : zoomOrFn;
      return { timelineZoom: Math.max(0, Math.min(100, Math.round(next))) };
    }),
}));
