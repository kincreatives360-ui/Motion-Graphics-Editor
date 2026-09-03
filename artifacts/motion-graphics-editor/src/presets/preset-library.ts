import type { AnimationBlock, BlockPreset } from "../store/animation-blocks";
import type { Layer, Scene, Camera } from "../store/editor-store";

export interface PresetBlockDefinition {
  preset: BlockPreset;
  durationFrames: number;
  offsetFrames?: number; // relative to insertion playhead
  easing: "linear" | "ease-in-out" | "spring" | "custom";
  customCurve?: [number, number, number, number];
  cameraTo?: Partial<{ x: number; y: number; z: number; fov: number }>;
}

export interface AnimationPreset {
  id: string;
  name: string;
  description: string;
  category: "entrance" | "exit" | "camera" | "user";
  blocks: PresetBlockDefinition[];
  isUserCreated?: boolean;
  createdAt?: number;
}

export interface SceneTemplate {
  id: string;
  name: string;
  description: string;
  category?: "titles" | "broadcast" | "layout" | "user";
  durationFrames: number;
  fps: number;
  layers: Layer[];
  animationBlocks: AnimationBlock[];
  camera?: Camera;
  isUserCreated?: boolean;
  createdAt?: number;
}

/**
 * Hand-authored Animation Presets covering Entrances, Exits, and Camera moves
 */
