/**
 * Remocn Animation Presets Library
 * Handcrafted production-ready motion presets inspired by remocn (shadcn for motion & video).
 * Provides atomic, composite entrance, exit, text, and camera animation presets.
 */

import type { AnimationPreset } from "./preset-library";

export const REMOCN_ANIMATION_PRESETS: AnimationPreset[] = [
  // --- Remocn Entrance Presets ---
  {
    id: "remocn-blur-reveal",
    name: "Blur Reveal (Remocn)",
    description: "Ultra-smooth de-focusing optical reveal with subtle forward momentum",
    category: "entrance",
    blocks: [
      {
        preset: "fade-in",
        durationFrames: 18,
        easing: "ease-in-out",
      },
      {
        preset: "scale-in",
        durationFrames: 22,
        easing: "spring",
        customCurve: [0.16, 1, 0.3, 1],
      },
    ],
  },
  {
    id: "remocn-typewriter-pop",
    name: "Typewriter Pop (Remocn)",
    description: "Snappy typographic emergence with energetic character spring settlement",
    category: "entrance",
    blocks: [
      {
        preset: "scale-in",
        durationFrames: 10,
        easing: "spring",
      },
      {
        preset: "fade-in",
        durationFrames: 8,
        easing: "linear",
      },
    ],
  },
  {
    id: "remocn-shimmer-sweep",
    name: "Shimmer Sweep (Remocn)",
    description: "High-specular gloss sweep transitioning from soft shadow into vivid light",
    category: "entrance",
    blocks: [
      {
        preset: "slide-in-left",
        durationFrames: 18,
        easing: "ease-in-out",
        customCurve: [0.22, 1, 0.36, 1],
      },
      {
        preset: "fade-in",
        durationFrames: 14,
        easing: "ease-in-out",
      },
    ],
  },
  {
    id: "remocn-kinetic-bounce",
    name: "Kinetic Bounce (Remocn)",
    description: "Physical gravity drop with harmonic squash-and-stretch rebounds",
    category: "entrance",
    blocks: [
      {
        preset: "slide-in-down",
        durationFrames: 24,
        easing: "spring",
      },
      {
        preset: "scale-in",
        durationFrames: 20,
        easing: "spring",
      },
    ],
  },
  {
    id: "remocn-elastic-snap",
    name: "Elastic Snap (Remocn)",
    description: "High-tension elastic overshoot with rapid kinetic damping",
    category: "entrance",
    blocks: [
      {
        preset: "scale-in",
        durationFrames: 16,
        easing: "spring",
        customCurve: [0.34, 1.56, 0.64, 1],
      },
    ],
  },
  {
    id: "remocn-whip-pan-in",
    name: "Whip Pan In (Remocn)",
    description: "High-velocity directional streak sliding in from offscreen with sudden brake",
    category: "entrance",
    blocks: [
      {
        preset: "slide-in-right",
        durationFrames: 14,
        easing: "custom",
        customCurve: [0.08, 0.82, 0.17, 1],
      },
      {
        preset: "fade-in",
        durationFrames: 10,
        easing: "linear",
      },
    ],
  },

  // --- Remocn Exit Presets ---
  {
    id: "remocn-blur-dissolve-out",
    name: "Blur Dissolve Out (Remocn)",
    description: "Optical dissipation dissolving into focal background blur",
    category: "exit",
    blocks: [
      {
        preset: "fade-out",
        durationFrames: 18,
        easing: "ease-in-out",
      },
      {
        preset: "scale-out",
        durationFrames: 16,
        easing: "ease-in-out",
      },
    ],
  },
  {
    id: "remocn-whip-pan-out",
    name: "Whip Pan Out (Remocn)",
    description: "Rapid acceleration exit sweeping elements off the left viewport edge",
    category: "exit",
    blocks: [
      {
        preset: "slide-in-left",
        durationFrames: 14,
        easing: "custom",
        customCurve: [0.85, 0, 0.15, 1],
      },
      {
        preset: "fade-out",
        durationFrames: 12,
        easing: "linear",
      },
    ],
  },

  // --- Remocn Camera Presets ---
  {
    id: "remocn-3d-parallax-drift",
    name: "3D Parallax Drift (Remocn)",
    description: "Smooth multiplane camera dolly push with subtle lateral parallax offset",
    category: "camera",
    blocks: [
      {
        preset: "camera-move",
        durationFrames: 60,
        easing: "ease-in-out",
        cameraTo: { x: 160, y: -40, z: 280, fov: -5 },
      },
    ],
  },
  {
    id: "remocn-cinematic-crane",
    name: "Cinematic Crane Up (Remocn)",
    description: "Upward vertical camera sweeping reveal establishing scene grandeur",
    category: "camera",
    blocks: [
      {
        preset: "camera-move",
        durationFrames: 50,
        easing: "ease-in-out",
        cameraTo: { y: 220, z: 180, fov: 10 },
      },
    ],
  },
  {
    id: "remocn-orbit-reveal",
    name: "Orbit Reveal (Remocn)",
    description: "Dynamic circular camera perspective shift orbiting focal center",
    category: "camera",
    blocks: [
      {
        preset: "camera-move",
        durationFrames: 45,
        easing: "ease-in-out",
        cameraTo: { x: -220, y: 80, z: 320, fov: -8 },
      },
    ],
  },
];
