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
import { isKeyframeTrack, sampleKeyframeTrack } from "./animation-blocks";
import { createAudioSlice, type AudioSlice } from "./slices/audio-slice";
import { createCameraSlice, type CameraSlice } from "./slices/camera-slice";
import { createSceneEffectsSlice, type SceneEffectsSlice } from "./slices/scene-effects-slice";
import { createLayerEffectsSlice, type LayerEffectsSlice } from "./slices/layer-effects-slice";
import { createScenesSlice, type ScenesSlice } from "./slices/scenes-slice";
import { createAnimationSlice, type AnimationSlice } from "./slices/animation-slice";
import { createPresetsSlice, type PresetsSlice } from "./slices/presets-slice";
import { createLayersSlice, type LayersSlice } from "./slices/layers-slice";
import { useEditorUIStore, type EditorUIStoreState, setEditorStoreGetter } from "./editor-ui-store";
export { useEditorUIStore, type EditorUIStoreState } from "./editor-ui-store";

export type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

export type LayerType = "shape" | "text" | "image" | "group";
export type MockupType = "none" | "iphone" | "macbook" | "safari" | "browser";

export interface AudioTrack {
  id: string;
  name: string;
  url: string;
  duration: number; // in seconds
  volume: number; // 0 to 1
  muted: boolean;
  offsetFrames: number; // start frame on timeline, default 0
  waveformData?: number[]; // normalized amplitude peaks [0..1]
}

export interface Transform {
  x: number;
  y: number; // canvas-space position, top-left anchor
  width: number;
  height: number;
  rotation: number; // degrees
  rotateX?: number; // degrees (-80 to 80, 3D tilt/pitch)
  rotateY?: number; // degrees (-80 to 80, 3D swivel/yaw)
  depth: number; // 0 = camera plane, positive = further away
  flipX?: boolean;
  flipY?: boolean;
}

export type LayerEffectType =
  | "dropShadow"
  | "glow"
  | "backdropBlur"
  | "layerBlur"
  | "liquidGlass";

export interface LayerEffectBase {
  id: string;
  type: LayerEffectType;
  enabled: boolean;
  visible: boolean;
}

export interface DropShadowLayerEffect extends LayerEffectBase {
  type: "dropShadow";
  offsetX: number; // px, default 4
  offsetY: number; // px, default 4
  blur: number;    // >= 0, default 12
  color: string;   // hex, default "#000000"
  opacity: number; // 0â€“1, default 0.5
}

export interface GlowLayerEffect extends LayerEffectBase {
  type: "glow";
  color: string;      // hex, default matching codebase accent color (#6e6ef5)
  blur: number;       // >= 0, default 16
  intensity: number;  // >= 0, default 1
  angle: number;      // degrees, default 0
  sheen: number;      // 0â€“1, default 0
  mode: "edge" | "fill"; // default "edge"
  blend: "add" | "normal"; // default "add"
  rim: number;        // 0â€“1, default 0
  thickness: number;  // 0â€“1, default 0.3
}

export interface BackdropBlurLayerEffect extends LayerEffectBase {
  type: "backdropBlur";
  blur: number; // >= 0, default 8
}

export interface LayerBlurLayerEffect extends LayerEffectBase {
  type: "layerBlur";
  blur: number; // >= 0, default 8
  mode: "uniform" | "progressive"; // default "uniform"
  endBlur: number; // >= 0, default 16, meaningful only in progressive mode
  angle: number; // degrees, default 270, matching the reference doc's default
}

export interface LiquidGlassLayerEffect extends LayerEffectBase {
  type: "liquidGlass";
  blur: number;       // >= 0, default 8
  refraction: number; // 0â€“1, default 0.3
  dispersion: number; // 0â€“1, default 0.1
  highlight: number;  // 0â€“1, default 0.4
}

export type LayerEffect =
  | DropShadowLayerEffect
  | GlowLayerEffect
  | BackdropBlurLayerEffect
  | LayerBlurLayerEffect
  | LiquidGlassLayerEffect;