export const BUILT_IN_ANIMATION_PRESETS: AnimationPreset[] = [
  // --- Entrances ---
  {
    id: "punchy-entrance",
    name: "Punchy Entrance",
    description: "Scale-in pop with quick fade-in over 12 frames with spring easing",
    category: "entrance",
    blocks: [
      {
        preset: "scale-in",
        durationFrames: 12,
        easing: "spring",
      },
      {
        preset: "fade-in",
        durationFrames: 10,
        easing: "ease-in-out",
      },
    ],
  },
  {
    id: "soft-reveal",
    name: "Soft Reveal",
    description: "Gentle upward slide with smooth fade-in over 24 frames with ease-in-out",
    category: "entrance",
    blocks: [
      {
        preset: "slide-in-up",
        durationFrames: 24,
        easing: "ease-in-out",
      },
      {
        preset: "fade-in",
        durationFrames: 20,
        easing: "ease-in-out",
      },
    ],
  },
  {
    id: "dramatic-drop",
    name: "Dramatic Drop",
    description: "High-impact spring drop from above settling quickly with bounce",
    category: "entrance",
    blocks: [
      {
        preset: "slide-in-down",
        durationFrames: 18,
        easing: "spring",
      },
      {
        preset: "scale-in",
        durationFrames: 16,
        easing: "spring",
      },
    ],
  },
  {
    id: "glide-from-left",
    name: "Glide from Left",
    description: "Fluid horizontal entrance sliding in from the left margin",
    category: "entrance",
    blocks: [
      {
        preset: "slide-in-left",
        durationFrames: 22,
        easing: "ease-in-out",
      },
      {
        preset: "fade-in",
        durationFrames: 18,
        easing: "ease-in-out",
      },
    ],
  },
  {
    id: "glide-from-right",
    name: "Glide from Right",
    description: "Fluid horizontal entrance sliding in from the right margin",
    category: "entrance",
    blocks: [
      {
        preset: "slide-in-right",
        durationFrames: 22,
        easing: "ease-in-out",
      },
      {
        preset: "fade-in",
        durationFrames: 18,
        easing: "ease-in-out",
      },
    ],
  },
  {
    id: "pop-and-settle",
    name: "Pop & Settle",
    description: "Spring overshoot scaling from compact to resting natural dimensions",
    category: "entrance",
    blocks: [
      {
        preset: "scale-in",
        durationFrames: 15,
        easing: "spring",
      },
    ],
  },
  {
    id: "clean-dissolve",
    name: "Clean Dissolve",
    description: "Smooth 20-frame linear opacity ramp to full visibility",
    category: "entrance",
    blocks: [
      {
        preset: "fade-in",
        durationFrames: 20,
        easing: "ease-in-out",
      },
    ],
  },
  {
    id: "snappy-zoom",
    name: "Snappy Zoom In",
    description: "Fast 8-frame explosive zoom-in for high-energy rhythm",
    category: "entrance",
    blocks: [
      {
        preset: "scale-in",
        durationFrames: 8,
        easing: "spring",
      },
      {
        preset: "fade-in",
        durationFrames: 6,
        easing: "linear",
      },
    ],
  },

  // --- Exits ---
  {
    id: "smooth-fade-out",
    name: "Smooth Fade-Out",
    description: "Gentle 20-frame opacity dissipation to zero",
    category: "exit",
    blocks: [
      {
        preset: "fade-out",
        durationFrames: 20,
        easing: "ease-in-out",
      },
    ],
  },
  {
    id: "quick-shrink-exit",
    name: "Quick Shrink Exit",
    description: "Collapses scale to center while fading out over 14 frames",
    category: "exit",
    blocks: [
      {
        preset: "scale-out",
        durationFrames: 14,
        easing: "ease-in-out",
      },
      {
        preset: "fade-out",
        durationFrames: 14,
        easing: "ease-in-out",
      },
    ],
  },
  {
    id: "slide-out-down",
    name: "Slide Out Down",
    description: "Smooth exit gliding downward out of view while dissolving",
    category: "exit",
    blocks: [
      {
        preset: "slide-in-down",
        durationFrames: 18,
        easing: "ease-in-out",
      },
      {
        preset: "fade-out",
        durationFrames: 18,
        easing: "ease-in-out",
      },
    ],
  },
  {
    id: "slide-out-left",
    name: "Slide Out Left",
    description: "Sweeps horizontally toward the left border and fades",
    category: "exit",
    blocks: [
      {
        preset: "slide-in-left",
        durationFrames: 16,
        easing: "ease-in-out",
      },
      {
        preset: "fade-out",
        durationFrames: 16,
        easing: "ease-in-out",
      },
    ],
  },

  // --- Camera Moves ---
  {
    id: "camera-zoom-push",
    name: "Camera Push-In",
    description: "Cinematic push-in zoom into focal depth over 36 frames",
    category: "camera",
    blocks: [
      {
        preset: "camera-move",
        durationFrames: 36,
        easing: "ease-in-out",
        cameraTo: { z: 300 },
      },
    ],
  },
  {
    id: "cinematic-dolly",
    name: "Cinematic Dolly & Pan",
    description: "Smooth diagonal camera dolly motion over 45 frames",
    category: "camera",
    blocks: [
      {
        preset: "camera-move",
        durationFrames: 45,
        easing: "ease-in-out",
        cameraTo: { x: 120, y: 60, z: 120 },
      },
    ],
  },
  {
    id: "wide-angle-pull",
    name: "Wide-Angle Pull Back",
    description: "Expanding field of view zooming out to reveal scene context",
    category: "camera",
    blocks: [
      {
        preset: "camera-move",
        durationFrames: 40,
        easing: "ease-in-out",
        cameraTo: { z: -240, fov: 15 },
      },
    ],
  },
];

/**
 * Hand-authored Scene Templates using only existing layer types
 */
