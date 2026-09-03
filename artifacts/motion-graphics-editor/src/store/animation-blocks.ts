import type { Transform, Layer, Camera } from "./editor-store";

export type BlockPreset =
  | "fade-in"
  | "fade-out"
  | "slide-in-left"
  | "slide-in-right"
  | "slide-in-up"
  | "slide-in-down"
  | "scale-in"
  | "scale-out"
  | "camera-move"
  | "camera-orbit"
  | "typewriter"
  | "tilt-in";

export type AnimatableProperty =
  | "x"
  | "y"
  | "width"
  | "height"
  | "rotation"
  | "rotateX"
  | "rotateY"
  | "depth"
  | "opacity"
  | "fill"
  | "stroke"
  | "fontSize";

export type KeyframeEasing = "linear" | "ease-in-out" | "spring" | "custom";

export interface Keyframe<T = number | string> {
  frame: number;
  value: T;
  easing: KeyframeEasing;
  customCurve?: [number, number, number, number]; // [x1, y1, x2, y2]
}

export interface KeyframeTrackBlock {
  id: string;
  kind: "keyframe";
  layerId: string;
  property: AnimatableProperty;
  keyframes: Keyframe<number | string>[];
  startFrame: number;
  endFrame: number;
  preset?: string;
  easing?: KeyframeEasing;
  customCurve?: [number, number, number, number];
}

export interface PresetAnimationBlock {
  id: string;
  kind?: "preset";
  layerId: string | null; // null = camera block
  preset: BlockPreset;
  startFrame: number;
  endFrame: number;
  easing: "linear" | "ease-in-out" | "spring" | "custom";
  customCurve?: [number, number, number, number]; // cubic-bezier control points [x1, y1, x2, y2], only if easing === "custom"
  cameraTo?: Partial<{ x: number; y: number; z: number; fov: number }>;
}

export type AnimationBlock = PresetAnimationBlock | KeyframeTrackBlock;

export function isKeyframeTrack(block: AnimationBlock): block is KeyframeTrackBlock {
  return (block as any).kind === "keyframe" || Array.isArray((block as any).keyframes);
}

export interface SampledLayerDelta {
  transform: Partial<Transform>;
  opacity?: number;
}

export interface RenderedLayerState {
  transform: Transform;
  opacity: number;
  fill?: string;
  stroke?: string;
  fontSize?: number;
}

export const BLOCK_PRESETS: Array<{
  id: BlockPreset;
  label: string;
  description: string;
  category: "fade" | "slide" | "scale" | "camera";
  color: string;
}> = [
  {
    id: "fade-in",
    label: "Fade In",
    description: "Smoothly fades layer from 0% to full opacity",
    category: "fade",
    color: "#a855f7",
  },
  {
    id: "fade-out",
    label: "Fade Out",
    description: "Smoothly fades layer to 0% opacity",
    category: "fade",
    color: "#9333ea",
  },
  {
    id: "slide-in-left",
    label: "Slide In (Left)",
    description: "Slides layer in from the left offset",
    category: "slide",
    color: "#38bdf8",
  },
  {
    id: "slide-in-right",
    label: "Slide In (Right)",
    description: "Slides layer in from the right offset",
    category: "slide",
    color: "#0ea5e9",
  },
  {
    id: "slide-in-up",
    label: "Slide In (Up)",
    description: "Slides layer in upwards from bottom",
    category: "slide",
    color: "#0284c7",
  },
  {
    id: "slide-in-down",
    label: "Slide In (Down)",
    description: "Slides layer in downwards from top",
    category: "slide",
    color: "#2563eb",
  },
  {
    id: "scale-in",
    label: "Scale In",
    description: "Zooms layer up from reduced scale to 100%",
    category: "scale",
    color: "#f59e0b",
  },
  {
    id: "scale-out",
    label: "Scale Out",
    description: "Shrinks layer down with smooth exit",
    category: "scale",
    color: "#d97706",
  },
  {
    id: "camera-move",
    label: "Camera Move",
    description: "Animates 3D camera viewport position and zoom",
    category: "camera",
    color: "#10b981",
  },
];

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function sampleCubicBezier(
  t: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;

  // Newton-Raphson iteration to find parameter u where B_x(u) = t
  let u = t;
  for (let i = 0; i < 8; i++) {
    const currentX =
      3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u;
    const dx =
      3 * (1 - u) * (1 - u) * x1 +
      6 * (1 - u) * u * (x2 - x1) +
      3 * u * u * (1 - x2);
    if (Math.abs(currentX - t) < 1e-5 || Math.abs(dx) < 1e-6) break;
    u -= (currentX - t) / dx;
    u = clamp(u, 0, 1);
  }

  // Calculate B_y(u)
  return (
    3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u
  );
}