export function createDefaultLayerEffect(type: LayerEffectType): LayerEffect {
  const base = {
    id: `lfx-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    enabled: true,
    visible: true,
  };
  switch (type) {
    case "dropShadow":
      return {
        ...base,
        type: "dropShadow",
        offsetX: 4,
        offsetY: 4,
        blur: 12,
        color: "#000000",
        opacity: 0.5,
      };
    case "glow":
      return {
        ...base,
        type: "glow",
        color: "#6e6ef5",
        blur: 16,
        intensity: 1,
        angle: 0,
        sheen: 0,
        mode: "edge",
        blend: "add",
        rim: 0,
        thickness: 0.3,
      };
    case "backdropBlur":
      return {
        ...base,
        type: "backdropBlur",
        blur: 8,
      };
    case "layerBlur":
      return {
        ...base,
        type: "layerBlur",
        blur: 8,
        mode: "uniform",
        endBlur: 16,
        angle: 270,
      };
    case "liquidGlass":
      return {
        ...base,
        type: "liquidGlass",
        blur: 8,
        refraction: 0.3,
        dispersion: 0.1,
        highlight: 0.4,
      };
    default:
      return { ...base, type } as unknown as LayerEffect;
  }
}

export function isLayerEffectAvailable(
  layer: Layer,
  type: LayerEffectType,
): boolean {
  if (type === "layerBlur") {
    const hasDepth = (layer.transform?.depth ?? 0) > 0;
    const hasMockup = Boolean(layer.mockup && layer.mockup !== "none");
    if (hasDepth || hasMockup) return false;
  }
  return true;
}

export interface Layer {
  id: string;
  parentId?: string | null;
  name: string;
  type: LayerType;
  transform: Transform;
  opacity: number; // 0-1
  visible: boolean;
  locked: boolean;
  mockup?: MockupType;
  effects?: LayerEffect[];
  effectsOrder?: string[];
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

// Legacy compat aliases (will be removed when canvas post-processing migration lands in later prompt)
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

export type SceneEffectType =
  | "bloom"
  | "vignette"
  | "filmGrain"
  | "chromaticAberration"
  | "depthOfField"
  | "motionBlur"
  | "colorGrade"
  | "ghost"
  | "glitch"
  | "edgeFade";

export interface SceneEffectBase {
  id: string;
  type: SceneEffectType;
  enabled: boolean;
  visible: boolean;
}

export interface BloomEffect extends SceneEffectBase {
  type: "bloom";
  intensity: number; // >= 0, default 1.0
  threshold: number; // 0 to 1, default ~0.78
}

export interface VignetteEffect extends SceneEffectBase {
  type: "vignette";
  intensity: number; // 0 to 1, default 0.15
}

export interface FilmGrainEffect extends SceneEffectBase {
  type: "filmGrain";
  intensity: number; // 0 to 1, default 0.08
  size: number;      // 0.5 to 3, default 1.0
}

export interface ChromaticAberrationEffect extends SceneEffectBase {
  type: "chromaticAberration";
  offset: number;    // 0 to 20, default 2
}

export interface DepthOfFieldEffect extends SceneEffectBase {
  type: "depthOfField";
  /** Bokeh shape scale â€” >= 0, default 1 */
  bokehScale: number;
  /** Simulated aperture f-stop â€” 0.7â€“22, default 2.8 */
  aperture: number;
  /** Z-distance range around focus point that stays sharp â€” >= 0, default 200 */
  focusRange: number;
}

export interface MotionBlurEffect extends SceneEffectBase {
  type: "motionBlur";
  /** Degrees of shutter rotation per frame â€” 0â€“360, default 180 */
  shutterAngle: number;
  /** Accumulation sample count â€” integer, default 8 */
  samples: number;
}

export interface ColorGradeEffect extends SceneEffectBase {
  type: "colorGrade";
  /** EV exposure offset â€” -2 to 2, default 0 */
  exposure: number;
  /** Contrast multiplier â€” 0 to 2, default 1 */
  contrast: number;
  /** Saturation multiplier â€” 0 to 2, default 1 */
  saturation: number;
}

export interface GhostEffect extends SceneEffectBase {
  type: "ghost";
  /** Alpha of the ghost duplicate â€” 0 to 1, default 0.4 */
  opacity: number;
  /** Pixel offset of the ghost â€” 0â€“30, default 8 */
  offset: number;
  /** Gaussian blur on the ghost â€” 0â€“10, default 2 */
  blur: number;
}

export interface GlitchEffect extends SceneEffectBase {
  type: "glitch";
  /** Overall glitch strength â€” 0 to 1, default 0.3 */
  intensity: number;
  /** Animation speed multiplier â€” 0.5â€“3, default 1 */
  speed: number;
}

export interface EdgeFadeEffect extends SceneEffectBase {
  type: "edgeFade";
  /** Top-edge fade extent â€” 0 to 1, default 0 */
  top: number;
  /** Right-edge fade extent â€” 0 to 1, default 0 */
  right: number;
  /** Bottom-edge fade extent â€” 0 to 1, default 0 */
  bottom: number;
  /** Left-edge fade extent â€” 0 to 1, default 0 */
  left: number;
}

export type SceneEffect =
  | BloomEffect
  | VignetteEffect
  | FilmGrainEffect
  | ChromaticAberrationEffect
  | DepthOfFieldEffect
  | MotionBlurEffect
  | ColorGradeEffect
  | GhostEffect
  | GlitchEffect
  | EdgeFadeEffect;

export function createDefaultSceneEffect(type: SceneEffectType): SceneEffect {
  const base = {
    id: `fx-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    enabled: true,
    visible: true,
  };
  switch (type) {
    case "bloom":
      return { ...base, type: "bloom", intensity: 1.0, threshold: 0.78 };
    case "vignette":
      return { ...base, type: "vignette", intensity: 0.15 };
    case "filmGrain":
      return { ...base, type: "filmGrain", intensity: 0.08, size: 1.0 };
    case "chromaticAberration":
      return { ...base, type: "chromaticAberration", offset: 2 };
    case "depthOfField":
      return { ...base, type: "depthOfField", bokehScale: 1, aperture: 2.8, focusRange: 200 };
    case "motionBlur":
      return { ...base, type: "motionBlur", shutterAngle: 180, samples: 8 };
    case "colorGrade":
      return { ...base, type: "colorGrade", exposure: 0, contrast: 1, saturation: 1 };
    case "ghost":
      return { ...base, type: "ghost", opacity: 0.4, offset: 8, blur: 2 };
    case "glitch":
      return { ...base, type: "glitch", intensity: 0.3, speed: 1 };
    case "edgeFade":
      return { ...base, type: "edgeFade", top: 0, right: 0, bottom: 0, left: 0 };
    default:
      return { ...base, type } as unknown as SceneEffect;
  }
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
  effects: SceneEffect[];
  effectsOrder: string[];
  audioTrack?: AudioTrack | null;
}