export const BUILT_IN_SCENE_TEMPLATES: SceneTemplate[] = [
  {
    id: "template-title-card",
    name: "Title Card",
    description: "Polished headline composition with glowing accent bar, title, and subtitle",
    category: "titles",
    durationFrames: 180,
    fps: 30,
    camera: {
      x: 0,
      y: 0,
      z: 0,
      fov: 60,
      focusDistance: 1000,
    },
    layers: [
      {
        id: "tpl-tc-bg",
        parentId: null,
        type: "shape",
        name: "Backdrop Card",
        transform: {
          x: 610,
          y: 340,
          width: 700,
          height: 340,
          rotation: 0,
          depth: 200,
        },
        opacity: 0.95,
        visible: true,
        locked: false,
        shape: {
          kind: "rect",
          fill: "#0b1018",
          stroke: "#1f293d",
          strokeWidth: 2,
          radius: 12,
        },
      },
      {
        id: "tpl-tc-bar",
        parentId: null,
        type: "shape",
        name: "Accent Pill",
        transform: {
          x: 670,
          y: 410,
          width: 80,
          height: 5,
          rotation: 0,
          depth: 100,
        },
        opacity: 1,
        visible: true,
        locked: false,
        shape: {
          kind: "rect",
          fill: "#38bdf8",
          stroke: "transparent",
          radius: 3,
        },
      },
      {
        id: "tpl-tc-title",
        parentId: null,
        type: "text",
        name: "Headline Text",
        transform: {
          x: 670,
          y: 440,
          width: 580,
          height: 60,
          rotation: 0,
          depth: 50,
        },
        opacity: 1,
        visible: true,
        locked: false,
        text: {
          content: "ELEVATE YOUR VISION",
          fontSize: 42,
          fontFamily: "Inter, system-ui, sans-serif",
          color: "#ffffff",
          align: "left",
        },
      },
      {
        id: "tpl-tc-subtitle",
        parentId: null,
        type: "text",
        name: "Subtitle Text",
        transform: {
          x: 670,
          y: 520,
          width: 580,
          height: 40,
          rotation: 0,
          depth: 20,
        },
        opacity: 0.9,
        visible: true,
        locked: false,
        text: {
          content: "Interactive real-time motion graphics studio",
          fontSize: 18,
          fontFamily: "Inter, system-ui, sans-serif",
          color: "#94a3b8",
          align: "left",
        },
      },
    ],
    animationBlocks: [
      {
        id: "ab-tc-1",
        layerId: "tpl-tc-bg",
        preset: "fade-in",
        startFrame: 0,
        endFrame: 20,
        easing: "ease-in-out",
      },
      {
        id: "ab-tc-2",
        layerId: "tpl-tc-bar",
        preset: "scale-in",
        startFrame: 6,
        endFrame: 22,
        easing: "spring",
      },
      {
        id: "ab-tc-3",
        layerId: "tpl-tc-title",
        preset: "slide-in-up",
        startFrame: 8,
        endFrame: 32,
        easing: "ease-in-out",
      },
      {
        id: "ab-tc-4",
        layerId: "tpl-tc-title",
        preset: "fade-in",
        startFrame: 8,
        endFrame: 26,
        easing: "ease-in-out",
      },
      {
        id: "ab-tc-5",
        layerId: "tpl-tc-subtitle",
        preset: "slide-in-up",
        startFrame: 16,
        endFrame: 38,
        easing: "ease-in-out",
      },
      {
        id: "ab-tc-6",
        layerId: "tpl-tc-subtitle",
        preset: "fade-in",
        startFrame: 16,
        endFrame: 36,
        easing: "ease-in-out",
      },
    ],
  },
  {
    id: "template-lower-third",
    name: "Lower Third",
    description: "Broadcast-quality speaker identity banner with role description and cyan accent",
    category: "broadcast",
    durationFrames: 180,
    fps: 30,
    camera: {
      x: 0,
      y: 0,
      z: 0,
      fov: 60,
      focusDistance: 1000,
    },
    layers: [
      {
        id: "tpl-lt-banner",
        parentId: null,
        type: "shape",
        name: "Banner Container",
        transform: {
          x: 120,
          y: 820,
          width: 520,
          height: 76,
          rotation: 0,
          depth: 50,
        },
        opacity: 0.95,
        visible: true,
        locked: false,
        shape: {
          kind: "rect",
          fill: "#080c13",
          stroke: "#1f293d",
          strokeWidth: 1.5,
          radius: 8,
        },
      },
      {
        id: "tpl-lt-pill",
        parentId: null,
        type: "shape",
        name: "Accent Border",
        transform: {
          x: 132,
          y: 832,
          width: 5,
          height: 52,
          rotation: 0,
          depth: 20,
        },
        opacity: 1,
        visible: true,
        locked: false,
        shape: {
          kind: "rect",
          fill: "#38bdf8",
          stroke: "transparent",
          radius: 3,
        },
      },
      {
        id: "tpl-lt-name",
        parentId: null,
        type: "text",
        name: "Speaker Name",
        transform: {
          x: 154,
          y: 844,
          width: 460,
          height: 28,
          rotation: 0,
          depth: 10,
        },
        opacity: 1,
        visible: true,
        locked: false,
        text: {
          content: "ALEXANDRA CHEN",
          fontSize: 22,
          fontFamily: "Inter, system-ui, sans-serif",
          color: "#ffffff",
          align: "left",
        },
      },
      {
        id: "tpl-lt-role",
        parentId: null,
        type: "text",
        name: "Title & Role",
        transform: {
          x: 154,
          y: 872,
          width: 460,
          height: 20,
          rotation: 0,
          depth: 10,
        },
        opacity: 0.9,
        visible: true,
        locked: false,
        text: {
          content: "Lead Motion Designer & Art Director",
          fontSize: 13,
          fontFamily: "Inter, system-ui, sans-serif",
          color: "#38bdf8",
          align: "left",
        },
      },
    ],
    animationBlocks: [
      {
        id: "ab-lt-1",
        layerId: "tpl-lt-banner",
        preset: "slide-in-left",
        startFrame: 0,
        endFrame: 22,
        easing: "ease-in-out",
      },
      {
        id: "ab-lt-2",
        layerId: "tpl-lt-banner",
        preset: "fade-in",
        startFrame: 0,
        endFrame: 16,
        easing: "ease-in-out",
      },
      {
        id: "ab-lt-3",
        layerId: "tpl-lt-name",
        preset: "slide-in-left",
        startFrame: 6,
        endFrame: 24,
        easing: "ease-in-out",
      },
      {
        id: "ab-lt-4",
        layerId: "tpl-lt-role",
        preset: "slide-in-left",
        startFrame: 10,
        endFrame: 28,
        easing: "ease-in-out",
      },
    ],
  },
  {
    id: "template-two-column",
    name: "Two-Column Comparison",
    description: "Side-by-side metric comparison cards with contrasting visual emphasis",
    category: "layout",
    durationFrames: 180,
    fps: 30,
    camera: {
      x: 0,
      y: 0,
      z: 0,
      fov: 60,
      focusDistance: 1000,
    },
    layers: [
      {
        id: "tpl-2c-header",
        parentId: null,
        type: "text",
        name: "Section Headline",
        transform: {
          x: 640,
          y: 160,
          width: 640,
          height: 48,
          rotation: 0,
          depth: 50,
        },
        opacity: 1,
        visible: true,
        locked: false,
        text: {
          content: "FRAMEWORK PERFORMANCE",
          fontSize: 32,
          fontFamily: "Inter, system-ui, sans-serif",
          color: "#ffffff",
          align: "center",
        },
      },
      {
        id: "tpl-2c-card-left",
        parentId: null,
        type: "shape",
        name: "Left Card Box",
        transform: {
          x: 520,
          y: 250,
          width: 400,
          height: 380,
          rotation: 0,
          depth: 100,
        },
        opacity: 0.95,
        visible: true,
        locked: false,
        shape: {
          kind: "rect",
          fill: "#111622",
          stroke: "#222a3d",
          strokeWidth: 1.5,
          radius: 12,
        },
      },
      {
        id: "tpl-2c-title-left",
        parentId: null,
        type: "text",
        name: "Left Title",
        transform: {
          x: 560,
          y: 290,
          width: 320,
          height: 30,
          rotation: 0,
          depth: 50,
        },
        opacity: 1,
        visible: true,
        locked: false,
        text: {
          content: "Traditional Pipeline",
          fontSize: 20,
          fontFamily: "Inter, system-ui, sans-serif",
          color: "#94a3b8",
          align: "left",
        },
      },
      {
        id: "tpl-2c-metric-left",
        parentId: null,
        type: "text",
        name: "Left Metric",
        transform: {
          x: 560,
          y: 360,
          width: 320,
          height: 50,
          rotation: 0,
          depth: 20,
        },
        opacity: 1,
        visible: true,
        locked: false,
        text: {
          content: "64.2 ms",
          fontSize: 40,
          fontFamily: "Inter, system-ui, sans-serif",
          color: "#f87171",
          align: "left",
        },
      },
      {
        id: "tpl-2c-card-right",
        parentId: null,
        type: "shape",
        name: "Right Card Box",
        transform: {
          x: 1000,
          y: 250,
          width: 400,
          height: 380,
          rotation: 0,
          depth: 100,
        },
        opacity: 0.95,
        visible: true,
        locked: false,
        shape: {
          kind: "rect",
          fill: "#0b1928",
          stroke: "#0284c7",
          strokeWidth: 2,
          radius: 12,
        },
      },
      {
        id: "tpl-2c-title-right",
        parentId: null,
        type: "text",
        name: "Right Title",
        transform: {
          x: 1040,
          y: 290,
          width: 320,
          height: 30,
          rotation: 0,
          depth: 50,
        },
        opacity: 1,
        visible: true,
        locked: false,
        text: {
          content: "Real-Time GPU Engine",
          fontSize: 20,
          fontFamily: "Inter, system-ui, sans-serif",
          color: "#38bdf8",
          align: "left",
        },
      },
      {
        id: "tpl-2c-metric-right",
        parentId: null,
        type: "text",
        name: "Right Metric",
        transform: {
          x: 1040,
          y: 360,
          width: 320,
          height: 50,
          rotation: 0,
          depth: 20,
        },
        opacity: 1,
        visible: true,
        locked: false,
        text: {
          content: "1.4 ms",
          fontSize: 40,
          fontFamily: "Inter, system-ui, sans-serif",
          color: "#34d399",
          align: "left",
        },
      },
    ],
    animationBlocks: [
      {
        id: "ab-2c-1",
        layerId: "tpl-2c-header",
        preset: "fade-in",
        startFrame: 0,
        endFrame: 18,
        easing: "ease-in-out",
      },
      {
        id: "ab-2c-2",
        layerId: "tpl-2c-card-left",
        preset: "slide-in-left",
        startFrame: 6,
        endFrame: 26,
        easing: "ease-in-out",
      },
      {
        id: "ab-2c-3",
        layerId: "tpl-2c-card-right",
        preset: "slide-in-right",
        startFrame: 10,
        endFrame: 30,
        easing: "ease-in-out",
      },
    ],
  },
  {
    id: "template-quote-spotlight",
    name: "Quote Spotlight",
    description: "Minimalist quote card framing an inspirational thought with author citation",
    category: "layout",
    durationFrames: 180,
    fps: 30,
    camera: {
      x: 0,
      y: 0,
      z: 0,
      fov: 60,
      focusDistance: 1000,
    },
    layers: [
      {
        id: "tpl-qs-card",
        parentId: null,
        type: "shape",
        name: "Quote Box",
        transform: {
          x: 540,
          y: 360,
          width: 840,
          height: 360,
          rotation: 0,
          depth: 100,
        },
        opacity: 0.95,
        visible: true,
        locked: false,
        shape: {
          kind: "rect",
          fill: "#090d14",
          stroke: "#1f293d",
          strokeWidth: 1.5,
          radius: 14,
        },
      },
      {
        id: "tpl-qs-quote",
        parentId: null,
        type: "text",
        name: "Quote Text",
        transform: {
          x: 600,
          y: 430,
          width: 720,
          height: 120,
          rotation: 0,
          depth: 50,
        },
        opacity: 1,
        visible: true,
        locked: false,
        text: {
          content: "“Design is not just what it looks like and feels like. Design is how it works.”",
          fontSize: 26,
          fontFamily: "Inter, system-ui, sans-serif",
          color: "#f8fafc",
          align: "left",
        },
      },
      {
        id: "tpl-qs-author",
        parentId: null,
        type: "text",
        name: "Author",
        transform: {
          x: 600,
          y: 580,
          width: 400,
          height: 30,
          rotation: 0,
          depth: 20,
        },
        opacity: 0.9,
        visible: true,
        locked: false,
        text: {
          content: "— Steve Jobs",
          fontSize: 16,
          fontFamily: "Inter, system-ui, sans-serif",
          color: "#38bdf8",
          align: "left",
        },
      },
    ],
    animationBlocks: [
      {
        id: "ab-qs-1",
        layerId: "tpl-qs-card",
        preset: "scale-in",
        startFrame: 0,
        endFrame: 20,
        easing: "spring",
      },
      {
        id: "ab-qs-2",
        layerId: "tpl-qs-quote",
        preset: "slide-in-up",
        startFrame: 8,
        endFrame: 32,
        easing: "ease-in-out",
      },
      {
        id: "ab-qs-3",
        layerId: "tpl-qs-author",
        preset: "fade-in",
        startFrame: 18,
        endFrame: 38,
        easing: "ease-in-out",
      },
    ],
  },
];
