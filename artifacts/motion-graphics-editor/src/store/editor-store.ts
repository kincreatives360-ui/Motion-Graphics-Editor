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
import type { AnimationPreset, SceneTemplate } from "../presets/preset-library";

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
  scaleX?: number;
  scaleY?: number;
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
  opacity: number; // 0–1, default 0.5
}

export interface GlowLayerEffect extends LayerEffectBase {
  type: "glow";
  color: string;      // hex, default matching codebase accent color (#6e6ef5)
  blur: number;       // >= 0, default 16
  intensity: number;  // >= 0, default 1
  angle: number;      // degrees, default 0
  sheen: number;      // 0–1, default 0
  mode: "edge" | "fill"; // default "edge"
  blend: "add" | "normal"; // default "add"
  rim: number;        // 0–1, default 0
  thickness: number;  // 0–1, default 0.3
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
  refraction: number; // 0–1, default 0.3
  dispersion: number; // 0–1, default 0.1
  highlight: number;  // 0–1, default 0.4
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
  blendMode?: string;
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
  /** Bokeh shape scale — >= 0, default 1 */
  bokehScale: number;
  /** Simulated aperture f-stop — 0.7–22, default 2.8 */
  aperture: number;
  /** Z-distance range around focus point that stays sharp — >= 0, default 200 */
  focusRange: number;
}

export interface MotionBlurEffect extends SceneEffectBase {
  type: "motionBlur";
  /** Degrees of shutter rotation per frame — 0–360, default 180 */
  shutterAngle: number;
  /** Accumulation sample count — integer, default 8 */
  samples: number;
}

export interface ColorGradeEffect extends SceneEffectBase {
  type: "colorGrade";
  /** EV exposure offset — -2 to 2, default 0 */
  exposure: number;
  /** Contrast multiplier — 0 to 2, default 1 */
  contrast: number;
  /** Saturation multiplier — 0 to 2, default 1 */
  saturation: number;
}

export interface GhostEffect extends SceneEffectBase {
  type: "ghost";
  /** Alpha of the ghost duplicate — 0 to 1, default 0.4 */
  opacity: number;
  /** Pixel offset of the ghost — 0–30, default 8 */
  offset: number;
  /** Gaussian blur on the ghost — 0–10, default 2 */
  blur: number;
}

export interface GlitchEffect extends SceneEffectBase {
  type: "glitch";
  /** Overall glitch strength — 0 to 1, default 0.3 */
  intensity: number;
  /** Animation speed multiplier — 0.5–3, default 1 */
  speed: number;
}

export interface EdgeFadeEffect extends SceneEffectBase {
  type: "edgeFade";
  /** Top-edge fade extent — 0 to 1, default 0 */
  top: number;
  /** Right-edge fade extent — 0 to 1, default 0 */
  right: number;
  /** Bottom-edge fade extent — 0 to 1, default 0 */
  bottom: number;
  /** Left-edge fade extent — 0 to 1, default 0 */
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

export interface EditorStoreState extends EditorDocument {
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
  ungroupSelectedLayers: () => string[];
  bringLayerForward: (sceneId?: string, layerId?: string) => void;
  sendLayerBackward: (sceneId?: string, layerId?: string) => void;
  bringLayerToFront: (sceneId?: string, layerId?: string) => void;
  sendLayerToBack: (sceneId?: string, layerId?: string) => void;
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
  setActiveScene: (id: string) => void;
  addScene: (scene?: Partial<Scene>) => string;
  updateScene: (sceneId: string, partial: Partial<Scene>) => void;
  reorderScenes: (fromIndex: number, toIndex: number) => void;
  deleteScene: (sceneId: string) => void;
  duplicateScene: (sceneId: string) => string;
  moveLayerDepth: (id: string, delta: number) => void;
  updateCamera: (partial: Partial<Camera>, sceneId?: string) => void;
  resetCamera: (sceneId?: string) => void;
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
  addAnimationBlock: (
    sceneId: string | undefined,
    block: DistributiveOmit<AnimationBlock, "id"> & { id?: string },
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
  recordKeyframe: (
    layerId: string,
    property: AnimatableProperty,
    value: number | string,
    frame?: number,
    sceneId?: string,
  ) => void;
  toggleSelectedLayersVisibility: () => void;
  setSelectedLayersOpacity: (opacity: number) => void;
  splitBlocksAtPlayhead: (frame?: number, sceneId?: string) => void;
  trimInPointAtPlayhead: (frame?: number, sceneId?: string) => void;
  trimOutPointAtPlayhead: (frame?: number, sceneId?: string) => void;
  applyAnimationPreset: (preset: AnimationPreset) => void;
  applySceneTemplate: (template: SceneTemplate, mode: "new" | "merge") => string;
  setAudioTrack: (sceneId: string | undefined, track: AudioTrack | null) => void;
  updateAudioTrack: (sceneId: string | undefined, partial: Partial<AudioTrack>) => void;
  removeAudioTrack: (sceneId: string | undefined) => void;
  applyZSpread: (sceneId?: string, spacing?: number) => void;
}

export interface EditorUIStoreState {
  zoom: number; // e.g. 73
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
  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
  timelineViewLevel: "all-scenes" | "scene-detail";
  setTimelineViewLevel: (level: "all-scenes" | "scene-detail") => void;
  timelineZoom: number; // 0 to 100
  setTimelineZoom: (zoom: number | ((prev: number) => number)) => void;
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