export interface EditorDocument {
  projectName: string;
  aspectRatio: "16:9" | "9:16" | "1:1";
  scenes: Scene[];
  activeSceneId: string;
  selectedLayerIds: string[];
  assets?: ProjectAsset[];
}

export type SaveStatus = "idle" | "saving" | "saved";
export type ToolId =
  | "scene"
  | "hand"
  | "tilt"
  | "move"
  | "scissors"
  | "rectangle"
  | "ellipse"
  | "line"
  | "arrow"
  | "shape"
  | "text"
  | "camera";
export type BackgroundMode = "Color" | "Image" | "Shader";

export interface EditorStoreState extends EditorDocument, AudioSlice, CameraSlice, SceneEffectsSlice, LayerEffectsSlice, ScenesSlice, AnimationSlice, PresetsSlice, LayersSlice {
  assets: ProjectAsset[];
  setAspectRatio: (ratio: "16:9" | "9:16" | "1:1") => void;
  setProjectName: (name: string) => void;
  hydrateDocument: (doc: Partial<EditorDocument>) => void;
  addAsset: (
    asset: Omit<ProjectAsset, "id" | "createdAt"> & {
      id?: string;
      createdAt?: number;
    },
  ) => ProjectAsset;
  removeAsset: (id: string) => void;
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
      effects: [],
      effectsOrder: [],
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
      effects: [],
      effectsOrder: [],
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
  effects: [],
  effectsOrder: [],
};

export function getLayerVisualAABB(layer: Layer) {
  const { x, y, width, height, rotation } = layer.transform;
  if (!rotation) {
    return {
      minX: x,
      maxX: x + width,
      minY: y,
      maxY: y + height,
      centerH: x + width / 2,
      centerV: y + height / 2,
    };
  }
  const cx = x + width / 2;
  const cy = y + height / 2;
  const hw = width / 2;
  const hh = height / 2;
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const extentX = Math.abs(hw * cos) + Math.abs(hh * sin);
  const extentY = Math.abs(hw * sin) + Math.abs(hh * cos);

  return {
    minX: cx - extentX,
    maxX: cx + extentX,
    minY: cy - extentY,
    maxY: cy + extentY,
    centerH: cx,
    centerV: cy,
  };
}

const initialDocument: EditorDocument = {
  projectName: "Untitled Project",
  aspectRatio: "16:9",
  scenes: [initialScene],
  activeSceneId: initialSceneId,
  selectedLayerIds: [],
  assets: [],
};