export function applyEasing(
  t: number,
  easing: "linear" | "ease-in-out" | "spring" | "custom",
  customCurve: [number, number, number, number] = [0.25, 0.1, 0.25, 1.0]
): number {
  const clampedT = clamp(t, 0, 1);
  switch (easing) {
    case "linear":
      return clampedT;
    case "ease-in-out":
      return sampleCubicBezier(clampedT, 0.42, 0, 0.58, 1);
    case "spring":
      if (clampedT === 0) return 0;
      if (clampedT === 1) return 1;
      // Damped spring overshoot formula
      return 1 - Math.exp(-6 * clampedT) * Math.cos(9 * clampedT);
    case "custom": {
      const [x1, y1, x2, y2] = customCurve || [0.25, 0.1, 0.25, 1.0];
      return sampleCubicBezier(clampedT, x1, y1, x2, y2);
    }
    default:
      return clampedT;
  }
}

export function parseColor(color: string): [number, number, number, number] {
  if (!color) return [255, 255, 255, 1];
  const c = color.trim().toLowerCase();
  if (c === "transparent") return [0, 0, 0, 0];
  if (c === "black") return [0, 0, 0, 1];
  if (c === "white") return [255, 255, 255, 1];
  if (c === "red") return [255, 0, 0, 1];
  if (c === "green") return [0, 128, 0, 1];
  if (c === "blue") return [0, 0, 255, 1];

  if (c.startsWith("#")) {
    const hex = c.slice(1);
    if (hex.length === 3) {
      return [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16),
        1,
      ];
    }
    if (hex.length === 4) {
      return [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16),
        parseInt(hex[3] + hex[3], 16) / 255,
      ];
    }
    if (hex.length === 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
        1,
      ];
    }
    if (hex.length === 8) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
        parseInt(hex.slice(6, 8), 16) / 255,
      ];
    }
  }

  const rgbMatch = c.match(
    /rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)/
  );
  if (rgbMatch) {
    return [
      parseFloat(rgbMatch[1]),
      parseFloat(rgbMatch[2]),
      parseFloat(rgbMatch[3]),
      rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1,
    ];
  }

  return [255, 255, 255, 1];
}

/**
 * Linear sRGB color interpolation.
 * Note: sRGB lerp is implemented for v1; HSL/LCH perceptual color space interpolation
 * can be added as a future enhancement.
 */