      addImportedLayers: (layers, selectIds) => {
        if (!layers.length) return;
        const normalized = layers.map((l) => ({
          ...l,
          effects: l.effects ? [...l.effects] : [],
          effectsOrder: l.effectsOrder
            ? [...l.effectsOrder]
            : (l.effects ? l.effects.map((e) => e.id) : []),
        }));
        set((state) => ({
          scenes: state.scenes.map((sc) =>
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
            (get().scenes.find((s) => s.id === targetSceneId)?.layers.length || 0) + 1
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

      bringLayerForward: (sceneId, layerId) => {
        const state = get();
        const scId = sceneId || state.activeSceneId;
        const scene = state.scenes.find((s) => s.id === scId);
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
        set((s) => ({
          scenes: s.scenes.map((sc) =>
            sc.id === scId ? { ...sc, layers } : sc,
          ),
        }));
      },

      sendLayerBackward: (sceneId, layerId) => {
        const state = get();
        const scId = sceneId || state.activeSceneId;
        const scene = state.scenes.find((s) => s.id === scId);
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
        set((s) => ({
          scenes: s.scenes.map((sc) =>
            sc.id === scId ? { ...sc, layers } : sc,
          ),
        }));
      },

      bringLayerToFront: (sceneId, layerId) => {
        const state = get();
        const scId = sceneId || state.activeSceneId;
        const scene = state.scenes.find((s) => s.id === scId);
        if (!scene || scene.layers.length <= 1) return;

        const targetIds = layerId ? [layerId] : state.selectedLayerIds;
        if (targetIds.length === 0) return;

        const targetSet = new Set(targetIds);
        const unselected = scene.layers.filter((l) => !targetSet.has(l.id));
        const selected = scene.layers.filter((l) => targetSet.has(l.id));
        const layers = [...unselected, ...selected];

        set((s) => ({
          scenes: s.scenes.map((sc) =>
            sc.id === scId ? { ...sc, layers } : sc,
          ),
        }));
      },

      sendLayerToBack: (sceneId, layerId) => {
        const state = get();
        const scId = sceneId || state.activeSceneId;
        const scene = state.scenes.find((s) => s.id === scId);
        if (!scene || scene.layers.length <= 1) return;

        const targetIds = layerId ? [layerId] : state.selectedLayerIds;
        if (targetIds.length === 0) return;

        const targetSet = new Set(targetIds);
        const unselected = scene.layers.filter((l) => !targetSet.has(l.id));
        const selected = scene.layers.filter((l) => targetSet.has(l.id));
        const layers = [...selected, ...unselected];

        set((s) => ({
          scenes: s.scenes.map((sc) =>
            sc.id === scId ? { ...sc, layers } : sc,
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
              curr = parentLayer ? (parentLayer.parentId ?? null) : null;
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
          effects: [],
          effectsOrder: [],
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

      ungroupSelectedLayers: () => {
        const state = get();
        const scene = state.scenes.find((s) => s.id === state.activeSceneId);
        if (!scene || state.selectedLayerIds.length === 0) return [];

        const selectedGroups = scene.layers.filter(
          (l) => state.selectedLayerIds.includes(l.id) && l.type === "group",
        );
        if (selectedGroups.length === 0) return [];

        let currentLayers = [...scene.layers];
        const allUnparentedChildIds: string[] = [];

        for (const group of selectedGroups) {
          const groupParentId = group.parentId ?? null;
          const groupIdx = currentLayers.findIndex((l) => l.id === group.id);
          if (groupIdx === -1) continue;

          // Find direct children of this group
          const children = currentLayers.filter((l) => l.parentId === group.id);

          const groupW = Math.max(1, group.transform.width);
          const groupH = Math.max(1, group.transform.height);
          const groupCX = group.transform.x + groupW / 2;
          const groupCY = group.transform.y + groupH / 2;
          const dRot = group.transform.rotation || 0;
          const dRotRad = (dRot * Math.PI) / 180;
          const cosRot = Math.cos(dRotRad);
          const sinRot = Math.sin(dRotRad);

          const reparentedChildren = children.map((child) => {
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

          // Remove the group and its direct children, and insert the reparented children at the group position
          const remaining = currentLayers.filter(
            (l) => l.id !== group.id && l.parentId !== group.id,
          );
          const insertPos = Math.min(groupIdx, remaining.length);
          currentLayers = [
            ...remaining.slice(0, insertPos),
            ...reparentedChildren,
            ...remaining.slice(insertPos),
          ];
        }

        set({
          scenes: state.scenes.map((sc) =>
            sc.id === state.activeSceneId ? { ...sc, layers: currentLayers } : sc,
          ),
          selectedLayerIds: allUnparentedChildIds,
        });

        return allUnparentedChildIds;
      },

      alignLeft: () => {
        const state = get();
        const scene = state.scenes.find((s) => s.id === state.activeSceneId);
        if (!scene || state.selectedLayerIds.length === 0) return;
        const selected = scene.layers.filter((l) => state.selectedLayerIds.includes(l.id));
        if (selected.length === 0) return;

        let targetMinX: number;
        if (selected.length >= 2) {
          targetMinX = Math.min(...selected.map((l) => getLayerVisualAABB(l).minX));
        } else {
          targetMinX = 0; // frame left
        }

        set({
          scenes: state.scenes.map((sc) =>
            sc.id === state.activeSceneId
              ? {
                  ...sc,
                  layers: sc.layers.map((layer) => {
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
        const scene = state.scenes.find((s) => s.id === state.activeSceneId);
        if (!scene || state.selectedLayerIds.length === 0) return;
        const selected = scene.layers.filter((l) => state.selectedLayerIds.includes(l.id));
        if (selected.length === 0) return;

        let targetMaxX: number;
        if (selected.length >= 2) {
          targetMaxX = Math.max(...selected.map((l) => getLayerVisualAABB(l).maxX));
        } else {
          targetMaxX = state.aspectRatio === "9:16" ? 1080 : state.aspectRatio === "1:1" ? 1080 : 1920;
        }

        set({
          scenes: state.scenes.map((sc) =>
            sc.id === state.activeSceneId
              ? {
                  ...sc,
                  layers: sc.layers.map((layer) => {
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
        const scene = state.scenes.find((s) => s.id === state.activeSceneId);
        if (!scene || state.selectedLayerIds.length === 0) return;
        const selected = scene.layers.filter((l) => state.selectedLayerIds.includes(l.id));
        if (selected.length === 0) return;

        let targetMinY: number;
        if (selected.length >= 2) {
          targetMinY = Math.min(...selected.map((l) => getLayerVisualAABB(l).minY));
        } else {
          targetMinY = 0; // frame top
        }

        set({
          scenes: state.scenes.map((sc) =>
            sc.id === state.activeSceneId
              ? {
                  ...sc,
                  layers: sc.layers.map((layer) => {
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
        const scene = state.scenes.find((s) => s.id === state.activeSceneId);
        if (!scene || state.selectedLayerIds.length === 0) return;
        const selected = scene.layers.filter((l) => state.selectedLayerIds.includes(l.id));
        if (selected.length === 0) return;

        let targetMaxY: number;
        if (selected.length >= 2) {
          targetMaxY = Math.max(...selected.map((l) => getLayerVisualAABB(l).maxY));
        } else {
          targetMaxY = state.aspectRatio === "9:16" ? 1920 : state.aspectRatio === "1:1" ? 1080 : 1080;
        }

        set({
          scenes: state.scenes.map((sc) =>
            sc.id === state.activeSceneId
              ? {
                  ...sc,
                  layers: sc.layers.map((layer) => {
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
        const scene = state.scenes.find((s) => s.id === state.activeSceneId);
        if (!scene || state.selectedLayerIds.length === 0) return;
        const selected = scene.layers.filter((l) => state.selectedLayerIds.includes(l.id));
        if (selected.length === 0) return;

        let targetCenterH: number;
        if (selected.length >= 2) {
          const minX = Math.min(...selected.map((l) => getLayerVisualAABB(l).minX));
          const maxX = Math.max(...selected.map((l) => getLayerVisualAABB(l).maxX));
          targetCenterH = (minX + maxX) / 2;
        } else {
          const frameW = state.aspectRatio === "9:16" ? 1080 : state.aspectRatio === "1:1" ? 1080 : 1920;
          targetCenterH = frameW / 2;
        }

        set({
          scenes: state.scenes.map((sc) =>
            sc.id === state.activeSceneId
              ? {
                  ...sc,
                  layers: sc.layers.map((layer) => {
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
        const scene = state.scenes.find((s) => s.id === state.activeSceneId);
        if (!scene || state.selectedLayerIds.length === 0) return;
        const selected = scene.layers.filter((l) => state.selectedLayerIds.includes(l.id));
        if (selected.length === 0) return;

        let targetCenterV: number;
        if (selected.length >= 2) {
          const minY = Math.min(...selected.map((l) => getLayerVisualAABB(l).minY));
          const maxY = Math.max(...selected.map((l) => getLayerVisualAABB(l).maxY));
          targetCenterV = (minY + maxY) / 2;
        } else {
          const frameH = state.aspectRatio === "9:16" ? 1920 : state.aspectRatio === "1:1" ? 1080 : 1080;
          targetCenterV = frameH / 2;
        }

        set({
          scenes: state.scenes.map((sc) =>
            sc.id === state.activeSceneId
              ? {
                  ...sc,
                  layers: sc.layers.map((layer) => {
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
        const scene = state.scenes.find((s) => s.id === state.activeSceneId);
        if (!scene || state.selectedLayerIds.length === 0) return;
        const selected = scene.layers.filter((l) => state.selectedLayerIds.includes(l.id));
        if (selected.length === 0) return;

        if (selected.length === 1) {
          const target = selected[0];
          set({
            scenes: state.scenes.map((sc) =>
              sc.id === state.activeSceneId
                ? {
                    ...sc,
                    layers: sc.layers.map((l) =>
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

        // Multi-layer flip: mirror positions around selection center
        const minX = Math.min(...selected.map((l) => getLayerVisualAABB(l).minX));
        const maxX = Math.max(...selected.map((l) => getLayerVisualAABB(l).maxX));
        const selCenterH = (minX + maxX) / 2;

        set({
          scenes: state.scenes.map((sc) =>
            sc.id === state.activeSceneId
              ? {
                  ...sc,
                  layers: sc.layers.map((layer) => {
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
        const scene = state.scenes.find((s) => s.id === state.activeSceneId);
        if (!scene || state.selectedLayerIds.length === 0) return;
        const selected = scene.layers.filter((l) => state.selectedLayerIds.includes(l.id));
        if (selected.length === 0) return;

        if (selected.length === 1) {
          const target = selected[0];
          set({
            scenes: state.scenes.map((sc) =>
              sc.id === state.activeSceneId
                ? {
                    ...sc,
                    layers: sc.layers.map((l) =>
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

        // Multi-layer flip: mirror positions around selection center
        const minY = Math.min(...selected.map((l) => getLayerVisualAABB(l).minY));
        const maxY = Math.max(...selected.map((l) => getLayerVisualAABB(l).maxY));
        const selCenterV = (minY + maxY) / 2;

        set({
          scenes: state.scenes.map((sc) =>
            sc.id === state.activeSceneId
              ? {
                  ...sc,
                  layers: sc.layers.map((layer) => {
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

        if (useEditorUIStore.getState().animateMode) {
          const state = get();
          const activeScene = state.scenes.find((s) => s.id === state.activeSceneId);
          if (activeScene) {
            const currentFrame = useEditorUIStore.getState().currentFrame;
            for (const l of activeScene.layers) {
              if (state.selectedLayerIds.includes(l.id)) {
                state.recordKeyframe(l.id, "x", l.transform.x, currentFrame, state.activeSceneId);
                state.recordKeyframe(l.id, "y", l.transform.y, currentFrame, state.activeSceneId);
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
          useEditorUIStore.getState().setIsLightSelected(false);
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
          effects: [],
          effectsOrder: [],
          ...sceneOverride,
        };

        set((state) => ({
          scenes: [...state.scenes, newScene],
          activeSceneId: newSceneId,
          selectedLayerIds: [],
        }));

        return newSceneId;
      },

      updateScene: (sceneId, partial) => {
        set((state) => ({
          scenes: state.scenes.map((scene) =>
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
        if (state.scenes.length <= 1) return; // Keep at least 1 scene
        const remaining = state.scenes.filter((s) => s.id !== sceneId);
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
        const target = state.scenes.find((s) => s.id === sceneId);
        if (!target) return "";
        const newSceneId = `scene-${Date.now()}`;
        const cloned: Scene = JSON.parse(JSON.stringify(target));
        cloned.id = newSceneId;
        cloned.name = `${target.name} (Copy)`;
        const targetIndex = state.scenes.findIndex((s) => s.id === sceneId);
        const updated = [...state.scenes];
        updated.splice(targetIndex + 1, 0, cloned);
        set({
          scenes: updated,
          activeSceneId: newSceneId,
          selectedLayerIds: [],
        });
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

      addSceneEffect: (sceneId, type) => {
        const targetSceneId = sceneId || get().activeSceneId;
        const newEffect = createDefaultSceneEffect(type);

        set((state) => ({
          scenes: state.scenes.map((scene) => {
            if (scene.id !== targetSceneId) return scene;
            const currentEffects = scene.effects || [];
            const currentOrder = scene.effectsOrder || currentEffects.map((e) => e.id);
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
        set((state) => ({
          scenes: state.scenes.map((scene) => {
            if (scene.id !== targetSceneId) return scene;
            return {
              ...scene,
              effects: (scene.effects || []).map((fx) =>
                fx.id === effectId ? ({ ...fx, ...partial } as SceneEffect) : fx,
              ),
            };
          }),
        }));
      },

      removeSceneEffect: (sceneId, effectId) => {
        const targetSceneId = sceneId || get().activeSceneId;
        set((state) => ({
          scenes: state.scenes.map((scene) => {
            if (scene.id !== targetSceneId) return scene;
            return {
              ...scene,
              effects: (scene.effects || []).filter((fx) => fx.id !== effectId),
              effectsOrder: (scene.effectsOrder || []).filter((id) => id !== effectId),
            };
          }),
        }));
      },

      toggleSceneEffectVisible: (sceneId, effectId) => {
        const targetSceneId = sceneId || get().activeSceneId;
        set((state) => ({
          scenes: state.scenes.map((scene) => {
            if (scene.id !== targetSceneId) return scene;
            return {
              ...scene,
              effects: (scene.effects || []).map((fx) =>
                fx.id === effectId ? { ...fx, visible: !fx.visible } : fx,
              ),
            };
          }),
        }));
      },

      reorderSceneEffects: (sceneId, newOrder) => {
        const targetSceneId = sceneId || get().activeSceneId;
        set((state) => ({
          scenes: state.scenes.map((scene) => {
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

        set((state) => ({
          scenes: state.scenes.map((scene) => {
            if (scene.id !== targetSceneId) return scene;
            return {
              ...scene,
              effects: (scene.effects || []).map((fx) => {
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

      addLayerEffect: (layerId, type) => {
        const state = get();
        let targetLayer: Layer | undefined;
        for (const s of state.scenes) {
          const l = s.layers.find((ly) => ly.id === layerId);
          if (l) {
            targetLayer = l;
            break;
          }
        }
        if (targetLayer && !isLayerEffectAvailable(targetLayer, type)) {
          return "";
        }
        const newEffect = createDefaultLayerEffect(type);

        set((s) => ({
          scenes: s.scenes.map((scene) => ({
            ...scene,
            layers: scene.layers.map((layer) => {
              if (layer.id !== layerId) return layer;
              const currentEffects = layer.effects || [];
              const currentOrder =
                layer.effectsOrder && layer.effectsOrder.length > 0
                  ? layer.effectsOrder
                  : currentEffects.map((e) => e.id);
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
        set((state) => ({
          scenes: state.scenes.map((scene) => ({
            ...scene,
            layers: scene.layers.map((layer) => {
              if (layer.id !== layerId) return layer;
              return {
                ...layer,
                effects: (layer.effects || []).map((fx) =>
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
        set((state) => ({
          scenes: state.scenes.map((scene) => ({
            ...scene,
            layers: scene.layers.map((layer) => {
              if (layer.id !== layerId) return layer;
              return {
                ...layer,
                effects: (layer.effects || []).filter((fx) => fx.id !== effectId),
                effectsOrder: (layer.effectsOrder || []).filter((id) => id !== effectId),
              };
            }),
          })),
        }));
      },

      toggleLayerEffectVisible: (layerId, effectId) => {
        set((state) => ({
          scenes: state.scenes.map((scene) => ({
            ...scene,
            layers: scene.layers.map((layer) => {
              if (layer.id !== layerId) return layer;
              return {
                ...layer,
                effects: (layer.effects || []).map((fx) =>
                  fx.id === effectId ? { ...fx, visible: !fx.visible } : fx,
                ),
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
          const l = s.layers.find((ly) => ly.id === layerId);
          if (l) {
            targetLayer = l;
            break;
          }
        }
        if (targetLayer && !isLayerEffectAvailable(targetLayer, newType)) {
          return;
        }
        const freshDefault = createDefaultLayerEffect(newType);

        set((s) => ({
          scenes: s.scenes.map((scene) => ({
            ...scene,
            layers: scene.layers.map((layer) => {
              if (layer.id !== layerId) return layer;
              return {
                ...layer,
                effects: (layer.effects || []).map((fx) => {
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

        const presetBlockData = blockData as any;
        const presetVal: BlockPreset =
          typeof presetBlockData.preset === "string"
            ? (presetBlockData.preset as BlockPreset)
            : (presetBlockData.preset as any)?.id || "fade-in";

        const isCameraBlock = presetVal === "camera-move" || blockData.layerId === null;

        const cameraToVal = "cameraTo" in blockData ? (blockData as any).cameraTo : undefined;
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
            ? cameraToVal || { x: 200, y: 0, z: 300, fov: 0 }
            : cameraToVal,
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
                  if ("keyframes" in partial && partial.keyframes) {
                    const sorted = [...(partial.keyframes as Keyframe<number | string>[])].sort((k1, k2) => k1.frame - k2.frame);
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

      recordKeyframe: (layerId, property, value, frame, sceneId) => {
        const targetSceneId = sceneId || get().activeSceneId;
        const targetFrame =
          frame !== undefined ? frame : useEditorUIStore.getState().currentFrame;
        const scene = get().scenes.find((s) => s.id === targetSceneId);
        if (!scene) return;
        const layer = scene.layers.find((l) => l.id === layerId);
        if (!layer) return;

        const existingBlockIdx = scene.animationBlocks.findIndex(
          (b) => isKeyframeTrack(b) && b.layerId === layerId && b.property === property,
        );

        if (existingBlockIdx !== -1) {
          const block = scene.animationBlocks[existingBlockIdx] as KeyframeTrackBlock;
          const existingKfIdx = block.keyframes.findIndex((k) => k.frame === targetFrame);
          let updatedKeyframes: Keyframe<number | string>[];

          if (existingKfIdx !== -1) {
            updatedKeyframes = block.keyframes.map((k, idx) =>
              idx === existingKfIdx ? { ...k, value } : k,
            );
          } else {
            updatedKeyframes = [
              ...block.keyframes,
              {
                frame: targetFrame,
                value,
                easing: "ease-in-out" as const,
              },
            ].sort((a, b) => a.frame - b.frame);
          }

          const startFrame = updatedKeyframes[0].frame;
          const endFrame = Math.max(startFrame + 1, updatedKeyframes[updatedKeyframes.length - 1].frame);

          const updatedBlock: KeyframeTrackBlock = {
            ...block,
            keyframes: updatedKeyframes,
            startFrame,
            endFrame,
          };

          set((state) => ({
            scenes: state.scenes.map((s) =>
              s.id === targetSceneId
                ? {
                    ...s,
                    animationBlocks: s.animationBlocks.map((b, idx) =>
                      idx === existingBlockIdx ? updatedBlock : b,
                    ),
                  }
                : s,
            ),
          }));
        } else {
          let baselineValue: number | string = 0;
          switch (property) {
            case "x":
              baselineValue = layer.transform.x;
              break;
            case "y":
              baselineValue = layer.transform.y;
              break;
            case "width":
              baselineValue = layer.transform.width;
              break;
            case "height":
              baselineValue = layer.transform.height;
              break;
            case "rotation":
              baselineValue = layer.transform.rotation || 0;
              break;
            case "depth":
              baselineValue = layer.transform.depth || 0;
              break;
            case "rotateX":
              baselineValue = layer.transform.rotateX || 0;
              break;
            case "rotateY":
              baselineValue = layer.transform.rotateY || 0;
              break;
            case "opacity":
              baselineValue = layer.opacity ?? 1;
              break;
            case "fill":
              baselineValue = layer.shape?.fill ?? layer.text?.color ?? "#38bdf8";
              break;
            case "stroke":
              baselineValue = layer.shape?.stroke ?? "#ffffff";
              break;
            case "fontSize":
              baselineValue = layer.text?.fontSize ?? 32;
              break;
          }

          let initialKeyframes: Keyframe<number | string>[];
          let startFrame = 0;
          let endFrame = 1;

          if (targetFrame > 0) {
            startFrame = Math.max(0, targetFrame - 30);
            endFrame = targetFrame;
            initialKeyframes = [
              { frame: startFrame, value: baselineValue, easing: "ease-in-out" },
              { frame: targetFrame, value, easing: "ease-in-out" },
            ];
          } else {
            initialKeyframes = [{ frame: 0, value, easing: "ease-in-out" }];
            endFrame = 1;
          }

          const newBlock: KeyframeTrackBlock = {
            id: `kf-track-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            kind: "keyframe",
            layerId,
            property,
            keyframes: initialKeyframes,
            startFrame,
            endFrame,
            preset: property,
          };

          set((state) => ({
            scenes: state.scenes.map((s) =>
              s.id === targetSceneId
                ? {
                    ...s,
                    animationBlocks: [...s.animationBlocks, newBlock],
                  }
                : s,
            ),
          }));
        }
      },

      toggleSelectedLayersVisibility: () => {
        const state = get();
        const scene = state.scenes.find((s) => s.id === state.activeSceneId);
        if (!scene || state.selectedLayerIds.length === 0) return;
        const selectedLayers = scene.layers.filter((l) => state.selectedLayerIds.includes(l.id));
        if (!selectedLayers.length) return;
        const anyVisible = selectedLayers.some((l) => l.visible);
        const nextVisible = !anyVisible;
        const selSet = new Set(state.selectedLayerIds);

        set((s) => ({
          scenes: s.scenes.map((sc) =>
            sc.id === s.activeSceneId
              ? {
                  ...sc,
                  layers: sc.layers.map((l) =>
                    selSet.has(l.id) ? { ...l, visible: nextVisible } : l
                  ),
                }
              : sc,
          ),
        }));
      },

      setSelectedLayersOpacity: (opacity: number) => {
        const state = get();
        const scene = state.scenes.find((s) => s.id === state.activeSceneId);
        if (!scene || state.selectedLayerIds.length === 0) return;
        const clamped = Math.max(0, Math.min(1, opacity));
        const ui = useEditorUIStore.getState();

        if (ui.animateMode) {
          state.selectedLayerIds.forEach((id) => {
            state.recordKeyframe(id, "opacity", clamped, ui.currentFrame, state.activeSceneId);
          });
        }

        const selSet = new Set(state.selectedLayerIds);
        set((s) => ({
          scenes: s.scenes.map((sc) =>
            sc.id === s.activeSceneId
              ? {
                  ...sc,
                  layers: sc.layers.map((l) =>
                    selSet.has(l.id) ? { ...l, opacity: clamped } : l
                  ),
                }
              : sc,
          ),
        }));
      },

      splitBlocksAtPlayhead: (frame, sceneId) => {
        const state = get();
        const scId = sceneId || state.activeSceneId;
        const scene = state.scenes.find((s) => s.id === scId);
        if (!scene) return;
        const targetFrame = frame ?? useEditorUIStore.getState().currentFrame;
        const selLayerIds = state.selectedLayerIds;
        const isCamera = useEditorUIStore.getState().isCameraSelected;

        const candidateBlocks = (scene.animationBlocks || []).filter((b) => {
          if (selLayerIds.length > 0) {
            return b.layerId && selLayerIds.includes(b.layerId);
          }
          if (isCamera) {
            return b.layerId === null;
          }
          return true;
        });

        const blocksToSplit = candidateBlocks.filter(
          (b) => b.startFrame < targetFrame && b.endFrame > targetFrame,
        );
        if (blocksToSplit.length === 0) return;

        const updatedBlocks = (scene.animationBlocks || []).flatMap((b) => {
          if (!blocksToSplit.some((splitB) => splitB.id === b.id)) {
            return [b];
          }

          if (isKeyframeTrack(b)) {
            const kfTrack = b as KeyframeTrackBlock;
            const sampledVal =
              sampleKeyframeTrack(kfTrack, targetFrame) ?? (kfTrack.keyframes[0]?.value ?? 0);
            const leftKeyframes = kfTrack.keyframes.filter((k) => k.frame < targetFrame);
            const rightKeyframes = kfTrack.keyframes.filter((k) => k.frame > targetFrame);

            const splitKf: Keyframe<number | string> = {
              frame: targetFrame,
              value: sampledVal,
              easing: "ease-in-out",
            };

            const leftBlock: KeyframeTrackBlock = {
              ...kfTrack,
              id: kfTrack.id,
              startFrame: kfTrack.startFrame,
              endFrame: targetFrame,
              keyframes: [...leftKeyframes, splitKf].sort((a, b) => a.frame - b.frame),
            };

            const rightBlock: KeyframeTrackBlock = {
              ...kfTrack,
              id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              startFrame: targetFrame,
              endFrame: kfTrack.endFrame,
              keyframes: [splitKf, ...rightKeyframes].sort((a, b) => a.frame - b.frame),
            };

            return [leftBlock, rightBlock];
          } else {
            const leftBlock: AnimationBlock = {
              ...b,
              endFrame: targetFrame,
            };
            const rightBlock: AnimationBlock = {
              ...b,
              id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              startFrame: targetFrame,
            };
            return [leftBlock, rightBlock];
          }
        });

        set((s) => ({
          scenes: s.scenes.map((sc) =>
            sc.id === scId ? { ...sc, animationBlocks: updatedBlocks } : sc,
          ),
        }));
      },

      trimInPointAtPlayhead: (frame, sceneId) => {
        const state = get();
        const scId = sceneId || state.activeSceneId;
        const scene = state.scenes.find((s) => s.id === scId);
        if (!scene) return;
        const targetFrame = frame ?? useEditorUIStore.getState().currentFrame;
        const selLayerIds = state.selectedLayerIds;
        const isCamera = useEditorUIStore.getState().isCameraSelected;

        const updatedBlocks = (scene.animationBlocks || []).map((b) => {
          const isTarget =
            selLayerIds.length > 0
              ? b.layerId && selLayerIds.includes(b.layerId)
              : isCamera
              ? b.layerId === null
              : true;

          if (!isTarget) return b;
          if (b.startFrame < targetFrame && targetFrame < b.endFrame) {
            if (isKeyframeTrack(b)) {
              const kfTrack = b as KeyframeTrackBlock;
              const sampledVal =
                sampleKeyframeTrack(kfTrack, targetFrame) ?? (kfTrack.keyframes[0]?.value ?? 0);
              const remainingKfs = kfTrack.keyframes.filter((k) => k.frame >= targetFrame);
              const hasExact = remainingKfs.some((k) => k.frame === targetFrame);
              const finalKfs = hasExact
                ? remainingKfs
                : [{ frame: targetFrame, value: sampledVal, easing: "ease-in-out" as const }, ...remainingKfs];
              return {
                ...kfTrack,
                startFrame: targetFrame,
                keyframes: finalKfs.sort((a, b) => a.frame - b.frame),
              };
            } else {
              return {
                ...b,
                startFrame: targetFrame,
              };
            }
          }
          return b;
        });

        set((s) => ({
          scenes: s.scenes.map((sc) =>
            sc.id === scId ? { ...sc, animationBlocks: updatedBlocks } : sc,
          ),
        }));
      },

      trimOutPointAtPlayhead: (frame, sceneId) => {
        const state = get();
        const scId = sceneId || state.activeSceneId;
        const scene = state.scenes.find((s) => s.id === scId);
        if (!scene) return;
        const targetFrame = frame ?? useEditorUIStore.getState().currentFrame;
        const selLayerIds = state.selectedLayerIds;
        const isCamera = useEditorUIStore.getState().isCameraSelected;

        const updatedBlocks = (scene.animationBlocks || []).map((b) => {
          const isTarget =
            selLayerIds.length > 0
              ? b.layerId && selLayerIds.includes(b.layerId)
              : isCamera
              ? b.layerId === null
              : true;

          if (!isTarget) return b;
          if (b.startFrame < targetFrame && targetFrame < b.endFrame) {
            if (isKeyframeTrack(b)) {
              const kfTrack = b as KeyframeTrackBlock;
              const sampledVal =
                sampleKeyframeTrack(kfTrack, targetFrame) ?? (kfTrack.keyframes[0]?.value ?? 0);
              const remainingKfs = kfTrack.keyframes.filter((k) => k.frame <= targetFrame);
              const hasExact = remainingKfs.some((k) => k.frame === targetFrame);
              const finalKfs = hasExact
                ? remainingKfs
                : [...remainingKfs, { frame: targetFrame, value: sampledVal, easing: "ease-in-out" as const }];
              return {
                ...kfTrack,
                endFrame: targetFrame,
                keyframes: finalKfs.sort((a, b) => a.frame - b.frame),
              };
            } else {
              return {
                ...b,
                endFrame: targetFrame,
              };
            }
          }
          return b;
        });

        set((s) => ({
          scenes: s.scenes.map((sc) =>
            sc.id === scId ? { ...sc, animationBlocks: updatedBlocks } : sc,
          ),
        }));
      },

      setAudioTrack: (sceneId, track) => {
        const targetSceneId = sceneId || get().activeSceneId;
        set((state) => ({
          scenes: state.scenes.map((scene) => {
            if (scene.id !== targetSceneId) return scene;
            return {
              ...scene,
              audioTrack: track,
            };
          }),
        }));
      },

      updateAudioTrack: (sceneId, partial) => {
        const targetSceneId = sceneId || get().activeSceneId;
        set((state) => ({
          scenes: state.scenes.map((scene) => {
            if (scene.id !== targetSceneId || !scene.audioTrack) return scene;
            return {
              ...scene,
              audioTrack: {
                ...scene.audioTrack,
                ...partial,
              },
            };
          }),
        }));
      },

      removeAudioTrack: (sceneId) => {
        const targetSceneId = sceneId || get().activeSceneId;
        set((state) => ({
          scenes: state.scenes.map((scene) => {
            if (scene.id !== targetSceneId) return scene;
            return {
              ...scene,
              audioTrack: null,
            };
          }),
        }));
      },

      applyZSpread: (sceneId, spacing = 50) => {
        const targetSceneId = sceneId || get().activeSceneId;
        set((state) => ({
          scenes: state.scenes.map((scene) => {
            if (scene.id !== targetSceneId) return scene;
            const topLayers = scene.layers.filter((l) => !l.parentId);
            const topIds = new Set(topLayers.map((l) => l.id));
            const depthMap = new Map<string, number>();
            topLayers.forEach((layer, idx) => {
              depthMap.set(layer.id, idx * spacing);
            });
            return {
              ...scene,
              layers: scene.layers.map((layer) => {
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
      useEditorStore.getState().selectLayers([]);
    }
  },

  setIsLightSelected: (selected) => {
    set({ isLightSelected: selected, ...(selected ? { isCameraSelected: false } : {}) });
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