export const useEditorStore = create<EditorStoreState>()(
  temporal(
    (set, get) => ({
      ...initialDocument,
      assets: [],

      ...createAudioSlice(set, get),
      ...createCameraSlice(set, get),
      ...createSceneEffectsSlice(set, get),
      ...createLayerEffectsSlice(set, get),
      ...createScenesSlice(set, get),
      ...createAnimationSlice(set, get),
      ...createPresetsSlice(set, get),
      ...createLayersSlice(set, get),

      setAspectRatio: (ratio) => {
        set({ aspectRatio: ratio });
      },

      setProjectName: (name) => {
        set({ projectName: name });
      },

      hydrateDocument: (doc) => {
        set((state) => {
          const rawDoc = doc as any;
          const legacyBloom: BloomSettings | undefined = rawDoc.bloom;
          const legacyOptics: OpticsSettings | undefined = rawDoc.optics;

          // Process scenes and perform one-time migration of legacy doc.bloom/optics into scene.effects
          const scenesSource = doc.scenes && doc.scenes.length > 0 ? doc.scenes : state.scenes;
          const migratedScenes = scenesSource.map((s) => {
            let effects = s.effects ? [...s.effects] : [];
            let effectsOrder = s.effectsOrder ? [...s.effectsOrder] : [];

            // If this scene doesn't already have effects migrated and legacy doc settings exist:
            if (effects.length === 0) {
              if (legacyBloom && (legacyBloom.enabled || (legacyBloom.intensity ?? 0) > 0)) {
                const bloomFx: BloomEffect = {
                  id: `fx-bloom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  type: "bloom",
                  enabled: legacyBloom.enabled ?? true,
                  visible: true,
                  intensity: legacyBloom.intensity ?? 1.0,
                  threshold: (legacyBloom.threshold ?? 200) / 255,
                };
                effects.push(bloomFx);
                effectsOrder.push(bloomFx.id);
              }

              if (legacyOptics) {
                if ((legacyOptics.vignette ?? 0) > 0) {
                  const vignetteFx: VignetteEffect = {
                    id: `fx-vignette-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    type: "vignette",
                    enabled: true,
                    visible: true,
                    intensity: legacyOptics.vignette,
                  };
                  effects.push(vignetteFx);
                  effectsOrder.push(vignetteFx.id);
                }

                if ((legacyOptics.filmGrain ?? 0) > 0) {
                  const grainFx: FilmGrainEffect = {
                    id: `fx-filmGrain-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    type: "filmGrain",
                    enabled: true,
                    visible: true,
                    intensity: legacyOptics.filmGrain,
                    size: 1.0,
                  };
                  effects.push(grainFx);
                  effectsOrder.push(grainFx.id);
                }

                if ((legacyOptics.chromaticAberration ?? 0) > 0) {
                  const chromaFx: ChromaticAberrationEffect = {
                    id: `fx-chromaticAberration-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    type: "chromaticAberration",
                    enabled: true,
                    visible: true,
                    offset: legacyOptics.chromaticAberration * 20,
                  };
                  effects.push(chromaFx);
                  effectsOrder.push(chromaFx.id);
                }
              }
            }

            // Sync effectsOrder if missing any effect ids
            for (const fx of effects) {
              if (!effectsOrder.includes(fx.id)) {
                effectsOrder.push(fx.id);
              }
            }

            const normalizedLayers = (s.layers || []).map((l) => ({
              ...l,
              effects: l.effects ? [...l.effects] : [],
              effectsOrder: l.effectsOrder
                ? [...l.effectsOrder]
                : (l.effects ? l.effects.map((e) => e.id) : []),
            }));

            return {
              ...s,
              layers: normalizedLayers,
              effects,
              effectsOrder,
              animationBlocks: (s.animationBlocks || []).map((b) => ({
                ...b,
                preset:
                  typeof b.preset === "string"
                    ? b.preset
                    : (b.preset as any)?.id || "fade-in",
              })),
            };
          });

          return {
            ...state,
            ...doc,
            projectName: doc.projectName ?? state.projectName,
            aspectRatio: doc.aspectRatio ?? state.aspectRatio,
            scenes: migratedScenes,
            activeSceneId:
              doc.activeSceneId ??
              (migratedScenes.length > 0 ? migratedScenes[0].id : state.activeSceneId),
            selectedLayerIds: [],
            assets: doc.assets ?? state.assets ?? [],
          };
        });
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

// Wire up the lazy getter so editor-ui-store can access useEditorStore
// without creating a circular import at module load time.
setEditorStoreGetter(() => useEditorStore);

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

