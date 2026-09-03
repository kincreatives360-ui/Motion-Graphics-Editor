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
export type MockupType = "none" | "iphone" | "macbook" | "safari";

export interface Transform {
  x: number;
  y: number; // canvas-space position, top-left anchor
  width: number;
  height: number;
  rotation: number; // degrees
  rotateX?: number; // degrees (-80 to 80, 3D tilt/pitch)
  rotateY?: number; // degrees (-80 to 80, 3D swivel/yaw)
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
  mockup?: MockupType;
  mockupFrame?: "iphone" | "ipad" | "macbook" | "browser";
  depth?: number;
  material?: "matte" | "clay" | "glossy" | "metal" | "image";
  materialSrc?: string;
  materialStrength?: number;
  layerEffects?: LayerEffectsSettings;
  audioEffects?: AudioEffectsSettings;
  // type-specific payload, keep it a discriminated union on `type`
  shape?: {
    kind: "rect" | "ellipse" | "path";
    fill: string;
    stroke?: string;
    strokeWidth?: number;
    strokeAlign?: "inside" | "center" | "outside";
    strokeStyle?: "solid" | "dashed";
    dash?: number;
    flow?: number;
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
  pitch?: number; // degrees (-85 to 85, tilt)
  yaw?: number;   // degrees (-180 to 180, orbit pan)
  roll?: number;  // degrees (-180 to 180, Dutch roll)
  fov: number; // degrees
  focalLengthMm?: number; // 24, 35, 50, 85 mm
  apertureFStop?: number; // 1.4, 2.0, 2.8, 5.6, 11
  aperture?: number; // alias for apertureFStop
  focusDistance: number; // for depth of field
  target?: { x: number; y: number; z: number }; // orbit anchor point
}

export interface SceneLighting {
  enabled: boolean;
  intensity: number; // 0 to 1 (default 0.6)
  lightX: number;
  lightY: number;
  shadowBlur: number;
  shadowOpacity: number;
}

export interface OpticsSettings {
  chromaticAberration: number; // 0 to 1
  filmGrain: number; // 0 to 1
  vignette: number; // 0 to 1
}

export interface BloomSettings {
  enabled: boolean;
  threshold: number; // luminance threshold (0 - 255)
  intensity: number; // bloom intensity (0.1 - 2.0)
  blurPx: number;    // diffusion blur radius
}

// Canonical Scene Effects Keys (order G8 from spec)
export const CANONICAL_SCENE_EFFECTS = [
  "depthOfField",
  "bloom",
  "vignette",
  "motionBlur",
  "chromaticAberration",
  "filmGrain",
  "ghost",
  "colorGrade",
  "edgeFade",
  "glitch",
] as const;

export type SceneEffectKey = typeof CANONICAL_SCENE_EFFECTS[number];

export interface SceneEffectsSettings {
  depthOfField?: {
    enabled?: boolean;
    bokehScale?: number;
    aperture?: number; // 0.7 to 22
    focusRange?: number;
  };
  bloom?: {
    enabled?: boolean;
    intensity?: number;
    threshold?: number; // 0 to 1
  };
  vignette?: {
    enabled?: boolean;
    intensity?: number; // 0 to 1
  };
  motionBlur?: {
    enabled?: boolean;
    shutterAngle?: number; // 0 to 360
    samples?: number; // 1 to 32
  };
  chromaticAberration?: { // UI label: Color split
    enabled?: boolean;
    offset?: number; // 0 to 20
  };
  filmGrain?: {
    enabled?: boolean;
    intensity?: number; // 0 to 1
    size?: number; // 0.5 to 3
  };
  ghost?: {
    enabled?: boolean;
    opacity?: number; // 0 to 1
    offset?: number; // 0 to 30
    blur?: number; // 0 to 10
  };
  colorGrade?: {
    enabled?: boolean;
    exposure?: number; // -2 to 2
    contrast?: number; // 0 to 2
    saturation?: number; // 0 to 2
  };
  edgeFade?: {
    enabled?: boolean;
    top?: number; // 0 to 1
    right?: number; // 0 to 1
    bottom?: number; // 0 to 1
    left?: number; // 0 to 1
  };
  glitch?: {
    enabled?: boolean;
    intensity?: number; // 0 to 1
    speed?: number; // 0.5 to 3
  };
  effectsOrder?: SceneEffectKey[];
}

// Canonical Layer Effects Keys (order Xj from spec)
export const CANONICAL_LAYER_EFFECTS = [
  "dropShadow",
  "glow",
  "backdropBlur",
  "layerBlur",
  "liquidGlass",
] as const;

export type LayerEffectKey = typeof CANONICAL_LAYER_EFFECTS[number];

export interface LayerEffectsSettings {
  dropShadow?: {
    enabled?: boolean;
    offsetX?: number;
    offsetY?: number;
    blur?: number;
    color?: string;
    opacity?: number; // 0 to 1
  };
  glow?: {
    enabled?: boolean;
    color?: string;
    blur?: number;
    intensity?: number;
    angle?: number;
    sheen?: number; // 0 to 1
    mode?: "edge" | "fill";
    blend?: "add" | "normal";
    rim?: number; // 0 to 1
    thickness?: number; // 0 to 1
  };
  backdropBlur?: {
    enabled?: boolean;
    blur?: number;
  };
  layerBlur?: {
    enabled?: boolean;
    blur?: number;
    mode?: "uniform" | "progressive";
    endBlur?: number;
    angle?: number;
  };
  liquidGlass?: {
    enabled?: boolean;
    blur?: number;
    refraction?: number; // 0 to 1
    dispersion?: number; // 0 to 1
    highlight?: number; // 0 to 1
  };
  layerEffectsOrder?: LayerEffectKey[];
}

// Canonical Audio Effects Keys (order $j from spec)
export const CANONICAL_AUDIO_EFFECTS = [
  "eq",
  "filter",
  "compressor",
  "distortion",
  "delay",
  "reverb",
] as const;

export type AudioEffectKey = typeof CANONICAL_AUDIO_EFFECTS[number];

export interface EQBand {
  type: "highpass" | "lowshelf" | "peaking" | "highshelf" | "lowpass";
  freqHz: number; // 20 to 20000
  gainDb: number; // -24 to 24
  q: number; // 0.1 to 18
}

export interface AudioEffectsSettings {
  eq?: {
    enabled?: boolean;
    bands?: EQBand[];
  };
  filter?: {
    enabled?: boolean;
    highpassHz?: number; // 20 to 20000
    lowpassHz?: number; // 20 to 20000
  };
  compressor?: {
    enabled?: boolean;
    thresholdDb?: number; // -60 to 0
    ratio?: number; // 1 to 20
    attackMs?: number; // 0.1 to 250
    releaseMs?: number; // 10 to 1000
    makeupDb?: number; // 0 to 24
    sidechainAssetId?: string;
  };
  distortion?: {
    enabled?: boolean;
    style?: "tape" | "tube" | "console" | "fuzz";
    drive?: number; // 0 to 1
    toneHz?: number; // 1000 to 20000
    mix?: number; // 0 to 1
  };
  delay?: {
    enabled?: boolean;
    timeMs?: number; // 20 to 2000
    feedback?: number; // 0 to 0.9
    mix?: number; // 0 to 1
    sync?: "quarter" | "dottedEighth" | "eighth" | "tripletEighth" | "sixteenth";
    toneHz?: number; // 200 to 20000
    pingPong?: boolean;
  };
  reverb?: {
    enabled?: boolean;
    preset?: "room" | "hall" | "plate" | "cavern";
    mix?: number; // 0 to 1
  };
  effectsOrder?: AudioEffectKey[];
}

export interface EffectPreset {
  id: string;
  name: string;
  category?: string;
  sceneEffects: SceneEffectsSettings;
}

export interface Scene {
  id: string;
  name: string;
  durationFrames: number;
  fps: number;
  layers: Layer[];
  animationBlocks: AnimationBlock[];
  camera: Camera;
  lighting?: SceneLighting;
  sceneEffects?: SceneEffectsSettings;
}

export interface EditorDocument {
  projectName: string;
  aspectRatio: "16:9" | "9:16" | "1:1";
  scenes: Scene[];
  activeSceneId: string;
  selectedLayerIds: string[];
  bloom?: BloomSettings;
  optics?: OpticsSettings;
  assets?: ProjectAsset[];
  effectPresets?: EffectPreset[];
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
  resetCamera: (sceneId?: string) => void;
  updateSceneLighting: (partial: Partial<SceneLighting>, sceneId?: string) => void;
  updateOptics: (partial: Partial<OpticsSettings>) => void;
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
  updateSceneEffects: (sceneId: string | undefined, partial: Partial<SceneEffectsSettings>) => void;
  addSceneEffect: (sceneId: string | undefined, key: SceneEffectKey) => void;
  removeSceneEffect: (sceneId: string | undefined, key: SceneEffectKey) => void;
  swapSceneEffect: (sceneId: string | undefined, oldKey: SceneEffectKey, newKey: SceneEffectKey) => void;
  reorderSceneEffects: (sceneId: string | undefined, newOrder: SceneEffectKey[]) => void;