export function lerpColor(c1: string, c2: string, t: number): string {
  const [r1, g1, b1, a1] = parseColor(c1);
  const [r2, g2, b2, a2] = parseColor(c2);
  const r = Math.round(clamp(lerp(r1, r2, t), 0, 255));
  const g = Math.round(clamp(lerp(g1, g2, t), 0, 255));
  const b = Math.round(clamp(lerp(b1, b2, t), 0, 255));
  const a = clamp(lerp(a1, a2, t), 0, 1);

  if (a >= 0.999) {
    const hexR = r.toString(16).padStart(2, "0");
    const hexG = g.toString(16).padStart(2, "0");
    const hexB = b.toString(16).padStart(2, "0");
    return `#${hexR}${hexG}${hexB}`;
  }
  return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`;
}

export function sampleKeyframeTrack(
  track: KeyframeTrackBlock,
  frame: number
): number | string | undefined {
  if (!track.keyframes || track.keyframes.length === 0) {
    return undefined;
  }

  // Ensure keyframes are sorted chronologically by frame
  const kfs = track.keyframes.slice().sort((a, b) => a.frame - b.frame);

  // Before first keyframe: hold first value
  if (frame <= kfs[0].frame) {
    return kfs[0].value;
  }

  // After last keyframe: hold last value
  if (frame >= kfs[kfs.length - 1].frame) {
    return kfs[kfs.length - 1].value;
  }

  // Find enclosing keyframe segment [left, right]
  for (let i = 0; i < kfs.length - 1; i++) {
    const left = kfs[i];
    const right = kfs[i + 1];

    if (frame >= left.frame && frame <= right.frame) {
      const segmentDuration = right.frame - left.frame;
      if (segmentDuration <= 0) {
        return left.value;
      }
      const t = (frame - left.frame) / segmentDuration;
      const eased = applyEasing(t, left.easing || "linear", left.customCurve);

      // Color property interpolation (fill, stroke)
      if (track.property === "fill" || track.property === "stroke") {
        return lerpColor(String(left.value), String(right.value), eased);
      }

      // Numeric property interpolation
      const numLeft =
        typeof left.value === "number"
          ? left.value
          : parseFloat(String(left.value)) || 0;
      const numRight =
        typeof right.value === "number"
          ? right.value
          : parseFloat(String(right.value)) || 0;
      return lerp(numLeft, numRight, eased);
    }
  }

  return kfs[kfs.length - 1].value;
}

export function sampleBlock(
  block: AnimationBlock,
  frame: number,
  baseTransform: Transform,
  baseOpacity: number = 1
): SampledLayerDelta {
  const duration = Math.max(1, block.endFrame - block.startFrame);
  const t = clamp((frame - block.startFrame) / duration, 0, 1);
  const eased = applyEasing(t, block.easing, block.customCurve);

  const presetId =
    typeof block.preset === "string"
      ? block.preset
      : (block.preset as any)?.id || "fade-in";

  switch (presetId) {
    case "fade-in":
      return {
        transform: {},
        opacity: lerp(0, baseOpacity, eased),
      };
    case "fade-out":
      return {
        transform: {},
        opacity: lerp(baseOpacity, 0, eased),
      };
    case "slide-in-left":
      return {
        transform: { x: lerp(baseTransform.x - 240, baseTransform.x, eased) },
      };
    case "slide-in-right":
      return {
        transform: { x: lerp(baseTransform.x + 240, baseTransform.x, eased) },
      };
    case "slide-in-up":
      return {
        transform: { y: lerp(baseTransform.y + 200, baseTransform.y, eased) },
      };
    case "slide-in-down":
      return {
        transform: { y: lerp(baseTransform.y - 200, baseTransform.y, eased) },
      };
    case "scale-in": {
      const s = lerp(0.5, 1, eased);
      const cx = baseTransform.x + baseTransform.width / 2;
      const cy = baseTransform.y + baseTransform.height / 2;
      const nw = baseTransform.width * s;
      const nh = baseTransform.height * s;
      return {
        transform: {
          x: cx - nw / 2,
          y: cy - nh / 2,
          width: nw,
          height: nh,
        },
      };
    }
    case "scale-out": {
      const s = lerp(1, 0.4, eased);
      const cx = baseTransform.x + baseTransform.width / 2;
      const cy = baseTransform.y + baseTransform.height / 2;
      const nw = baseTransform.width * s;
      const nh = baseTransform.height * s;
      return {
        transform: {
          x: cx - nw / 2,
          y: cy - nh / 2,
          width: nw,
          height: nh,
        },
        opacity: lerp(baseOpacity, 0, eased),
      };
    }
    case "camera-move":
      return {
        transform: {},
      };
    default:
      return { transform: {} };
  }
}

/**
 * Animation Composition Policy & Precedence:
 * 1. Base Layer State:
 *    - Initialized from the layer's baseline properties (`transform`, `opacity`, `shape`, `text`).
 * 2. Preset Blocks (Transitions & Move Blocks):
 *    - Evaluated in chronological order by `startFrame` (stable sort).
 *    - Sequential accumulator composition: each preset block applies its in-range delta or
 *      pre-start / post-end hold states relative to the accumulated transform and opacity.
 * 3. Keyframe Tracks (Per-Property Explicit Tracks):
 *    - Evaluated on top of preset blocks: keyframe tracks allow authoring explicit property
 *      curves over time (x, y, width, height, rotation, opacity, fill, stroke, fontSize).
 *    - Precedence: If a property has a keyframe track, the sampled keyframe value explicitly
 *      governs that property at the target frame without clobbering other properties modified
 *      by preset blocks (e.g. a keyframe track on `rotation` composes smoothly alongside a
 *      preset `slide-in-left` modifying `x`).
 *    - If both a preset block and a keyframe track target the same property (e.g. both affect `opacity`),
 *      the keyframe track takes definitive precedence at that frame, honoring animator-authored curves.
 */
export function computeRenderedLayer(
  layer: Layer,
  blocks: AnimationBlock[],
  frame: number
): RenderedLayerState {
  const layerBlocks = blocks.filter((b) => b.layerId === layer.id);

  if (layerBlocks.length === 0) {
    return {
      transform: { ...layer.transform },
      opacity: layer.opacity ?? 1,
      fill: layer.shape?.fill ?? layer.text?.color,
      stroke: layer.shape?.stroke,
      fontSize: layer.text?.fontSize,
    };
  }

  const presetBlocks = layerBlocks
    .filter((b): b is PresetAnimationBlock => !isKeyframeTrack(b))
    .slice()
    .sort((a, b) => a.startFrame - b.startFrame);

  const keyframeTracks = layerBlocks
    .filter(isKeyframeTrack)
    .slice()
    .sort((a, b) => a.startFrame - b.startFrame);

  let finalTransform: Transform = { ...layer.transform };
  let finalOpacity: number = layer.opacity ?? 1;
  let finalFill: string | undefined = layer.shape?.fill ?? layer.text?.color;
  let finalStroke: string | undefined = layer.shape?.stroke;
  let finalFontSize: number | undefined = layer.text?.fontSize;

  // 1. Process preset blocks with sequential accumulator
  for (const block of presetBlocks) {
    const presetId =
      typeof block.preset === "string"
        ? block.preset
        : (block.preset as any)?.id || "fade-in";

    if (frame >= block.startFrame && frame <= block.endFrame) {
      const delta = sampleBlock(block, frame, finalTransform, finalOpacity);
      finalTransform = {
        ...finalTransform,
        ...delta.transform,
      };
      if (delta.opacity !== undefined) {
        finalOpacity = delta.opacity;
      }
    } else if (frame < block.startFrame) {
      // Entrance hold relative to accumulator
      if (presetId === "fade-in") {
        finalOpacity = 0;
      } else if (presetId === "scale-in") {
        const s = 0.5;
        const cx = finalTransform.x + finalTransform.width / 2;
        const cy = finalTransform.y + finalTransform.height / 2;
        finalTransform = {
          ...finalTransform,
          x: cx - (finalTransform.width * s) / 2,
          y: cy - (finalTransform.height * s) / 2,
          width: finalTransform.width * s,
          height: finalTransform.height * s,
        };
      } else if (presetId === "slide-in-left") {
        finalTransform = {
          ...finalTransform,
          x: finalTransform.x - 240,
        };
      } else if (presetId === "slide-in-right") {
        finalTransform = {
          ...finalTransform,
          x: finalTransform.x + 240,
        };
      } else if (presetId === "slide-in-up") {
        finalTransform = {
          ...finalTransform,
          y: finalTransform.y + 200,
        };
      } else if (presetId === "slide-in-down") {
        finalTransform = {
          ...finalTransform,
          y: finalTransform.y - 200,
        };
      }
    } else if (frame > block.endFrame) {
      // Exit hold relative to accumulator
      if (presetId === "fade-out") {
        finalOpacity = 0;
      } else if (presetId === "scale-out") {
        finalOpacity = 0;
        const s = 0.4;
        const cx = finalTransform.x + finalTransform.width / 2;
        const cy = finalTransform.y + finalTransform.height / 2;
        finalTransform = {
          ...finalTransform,
          x: cx - (finalTransform.width * s) / 2,
          y: cy - (finalTransform.height * s) / 2,
          width: finalTransform.width * s,
          height: finalTransform.height * s,
        };
      }
    }
  }

  // 2. Process keyframe tracks on top of accumulator
  for (const track of keyframeTracks) {
    const sampled = sampleKeyframeTrack(track, frame);
    if (sampled !== undefined) {
      switch (track.property) {
        case "x":
          finalTransform = { ...finalTransform, x: Number(sampled) };
          break;
        case "y":
          finalTransform = { ...finalTransform, y: Number(sampled) };
          break;
        case "width":
          finalTransform = {
            ...finalTransform,
            width: Math.max(1, Number(sampled)),
          };
          break;
        case "height":
          finalTransform = {
            ...finalTransform,
            height: Math.max(1, Number(sampled)),
          };
          break;
        case "rotation":
          finalTransform = { ...finalTransform, rotation: Number(sampled) };
          break;
        case "opacity":
          finalOpacity = clamp(Number(sampled), 0, 1);
          break;
        case "fill":
          finalFill = String(sampled);
          break;
        case "stroke":
          finalStroke = String(sampled);
          break;
        case "fontSize":
          finalFontSize = Math.max(1, Number(sampled));
          break;
      }
    }
  }

  return {
    transform: finalTransform,
    opacity: clamp(finalOpacity, 0, 1),
    fill: finalFill,
    stroke: finalStroke,
    fontSize: finalFontSize,
  };
}

export interface CameraTransform {
  camera: Camera;
  canvasWidth: number;
  canvasHeight: number;
}

// focalLength derived from fov: bigger fov = shorter focal length = more dramatic parallax
export function focalLength(fovDegrees: number, canvasHeight: number): number {
  return (canvasHeight / 2) / Math.tan((fovDegrees * Math.PI / 180) / 2);
}

export function projectLayer(
  layer: Layer,
  ctx: CameraTransform,
): { x: number; y: number; scale: number } {
  const f = focalLength(ctx.camera.fov, ctx.canvasHeight);
  const cx = ctx.canvasWidth / 2;
  const cy = ctx.canvasHeight / 2;

  const dx = layer.transform.x - ctx.camera.x - cx;
  const dy = layer.transform.y - ctx.camera.y - cy;
  const relDepth = (layer.transform.depth ?? 0) - ctx.camera.z;

  const pitch = ctx.camera.pitch ?? 0;
  const yaw = ctx.camera.yaw ?? 0;
  const roll = ctx.camera.roll ?? 0;

  // Optimized fast path when camera has no 3D rotation
  if (pitch === 0 && yaw === 0 && roll === 0) {
    const distance = Math.max(f * 0.05, f + relDepth);
    const scale = f / distance;
    const x = cx + dx * scale;
    const y = cy + dy * scale;
    return { x, y, scale };
  }

  // Convert degrees to radians for 3D extrinsic camera rotation
  const radYaw = (yaw * Math.PI) / 180;
  const radPitch = (pitch * Math.PI) / 180;
  const radRoll = (roll * Math.PI) / 180;

  // 1. Rotate around Y axis (Yaw)
  const dx1 = dx * Math.cos(radYaw) - relDepth * Math.sin(radYaw);
  const dz1 = dx * Math.sin(radYaw) + relDepth * Math.cos(radYaw);

  // 2. Rotate around X axis (Pitch)
  const dy2 = dy * Math.cos(radPitch) - dz1 * Math.sin(radPitch);
  const dz2 = dy * Math.sin(radPitch) + dz1 * Math.cos(radPitch);

  // 3. Rotate around Z axis (Roll)
  const dx3 = dx1 * Math.cos(radRoll) - dy2 * Math.sin(radRoll);
  const dy3 = dx1 * Math.sin(radRoll) + dy2 * Math.cos(radRoll);

  const distance = Math.max(f * 0.05, f + dz2);
  const scale = f / distance;
  const x = cx + dx3 * scale;
  const y = cy + dy3 * scale;

  return { x, y, scale };
}

export function sampleCamera(
  baseCamera: Camera,
  blocks: AnimationBlock[],
  frame: number,
): Camera {
  const cameraBlocks = blocks
    .filter((b): b is PresetAnimationBlock => !isKeyframeTrack(b) && (b.preset === "camera-move" || (b.preset as string) === "camera-orbit" || b.layerId === null))
    .slice()
    .sort((a, b) => a.startFrame - b.startFrame);

  let currentCamera: Camera = {
    x: baseCamera?.x ?? 0,
    y: baseCamera?.y ?? 0,
    z: baseCamera?.z ?? 0,
    pitch: baseCamera?.pitch ?? 0,
    yaw: baseCamera?.yaw ?? 0,
    roll: baseCamera?.roll ?? 0,
    fov: baseCamera?.fov ?? 60,
    focalLengthMm: baseCamera?.focalLengthMm ?? 50,
    apertureFStop: baseCamera?.apertureFStop ?? 2.8,
    focusDistance: baseCamera?.focusDistance ?? 1000,
    target: baseCamera?.target ?? { x: 960, y: 540, z: 0 },
  };

  for (const block of cameraBlocks) {
    if (!block.cameraTo) continue;

    const dx = block.cameraTo.x ?? 0;
    const dy = block.cameraTo.y ?? 0;
    const dz = block.cameraTo.z ?? 0;
    const dfov = block.cameraTo.fov ?? 0;
    const dpitch = (block.cameraTo as any).pitch ?? 0;
    const dyaw = (block.cameraTo as any).yaw ?? 0;
    const droll = (block.cameraTo as any).roll ?? 0;
    const dfocus = (block.cameraTo as any).focusDistance ?? 0;

    const duration = Math.max(1, block.endFrame - block.startFrame);

    if (frame >= block.startFrame && frame <= block.endFrame) {
      const t = clamp((frame - block.startFrame) / duration, 0, 1);
      const eased = applyEasing(t, block.easing, block.customCurve);
      currentCamera.x += dx * eased;
      currentCamera.y += dy * eased;
      currentCamera.z += dz * eased;
      currentCamera.pitch = (currentCamera.pitch ?? 0) + dpitch * eased;
      currentCamera.yaw = (currentCamera.yaw ?? 0) + dyaw * eased;
      currentCamera.roll = (currentCamera.roll ?? 0) + droll * eased;
      currentCamera.fov += dfov * eased;
      currentCamera.focusDistance += dfocus * eased;
    } else if (frame > block.endFrame) {
      currentCamera.x += dx;
      currentCamera.y += dy;
      currentCamera.z += dz;
      currentCamera.pitch = (currentCamera.pitch ?? 0) + dpitch;
      currentCamera.yaw = (currentCamera.yaw ?? 0) + dyaw;
      currentCamera.roll = (currentCamera.roll ?? 0) + droll;
      currentCamera.fov += dfov;
      currentCamera.focusDistance += dfocus;
    }
  }

  currentCamera.fov = clamp(currentCamera.fov, 10, 160);
  return currentCamera;
}

/**
 * Depth of field helper: blurs each layer proportionally to its distance from camera.focusDistance
 * Scaled by lens aperture F-stop (f/1.4 = deep cinematic bokeh, f/11 = sharp deep focus)
 */
export function dofBlurPx(layer: Layer, camera: Camera, maxBlur = 14): number {
  const layerDepth = layer.transform.depth ?? 0;
  const focusDist = camera.focusDistance ?? 1000;
  const distanceFromFocus = Math.abs(layerDepth - focusDist);
  const fStop = camera.apertureFStop || 2.8;
  const apertureFactor = 2.8 / fStop;
  return clamp((distanceFromFocus / 38) * apertureFactor, 0, maxBlur);
}