  updateLayerEffects: (layerId: string, partial: Partial<LayerEffectsSettings>) => void;
  addLayerEffect: (layerId: string, key: LayerEffectKey) => void;
  removeLayerEffect: (layerId: string, key: LayerEffectKey) => void;
  swapLayerEffect: (layerId: string, oldKey: LayerEffectKey, newKey: LayerEffectKey) => void;
  reorderLayerEffects: (layerId: string, newOrder: LayerEffectKey[]) => void;

  updateAudioEffects: (layerId: string, partial: Partial<AudioEffectsSettings>) => void;
  addAudioEffect: (layerId: string, key: AudioEffectKey) => void;
  removeAudioEffect: (layerId: string, key: AudioEffectKey) => void;
  swapAudioEffect: (layerId: string, oldKey: AudioEffectKey, newKey: AudioEffectKey) => void;
  reorderAudioEffects: (layerId: string, newOrder: AudioEffectKey[]) => void;

  saveEffectPreset: (preset: Omit<EffectPreset, "id">) => string;
  removeEffectPreset: (id: string) => void;
  applyEffectPreset: (sceneId: string | undefined, presetId: string) => void;
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
    pitch: 0,
    yaw: 0,
    roll: 0,
    fov: 60,
    focalLengthMm: 50,
    apertureFStop: 2.8,
    focusDistance: 1000,
    target: { x: 960, y: 540, z: 0 },
  },
  lighting: {
    enabled: true,
    intensity: 0.6,
    lightX: -300,
    lightY: -450,
    shadowBlur: 24,
    shadowOpacity: 0.35,
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
  optics: {
    chromaticAberration: 0,
    filmGrain: 0.08,
    vignette: 0.15,
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
        })) as AnimationBlock[];

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
                      pitch: 0,
                      yaw: 0,
                      roll: 0,
                      fov: 60,
                      focalLengthMm: 50,
                      apertureFStop: 2.8,
                      focusDistance: 1000,
                    }),
                    ...partial,
                  },
                }
              : scene,
          ),
        }));
      },

      resetCamera: (sceneId) => {
        const targetSceneId = sceneId || get().activeSceneId;
        set((state) => ({
          scenes: state.scenes.map((scene) =>
            scene.id === targetSceneId
              ? {
                  ...scene,
                  camera: {
                    x: 0,
                    y: 0,
                    z: 0,
                    pitch: 0,
                    yaw: 0,
                    roll: 0,
                    fov: 60,
                    focalLengthMm: 50,
                    apertureFStop: 2.8,
                    focusDistance: 1000,
                    target: { x: 960, y: 540, z: 0 },
                  },
                }
              : scene,
          ),
        }));
      },

      updateSceneLighting: (partial, sceneId) => {
        const targetSceneId = sceneId || get().activeSceneId;
        set((state) => ({
          scenes: state.scenes.map((scene) =>
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

      updateOptics: (partial) => {
        set((state) => ({
          optics: {
            ...(state.optics || {
              chromaticAberration: 0,
              filmGrain: 0.08,
              vignette: 0.15,
            }),
            ...partial,
          },
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
            ? (blockData as any).cameraTo || { x: 200, y: 0, z: 300, fov: 0 }
            : (blockData as any).cameraTo,
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
                  if ((partial as any).keyframes) {
                    const sorted = [...((partial as any).keyframes)].sort((k1, k2) => k1.frame - k2.frame);
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
      updateSceneEffects: (sceneId, partial) => {
        const targetId = sceneId || get().activeSceneId;
        set((state) => ({
          scenes: state.scenes.map((scene) => {
            if (scene.id !== targetId) return scene;
            return {
              ...scene,
              sceneEffects: {
                ...(scene.sceneEffects || {}),
                ...partial,
              },
            };
          }),
        }));
      },

      addSceneEffect: (sceneId, key) => {
        const targetId = sceneId || get().activeSceneId;
        set((state) => ({
          scenes: state.scenes.map((scene) => {
            if (scene.id !== targetId) return scene;
            const current = scene.sceneEffects || {};
            const currentOrder = current.effectsOrder || [];
            if (currentOrder.includes(key)) return scene;
            const defaultParams: any = { enabled: true };
            if (key === "bloom") { defaultParams.intensity = 1.0; defaultParams.threshold = 0.8; }
            else if (key === "vignette") { defaultParams.intensity = 0.3; }
            else if (key === "filmGrain") { defaultParams.intensity = 0.08; defaultParams.size = 1.0; }
            else if (key === "depthOfField") { defaultParams.bokehScale = 2.0; defaultParams.aperture = 2.8; defaultParams.focusRange = 100; }
            else if (key === "motionBlur") { defaultParams.shutterAngle = 180; defaultParams.samples = 16; }
            else if (key === "chromaticAberration") { defaultParams.offset = 4; }
            else if (key === "ghost") { defaultParams.opacity = 0.5; defaultParams.offset = 10; defaultParams.blur = 2; }
            else if (key === "colorGrade") { defaultParams.exposure = 0; defaultParams.contrast = 1; defaultParams.saturation = 1; }
            else if (key === "edgeFade") { defaultParams.top = 0.1; defaultParams.right = 0.1; defaultParams.bottom = 0.1; defaultParams.left = 0.1; }
            else if (key === "glitch") { defaultParams.intensity = 0.3; defaultParams.speed = 1.0; }
            return {
              ...scene,
              sceneEffects: {
                ...current,
                [key]: { ...defaultParams, ...(current[key] || {}) },
                effectsOrder: [...currentOrder, key],
              },
            };
          }),
        }));
      },

      removeSceneEffect: (sceneId, key) => {
        const targetId = sceneId || get().activeSceneId;
        set((state) => ({
          scenes: state.scenes.map((scene) => {
            if (scene.id !== targetId || !scene.sceneEffects) return scene;
            const { [key]: _, effectsOrder, ...rest } = scene.sceneEffects as any;
            return {
              ...scene,
              sceneEffects: {
                ...rest,
                effectsOrder: (effectsOrder || []).filter((k: string) => k !== key),
              },
            };
          }),
        }));
      },

      swapSceneEffect: (sceneId, oldKey, newKey) => {
        const targetId = sceneId || get().activeSceneId;
        set((state) => ({
          scenes: state.scenes.map((scene) => {
            if (scene.id !== targetId || !scene.sceneEffects) return scene;
            const current = scene.sceneEffects as any;
            const order = current.effectsOrder || [];
            const newOrder = order.map((k: string) => (k === oldKey ? newKey : k));
            const { [oldKey]: oldVal, ...rest } = current;
            const defaultParams: any = { enabled: true };
            return {
              ...scene,
              sceneEffects: {
                ...rest,
                [newKey]: current[newKey] || defaultParams,
                effectsOrder: newOrder,
              },
            };
          }),
        }));
      },

      reorderSceneEffects: (sceneId, newOrder) => {
        const targetId = sceneId || get().activeSceneId;
        set((state) => ({
          scenes: state.scenes.map((scene) => {
            if (scene.id !== targetId || !scene.sceneEffects) return scene;
            return {
              ...scene,
              sceneEffects: {
                ...scene.sceneEffects,
                effectsOrder: newOrder,
              },
            };
          }),
        }));
      },

      updateLayerEffects: (layerId, partial) => {
        set((state) => ({
          scenes: state.scenes.map((scene) => ({
            ...scene,
            layers: scene.layers.map((layer) => {
              if (layer.id !== layerId) return layer;
              return {
                ...layer,
                layerEffects: {
                  ...(layer.layerEffects || {}),
                  ...partial,
                },
              };
            }),
          })),
        }));
      },

      addLayerEffect: (layerId, key) => {
        set((state) => ({
          scenes: state.scenes.map((scene) => ({
            ...scene,
            layers: scene.layers.map((layer) => {
              if (layer.id !== layerId) return layer;
              const current = layer.layerEffects || {};
              const currentOrder = current.layerEffectsOrder || [];
              if (currentOrder.includes(key)) return layer;
              const defaultParams: any = { enabled: true };
              if (key === "dropShadow") { defaultParams.offsetX = 4; defaultParams.offsetY = 8; defaultParams.blur = 16; defaultParams.color = "#000000"; defaultParams.opacity = 0.4; }
              else if (key === "glow") { defaultParams.color = "#38bdf8"; defaultParams.blur = 20; defaultParams.intensity = 1.0; defaultParams.angle = 0; defaultParams.sheen = 0.5; defaultParams.mode = "fill"; defaultParams.blend = "add"; defaultParams.rim = 0.2; defaultParams.thickness = 0.1; }
              else if (key === "backdropBlur") { defaultParams.blur = 12; }
              else if (key === "layerBlur") { defaultParams.blur = 8; defaultParams.mode = "uniform"; defaultParams.endBlur = 0; defaultParams.angle = 270; }
              else if (key === "liquidGlass") { defaultParams.blur = 16; defaultParams.refraction = 0.3; defaultParams.dispersion = 0.2; defaultParams.highlight = 0.5; }
              return {
                ...layer,
                layerEffects: {
                  ...current,
                  [key]: { ...defaultParams, ...(current[key] || {}) },
                  layerEffectsOrder: [...currentOrder, key],
                },
              };
            }),
          })),
        }));
      },

      removeLayerEffect: (layerId, key) => {
        set((state) => ({
          scenes: state.scenes.map((scene) => ({
            ...scene,
            layers: scene.layers.map((layer) => {
              if (layer.id !== layerId || !layer.layerEffects) return layer;
              const { [key]: _, layerEffectsOrder, ...rest } = layer.layerEffects as any;
              return {
                ...layer,
                layerEffects: {
                  ...rest,
                  layerEffectsOrder: (layerEffectsOrder || []).filter((k: string) => k !== key),
                },
              };
            }),
          })),
        }));
      },

      swapLayerEffect: (layerId, oldKey, newKey) => {
        set((state) => ({
          scenes: state.scenes.map((scene) => ({
            ...scene,
            layers: scene.layers.map((layer) => {
              if (layer.id !== layerId || !layer.layerEffects) return layer;
              const current = layer.layerEffects as any;
              const order = current.layerEffectsOrder || [];
              const newOrder = order.map((k: string) => (k === oldKey ? newKey : k));
              const { [oldKey]: _, ...rest } = current;
              return {
                ...layer,
                layerEffects: {
                  ...rest,
                  [newKey]: current[newKey] || { enabled: true },
                  layerEffectsOrder: newOrder,
                },
              };
            }),
          })),
        }));
      },

      reorderLayerEffects: (layerId, newOrder) => {
        set((state) => ({
          scenes: state.scenes.map((scene) => ({
            ...scene,
            layers: scene.layers.map((layer) => {
              if (layer.id !== layerId || !layer.layerEffects) return layer;
              return {
                ...layer,
                layerEffects: {
                  ...layer.layerEffects,
                  layerEffectsOrder: newOrder,
                },
              };
            }),
          })),
        }));
      },

      updateAudioEffects: (layerId, partial) => {
        set((state) => ({
          scenes: state.scenes.map((scene) => ({
            ...scene,
            layers: scene.layers.map((layer) => {
              if (layer.id !== layerId) return layer;
              return {
                ...layer,
                audioEffects: {
                  ...(layer.audioEffects || {}),
                  ...partial,
                },
              };
            }),
          })),
        }));
      },

      addAudioEffect: (layerId, key) => {
        set((state) => ({
          scenes: state.scenes.map((scene) => ({
            ...scene,
            layers: scene.layers.map((layer) => {
              if (layer.id !== layerId) return layer;
              const current = layer.audioEffects || {};
              const currentOrder = current.effectsOrder || [];
              if (currentOrder.includes(key)) return layer;
              const defaultParams: any = { enabled: true };
              if (key === "eq") { defaultParams.bands = [{ type: "peaking", freqHz: 1000, gainDb: 3, q: 1 }]; }
              else if (key === "filter") { defaultParams.highpassHz = 80; defaultParams.lowpassHz = 16000; }
              else if (key === "compressor") { defaultParams.thresholdDb = -18; defaultParams.ratio = 4; defaultParams.attackMs = 15; defaultParams.releaseMs = 150; defaultParams.makeupDb = 3; }
              else if (key === "distortion") { defaultParams.style = "tube"; defaultParams.drive = 0.3; defaultParams.toneHz = 8000; defaultParams.mix = 0.4; }
              else if (key === "delay") { defaultParams.timeMs = 250; defaultParams.feedback = 0.3; defaultParams.mix = 0.35; defaultParams.sync = "eighth"; defaultParams.toneHz = 4000; defaultParams.pingPong = true; }
              else if (key === "reverb") { defaultParams.preset = "hall"; defaultParams.mix = 0.3; }
              return {
                ...layer,
                audioEffects: {
                  ...current,
                  [key]: { ...defaultParams, ...(current[key] || {}) },
                  effectsOrder: [...currentOrder, key],
                },
              };
            }),
          })),
        }));
      },

      removeAudioEffect: (layerId, key) => {
        set((state) => ({
          scenes: state.scenes.map((scene) => ({
            ...scene,
            layers: scene.layers.map((layer) => {
              if (layer.id !== layerId || !layer.audioEffects) return layer;
              const { [key]: _, effectsOrder, ...rest } = layer.audioEffects as any;
              return {
                ...layer,
                audioEffects: {
                  ...rest,
                  effectsOrder: (effectsOrder || []).filter((k: string) => k !== key),
                },
              };
            }),
          })),
        }));
      },

      swapAudioEffect: (layerId, oldKey, newKey) => {
        set((state) => ({
          scenes: state.scenes.map((scene) => ({
            ...scene,
            layers: scene.layers.map((layer) => {
              if (layer.id !== layerId || !layer.audioEffects) return layer;
              const current = layer.audioEffects as any;
              const order = current.effectsOrder || [];
              const newOrder = order.map((k: string) => (k === oldKey ? newKey : k));
              const { [oldKey]: _, ...rest } = current;
              return {
                ...layer,
                audioEffects: {
                  ...rest,
                  [newKey]: current[newKey] || { enabled: true },
                  effectsOrder: newOrder,
                },
              };
            }),
          })),
        }));
      },

      reorderAudioEffects: (layerId, newOrder) => {
        set((state) => ({
          scenes: state.scenes.map((scene) => ({
            ...scene,
            layers: scene.layers.map((layer) => {
              if (layer.id !== layerId || !layer.audioEffects) return layer;
              return {
                ...layer,
                audioEffects: {
                  ...layer.audioEffects,
                  effectsOrder: newOrder,
                },
              };
            }),
          })),
        }));
      },

      saveEffectPreset: (preset) => {
        const id = `effect-preset-${Date.now()}`;
        const newPreset: EffectPreset = { ...preset, id };
        set((state) => ({
          effectPresets: [...(state.effectPresets || []), newPreset],
        }));
        return id;
      },

      removeEffectPreset: (id) => {
        set((state) => ({
          effectPresets: (state.effectPresets || []).filter((p) => p.id !== id),
        }));
      },

      applyEffectPreset: (sceneId, presetId) => {
        const state = get();
        const preset = (state.effectPresets || []).find((p) => p.id === presetId);
        if (!preset) return;
        const targetId = sceneId || state.activeSceneId;
        set((s) => ({
          scenes: s.scenes.map((scene) => {
            if (scene.id !== targetId) return scene;
            return {
              ...scene,
              sceneEffects: {
                ...(scene.sceneEffects || {}),
                ...preset.sceneEffects,
              },
            };
          }),
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

