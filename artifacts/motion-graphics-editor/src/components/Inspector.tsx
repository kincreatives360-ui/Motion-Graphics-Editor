import React, { useState, useEffect } from "react";
import {
  SlidersHorizontal,
  Share2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Layers,
  CirclePlay,
  Plus,
  Image as ImageIcon,
  Type,
  Square,
  Sparkles,
  Trash2,
  Activity,
  Zap,
  Camera as CameraIcon,
  RotateCcw,
  MoreVertical,
  Diamond,
  Sun,
  Smartphone,
  Monitor,
  Compass,
  Eye,
  Sliders,
  Box,
  Circle,
  Aperture,
  Wind,
  Ghost,
  Palette,
  Crop,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  FlipHorizontal,
  FlipVertical,
} from "lucide-react";
import { EffectStackPanel, type EffectTypeOption } from "./effects/EffectStackPanel";
import { LayerEffectsPanel } from "./effects/LayerEffectsPanel";
import {
  useEditorStore,
  useEditorUIStore,
  type Layer,
  type BackgroundMode,
  type SceneEffect,
  type BloomEffect,
  type VignetteEffect,
  type FilmGrainEffect,
  type ChromaticAberrationEffect,
  type DepthOfFieldEffect,
  type MotionBlurEffect,
  type ColorGradeEffect,
  type GhostEffect,
  type GlitchEffect,
  type EdgeFadeEffect,
  type SceneEffectType,
} from "../store/editor-store";
import {
  type AnimationBlock,
  type PresetAnimationBlock,
  type BlockPreset,
  type KeyframeTrackBlock,
  type Keyframe,
  type AnimatableProperty,
  BLOCK_PRESETS,
  isKeyframeTrack,
  sampleKeyframeTrack,
} from "../store/animation-blocks";
import { CubicBezierEditor } from "./CubicBezierEditor";
import { SaveAnimationPresetModal } from "./SavePresetModals";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { useScrubbableNumber, ScrubbableReadout, ScrubbableLabel } from "@/hooks/useScrubbableNumber";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

let sessionSceneAccordionSections: string[] = ["project-settings", "background"];
let sessionLayerAccordionSections: string[] = ["transform"];

function IconButton({
  label,
  testId,
  children,
  onClick,
  className = "",
}: {
  label: string;
  testId: string;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      className={`icon-button ${className}`}
      type="button"
      aria-label={label}
      title={label}
      data-testid={testId}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const FONT_OPTIONS = [
  { label: "Inter", value: "Inter, system-ui, sans-serif" },
  { label: "Roboto", value: "Roboto, sans-serif" },
  { label: "Space Grotesk", value: "Space Grotesk, sans-serif" },
  { label: "Playfair Display", value: "Playfair Display, Georgia, serif" },
  { label: "JetBrains Mono", value: "JetBrains Mono, monospace" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
];

function getAnimatablePropertiesForLayer(
  layer: Layer,
): Array<{ id: AnimatableProperty; label: string }> {
  const common: Array<{ id: AnimatableProperty; label: string }> = [
    { id: "x", label: "Position X" },
    { id: "y", label: "Position Y" },
    { id: "width", label: "Width" },
    { id: "height", label: "Height" },
    { id: "rotation", label: "Rotation" },
    { id: "opacity", label: "Opacity" },
  ];
  if (layer.type === "shape") {
    common.push({ id: "fill", label: "Fill Color" });
    common.push({ id: "stroke", label: "Stroke Color" });
  } else if (layer.type === "text") {
    common.push({ id: "fontSize", label: "Font Size" });
    common.push({ id: "fill", label: "Text Color" });
  }
  return common;
}

export function Inspector() {
  const projectName = useEditorStore((state) => state.projectName);
  const setProjectName = useEditorStore((state) => state.setProjectName);
  const aspectRatio = useEditorStore((state) => state.aspectRatio);
  const setAspectRatio = useEditorStore((state) => state.setAspectRatio);

  const selectedLayerIds = useEditorStore((state) => state.selectedLayerIds);
  const activeSceneId = useEditorStore((state) => state.activeSceneId);
  const scenes = useEditorStore((state) => state.scenes);
  const currentFrame = useEditorUIStore((state) => state.currentFrame);
  const updateLayer = useEditorStore((state) => state.updateLayer);
  const selectLayers = useEditorStore((state) => state.selectLayers);
  const addAnimationBlock = useEditorStore((state) => state.addAnimationBlock);
  const updateAnimationBlock = useEditorStore((state) => state.updateAnimationBlock);
  const removeAnimationBlock = useEditorStore((state) => state.removeAnimationBlock);
  const addKeyframeTrack = useEditorStore((state) => state.addKeyframeTrack);
  const addKeyframe = useEditorStore((state) => state.addKeyframe);
  const updateKeyframe = useEditorStore((state) => state.updateKeyframe);
  const removeKeyframe = useEditorStore((state) => state.removeKeyframe);
  const updateCamera = useEditorStore((state) => state.updateCamera);
  const addSceneEffect = useEditorStore((state) => state.addSceneEffect);
  const updateSceneEffect = useEditorStore((state) => state.updateSceneEffect);
  const removeSceneEffect = useEditorStore((state) => state.removeSceneEffect);
  const toggleSceneEffectVisible = useEditorStore((state) => state.toggleSceneEffectVisible);
  const reorderSceneEffects = useEditorStore((state) => state.reorderSceneEffects);
  const updateSceneLighting = useEditorStore((state) => state.updateSceneLighting);
  const resetCamera = useEditorStore((state) => state.resetCamera);
  const alignLeft = useEditorStore((state) => state.alignLeft);
  const alignCenterHorizontal = useEditorStore((state) => state.alignCenterHorizontal);
  const alignRight = useEditorStore((state) => state.alignRight);
  const alignTop = useEditorStore((state) => state.alignTop);
  const alignCenterVertical = useEditorStore((state) => state.alignCenterVertical);
  const alignBottom = useEditorStore((state) => state.alignBottom);
  const flipHorizontal = useEditorStore((state) => state.flipHorizontal);
  const flipVertical = useEditorStore((state) => state.flipVertical);
  const recordKeyframe = useEditorStore((state) => state.recordKeyframe);
  const openPresets = useEditorUIStore((state) => state.openPresets);
  const setExportModalOpen = useEditorUIStore((state) => state.setExportModalOpen);
  const setIsCameraSelected = useEditorUIStore((state) => state.setIsCameraSelected);
  const isLightSelected = useEditorUIStore((state) => state.isLightSelected);
  const setActiveTool = useEditorUIStore((state) => state.setActiveTool);

  const [savingBlockPreset, setSavingBlockPreset] = useState<AnimationBlock | null>(null);
  const [savingBlockCombo, setSavingBlockCombo] = useState<AnimationBlock[] | null>(null);

  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>("Color");
  const [lens, setLens] = useState("F 50 mm");
  const [shared, setShared] = useState(false);
  const [sceneAccordionSections, setSceneAccordionSections] = useState<string[]>(sessionSceneAccordionSections);
  const [layerAccordionSections, setLayerAccordionSections] = useState<string[]>(sessionLayerAccordionSections);

  const handleSceneAccordionChange = (val: string[]) => {
    sessionSceneAccordionSections = val;
    setSceneAccordionSections(val);
  };

  const handleLayerAccordionChange = (val: string[]) => {
    sessionLayerAccordionSections = val;
    setLayerAccordionSections(val);
  };

  useEffect(() => {
    if (isLightSelected && !sceneAccordionSections.includes("lighting")) {
      handleSceneAccordionChange([...sceneAccordionSections, "lighting"]);
    }
  }, [isLightSelected]);

  const activeScene = scenes.find((s) => s.id === activeSceneId) || scenes[0];


  // ── Scene effects panel helpers ─────────────────────────────────────────────

  const SCENE_EFFECT_TYPES: EffectTypeOption<SceneEffectType>[] = [
    { type: "depthOfField",        name: "Depth of Field",       icon: Aperture },
    { type: "bloom",               name: "Bloom",                icon: Sparkles },
    { type: "vignette",            name: "Vignette",             icon: Circle },
    { type: "motionBlur",          name: "Motion Blur",          icon: Wind },
    { type: "chromaticAberration", name: "Chromatic Aberration", icon: Sliders },
    { type: "filmGrain",           name: "Film Grain",           icon: Activity },
    { type: "ghost",               name: "Ghost",                icon: Ghost },
    { type: "colorGrade",          name: "Color Grade",          icon: Palette },
    { type: "edgeFade",            name: "Edge Fade",            icon: Crop },
    { type: "glitch",              name: "Glitch",               icon: Zap },
  ];

  /** Popover content for a single scene effect's settings knobs */
  const renderSceneEffectSettings = (effect: SceneEffect): React.ReactNode => {
    if (!activeScene) return null;
    const sceneId = activeScene.id;

    const row = (
      label: string,
      value: number,
      min: number,
      max: number,
      step: number,
      display: (v: number) => string,
      onChange: (v: number) => void,
    ) => (
      <div className="flex items-center gap-2 min-w-0" key={label}>
        <span className="text-[9px] text-[#81838a] uppercase tracking-wider w-20 shrink-0">{label}</span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-[#6e6ef5] h-[3px] cursor-pointer"
        />
        <span className="text-[10px] font-mono text-[#c3c4c8] w-8 text-right shrink-0">{display(value)}</span>
      </div>
    );

    switch (effect.type) {
      case "depthOfField": {
        const dof = effect as DepthOfFieldEffect;
        return (
          <div className="flex flex-col gap-2 p-1">
            {row("Aperture", dof.aperture, 0.7, 22, 0.1,
              (v) => `f/${v.toFixed(1)}`,
              (v) => updateSceneEffect(sceneId, dof.id, { aperture: v }))}
            {row("Focus Range", dof.focusRange, 0, 1000, 20,
              (v) => `${Math.round(v)}px`,
              (v) => updateSceneEffect(sceneId, dof.id, { focusRange: v }))}
            {row("Bokeh Scale", dof.bokehScale, 0, 3, 0.1,
              (v) => `${v.toFixed(1)}x`,
              (v) => updateSceneEffect(sceneId, dof.id, { bokehScale: v }))}
          </div>
        );
      }
      case "bloom": {
        const b = effect as BloomEffect;
        return (
          <div className="flex flex-col gap-2 p-1">
            {row("Threshold", Math.round(b.threshold * 255), 50, 255, 5,
              (v) => String(Math.round(v)),
              (v) => updateSceneEffect(sceneId, b.id, { threshold: v / 255 }))}
            {row("Intensity", b.intensity, 0.1, 2.0, 0.05,
              (v) => `${Math.round(v * 100)}%`,
              (v) => updateSceneEffect(sceneId, b.id, { intensity: v }))}
          </div>
        );
      }
      case "vignette": {
        const v = effect as VignetteEffect;
        return (
          <div className="flex flex-col gap-2 p-1">
            {row("Intensity", v.intensity, 0.05, 1.0, 0.05,
              (val) => `${Math.round(val * 100)}%`,
              (val) => updateSceneEffect(sceneId, v.id, { intensity: val }))}
          </div>
        );
      }
      case "motionBlur": {
        const mb = effect as MotionBlurEffect;
        return (
          <div className="flex flex-col gap-2 p-1">
            {row("Shutter Angle", mb.shutterAngle, 0, 360, 10,
              (v) => `${v}°`,
              (v) => updateSceneEffect(sceneId, mb.id, { shutterAngle: v }))}
            {row("Samples", mb.samples, 1, 12, 1,
              (v) => String(Math.round(v)),
              (v) => updateSceneEffect(sceneId, mb.id, { samples: Math.round(v) }))}
            <p className="text-[8px] text-[#81838a] leading-tight px-1 mt-0.5">
              Samples capped at 12 for Canvas2D real-time performance (Raylight uses 32 via WebGL).
            </p>
          </div>
        );
      }
      case "chromaticAberration": {
        const c = effect as ChromaticAberrationEffect;
        return (
          <div className="flex flex-col gap-2 p-1">
            {row("Offset", c.offset, 1, 20, 1,
              (v) => `${v}px`,
              (v) => updateSceneEffect(sceneId, c.id, { offset: v }))}
          </div>
        );
      }
      case "filmGrain": {
        const g = effect as FilmGrainEffect;
        return (
          <div className="flex flex-col gap-2 p-1">
            {row("Intensity", g.intensity, 0.01, 0.4, 0.01,
              (v) => `${Math.round(v * 100)}%`,
              (v) => updateSceneEffect(sceneId, g.id, { intensity: v }))}
            {row("Size", g.size, 0.5, 3.0, 0.1,
              (v) => `${v.toFixed(1)}x`,
              (v) => updateSceneEffect(sceneId, g.id, { size: v }))}
          </div>
        );
      }
      case "ghost": {
        const gh = effect as GhostEffect;
        return (
          <div className="flex flex-col gap-2 p-1">
            {row("Opacity", gh.opacity, 0, 1, 0.05,
              (v) => `${Math.round(v * 100)}%`,
              (v) => updateSceneEffect(sceneId, gh.id, { opacity: v }))}
            {row("Offset", gh.offset, 0, 30, 1,
              (v) => `${v}px`,
              (v) => updateSceneEffect(sceneId, gh.id, { offset: v }))}
            {row("Blur", gh.blur, 0, 10, 0.5,
              (v) => `${v}px`,
              (v) => updateSceneEffect(sceneId, gh.id, { blur: v }))}
          </div>
        );
      }
      case "colorGrade": {
        const cg = effect as ColorGradeEffect;
        return (
          <div className="flex flex-col gap-2 p-1">
            {row("Exposure", cg.exposure, -2, 2, 0.05,
              (v) => `${v > 0 ? "+" : ""}${v.toFixed(2)} EV`,
              (v) => updateSceneEffect(sceneId, cg.id, { exposure: v }))}
            {row("Contrast", cg.contrast, 0, 2, 0.05,
              (v) => `${Math.round(v * 100)}%`,
              (v) => updateSceneEffect(sceneId, cg.id, { contrast: v }))}
            {row("Saturation", cg.saturation, 0, 2, 0.05,
              (v) => `${Math.round(v * 100)}%`,
              (v) => updateSceneEffect(sceneId, cg.id, { saturation: v }))}
          </div>
        );
      }
      case "edgeFade": {
        const ef = effect as EdgeFadeEffect;
        return (
          <div className="p-1">
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[8px] text-[#81838a]">
                  <span>Top</span>
                  <span className="font-mono text-[#c3c4c8]">{Math.round(ef.top * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={ef.top}
                  onChange={(e) => updateSceneEffect(sceneId, ef.id, { top: Number(e.target.value) })}
                  className="accent-[#6e6ef5] h-[3px] cursor-pointer w-full"
                />
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[8px] text-[#81838a]">
                  <span>Right</span>
                  <span className="font-mono text-[#c3c4c8]">{Math.round(ef.right * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={ef.right}
                  onChange={(e) => updateSceneEffect(sceneId, ef.id, { right: Number(e.target.value) })}
                  className="accent-[#6e6ef5] h-[3px] cursor-pointer w-full"
                />
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[8px] text-[#81838a]">
                  <span>Bottom</span>
                  <span className="font-mono text-[#c3c4c8]">{Math.round(ef.bottom * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={ef.bottom}
                  onChange={(e) => updateSceneEffect(sceneId, ef.id, { bottom: Number(e.target.value) })}
                  className="accent-[#6e6ef5] h-[3px] cursor-pointer w-full"
                />
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[8px] text-[#81838a]">
                  <span>Left</span>
                  <span className="font-mono text-[#c3c4c8]">{Math.round(ef.left * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={ef.left}
                  onChange={(e) => updateSceneEffect(sceneId, ef.id, { left: Number(e.target.value) })}
                  className="accent-[#6e6ef5] h-[3px] cursor-pointer w-full"
                />
              </div>
            </div>
          </div>
        );
      }
      case "glitch": {
        const gl = effect as GlitchEffect;
        return (
          <div className="flex flex-col gap-2 p-1">
            {row("Intensity", gl.intensity, 0, 1, 0.05,
              (v) => `${Math.round(v * 100)}%`,
              (v) => updateSceneEffect(sceneId, gl.id, { intensity: v }))}
            {row("Speed", gl.speed, 0.5, 3, 0.1,
              (v) => `${v.toFixed(1)}x`,
              (v) => updateSceneEffect(sceneId, gl.id, { speed: v }))}
          </div>
        );
      }
      default:
        return null;
    }
  };


  const camera = activeScene?.camera || { x: 0, y: 0, z: 0, fov: 60, focusDistance: 1000 };
  const cameraBlocks = (activeScene?.animationBlocks || []).filter(
    (b): b is PresetAnimationBlock => !isKeyframeTrack(b) && (b.preset === "camera-move" || b.layerId === null),
  );
  const selectedLayer =
    selectedLayerIds.length === 1
      ? activeScene?.layers.find((l) => l.id === selectedLayerIds[0])
      : null;

  const layerBlocks = selectedLayer
    ? (activeScene?.animationBlocks || []).filter(
        (b) => b.layerId === selectedLayer.id,
      )
    : [];

  const ratioValue =
    aspectRatio === "9:16"
      ? "Portrait 9:16"
      : aspectRatio === "1:1"
      ? "Square 1:1"
      : "Landscape 16:9";

  const handleRatioChange = (val: string) => {
    if (val.includes("9:16")) {
      setAspectRatio("9:16");
    } else if (val.includes("1:1")) {
      setAspectRatio("1:1");
    } else {
      setAspectRatio("16:9");
    }
  };

  const handleTransformChange = (
    key: keyof Layer["transform"],
    val: number,
  ) => {
    if (!selectedLayer) return;
    const finalVal = isNaN(val) ? 0 : val;
    const clamped =
      key === "width" || key === "height" ? Math.max(1, finalVal) : finalVal;

    // If updating a group's transform, redistribute to children proportionally
    if (selectedLayer.type === "group" && activeScene?.layers) {
      const childLayers = activeScene.layers.filter(
        (l) => l.parentId === selectedLayer.id,
      );

      if (childLayers.length > 0) {
        if (key === "rotation") {
          const deltaAngle = clamped - selectedLayer.transform.rotation;
          const centerX =
            selectedLayer.transform.x + selectedLayer.transform.width / 2;
          const centerY =
            selectedLayer.transform.y + selectedLayer.transform.height / 2;
          const rad = (deltaAngle * Math.PI) / 180;
          const cosRad = Math.cos(rad);
          const sinRad = Math.sin(rad);

          childLayers.forEach((child) => {
            const childCX = child.transform.x + child.transform.width / 2;
            const childCY = child.transform.y + child.transform.height / 2;
            const relX = childCX - centerX;
            const relY = childCY - centerY;
            const rotRelX = relX * cosRad - relY * sinRad;
            const rotRelY = relX * sinRad + relY * cosRad;

            updateLayer(child.id, {
              transform: {
                ...child.transform,
                x: Math.round(centerX + rotRelX - child.transform.width / 2),
                y: Math.round(centerY + rotRelY - child.transform.height / 2),
                rotation: Math.round((child.transform.rotation + deltaAngle) % 360),
              },
            });
          });
        } else if (key === "width") {
          const scaleRatio = clamped / Math.max(1, selectedLayer.transform.width);
          childLayers.forEach((child) => {
            const relX = child.transform.x - selectedLayer.transform.x;
            updateLayer(child.id, {
              transform: {
                ...child.transform,
                x: Math.round(selectedLayer.transform.x + relX * scaleRatio),
                width: Math.max(1, Math.round(child.transform.width * scaleRatio)),
              },
            });
          });
        } else if (key === "height") {
          const scaleRatio = clamped / Math.max(1, selectedLayer.transform.height);
          childLayers.forEach((child) => {
            const relY = child.transform.y - selectedLayer.transform.y;
            updateLayer(child.id, {
              transform: {
                ...child.transform,
                y: Math.round(selectedLayer.transform.y + relY * scaleRatio),
                height: Math.max(1, Math.round(child.transform.height * scaleRatio)),
              },
            });
          });
        } else if (key === "x") {
          const dx = clamped - selectedLayer.transform.x;
          childLayers.forEach((child) => {
            updateLayer(child.id, {
              transform: {
                ...child.transform,
                x: Math.round(child.transform.x + dx),
              },
            });
          });
        } else if (key === "y") {
          const dy = clamped - selectedLayer.transform.y;
          childLayers.forEach((child) => {
            updateLayer(child.id, {
              transform: {
                ...child.transform,
                y: Math.round(child.transform.y + dy),
              },
            });
          });
        }
      }
    }

    updateLayer(selectedLayer.id, {
      transform: {
        ...selectedLayer.transform,
        [key]: clamped,
      },
    });

    if (useEditorUIStore.getState().animateMode) {
      recordKeyframe(
        selectedLayer.id,
        key as AnimatableProperty,
        clamped,
        currentFrame,
        activeScene?.id,
      );
    }
  };

  const handleOpacityChange = (val: number) => {
    if (!selectedLayer) return;
    const clamped = Math.min(1, Math.max(0, val));
    updateLayer(selectedLayer.id, { opacity: clamped });

    if (useEditorUIStore.getState().animateMode) {
      recordKeyframe(selectedLayer.id, "opacity", clamped, currentFrame, activeScene?.id);
    }
  };

  // Scrub-to-adjust hooks for Layer Transform fields
  const scrubX = useScrubbableNumber({
    value: selectedLayer?.transform.x ?? 0,
    onChange: (val) => handleTransformChange("x", val),
    step: 1,
    disabled: !selectedLayer,
  });

  const scrubY = useScrubbableNumber({
    value: selectedLayer?.transform.y ?? 0,
    onChange: (val) => handleTransformChange("y", val),
    step: 1,
    disabled: !selectedLayer,
  });

  const scrubWidth = useScrubbableNumber({
    value: selectedLayer?.transform.width ?? 1,
    onChange: (val) => handleTransformChange("width", val),
    min: 1,
    step: 1,
    disabled: !selectedLayer,
  });

  const scrubHeight = useScrubbableNumber({
    value: selectedLayer?.transform.height ?? 1,
    onChange: (val) => handleTransformChange("height", val),
    min: 1,
    step: 1,
    disabled: !selectedLayer,
  });

  const scrubRotation = useScrubbableNumber({
    value: selectedLayer?.transform.rotation ?? 0,
    onChange: (val) => handleTransformChange("rotation", val),
    step: 1,
    disabled: !selectedLayer,
  });

  return (
    <aside className="right-panel flex flex-col h-full relative" aria-label="Project inspector">
      {/* Inspector Topbar */}
      <div className="inspector-topbar">
        <div className="avatar" data-testid="avatar-user" aria-label="User avatar">
          A
        </div>
        <div className="inspector-actions">
          <IconButton label="Inspector settings" testId="button-inspector-settings">
            <SlidersHorizontal size={12} strokeWidth={1.7} />
          </IconButton>
          <IconButton
            label="Export project"
            testId="button-export"
            onClick={() => setExportModalOpen(true)}
          >
            <Share2 size={12} strokeWidth={1.7} />
          </IconButton>
          <button
            className="share-button"
            type="button"
            data-testid="button-share"
            onClick={() => setExportModalOpen(true)}
          >
            Export
          </button>
        </div>
      </div>

      {/* Main Inspector Body */}
      <div className="inspector-body flex-1 overflow-y-auto pb-3">
        {selectedLayerIds.length === 0 ? (
          /* Project Settings View (Nothing Selected) */
          <div data-testid="project-settings-view">
            <Tabs defaultValue="design" className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-[#17181c] border border-[#26282e] p-0.5 rounded h-7 mb-3">
                <TabsTrigger
                  value="design"
                  className="text-[10px] py-1 data-[state=active]:bg-[#26292f] data-[state=active]:text-white text-[#8c8f96] rounded font-medium"
                  data-testid="tab-inspector-design"
                >
                  Design
                </TabsTrigger>
                <TabsTrigger
                  value="animate"
                  className="text-[10px] py-1 data-[state=active]:bg-[#26292f] data-[state=active]:text-white text-[#8c8f96] rounded font-medium"
                  data-testid="tab-inspector-animate"
                >
                  Animate
                </TabsTrigger>
              </TabsList>

              {/* DESIGN TAB: Project Settings & Camera 3D Controls */}
              <TabsContent value="design" className="mt-0 focus-visible:outline-none">
                <Accordion
                  type="multiple"
                  value={sceneAccordionSections}
                  onValueChange={handleSceneAccordionChange}
                  className="w-full space-y-0"
                >
                  {/* 1. Project Settings */}
                  <AccordionItem value="project-settings" className="border-b border-[#202227]">
                    <AccordionTrigger className="py-2.5 text-[11px] font-semibold tracking-wider text-[#999ba0] uppercase hover:text-[#d8d9dc] hover:no-underline">
                      Project Settings
                    </AccordionTrigger>
                    <AccordionContent className="pb-3 pt-0 text-left">
                      <label className="field">
                        <span className="field-label">Name</span>
                        <input
                          className="text-input"
                          value={projectName}
                          onChange={(event) => setProjectName(event.target.value)}
                          data-testid="input-project-name"
                        />
                      </label>

                      <label className="field">
                        <span className="field-label">Aspect Ratio</span>
                        <span className="select-wrap">
                          <select
                            className="select-input"
                            value={ratioValue}
                            onChange={(event) => handleRatioChange(event.target.value)}
                            data-testid="select-aspect-ratio"
                          >
                            <option>Landscape 16:9</option>
                            <option>Portrait 9:16</option>
                            <option>Square 1:1</option>
                          </select>
                        </span>
                      </label>

                      <label className="field mb-0">
                        <span className="field-label">Lens</span>
                        <input
                          className="text-input"
                          value={lens}
                          onChange={(event) => setLens(event.target.value)}
                          data-testid="input-lens"
                        />
                      </label>
                    </AccordionContent>
                  </AccordionItem>

                  {/* 2. Background */}
                  <AccordionItem value="background" className="border-b border-[#202227]">
                    <AccordionTrigger className="py-2.5 text-[11px] font-semibold tracking-wider text-[#999ba0] uppercase hover:text-[#d8d9dc] hover:no-underline">
                      Background
                    </AccordionTrigger>
                    <AccordionContent className="pb-3 pt-0 text-left">
                      <div className="field mb-0">
                        <Tabs
                          value={backgroundMode}
                          onValueChange={(val) => {
                            const mode = val as BackgroundMode;
                            setBackgroundMode(mode);
                          }}
                          className="w-full mb-2"
                        >
                          <TabsList className="grid grid-cols-3 bg-[#16181c] border border-[#26282e] p-0.5 rounded h-[22px] w-full">
                            {(["Color", "Image", "Shader"] as BackgroundMode[]).map(
                              (mode) => (
                                <TabsTrigger
                                  key={mode}
                                  value={mode}
                                  className="text-[8.5px] py-0 h-4.5 data-[state=active]:bg-[#25282f] data-[state=active]:text-white data-[state=active]:border-[#383c44] text-[#8d8f95] rounded font-medium border border-transparent transition-all"
                                  data-testid={`tab-background-${mode.toLowerCase()}`}
                                >
                                  {mode}
                                </TabsTrigger>
                              ),
                            )}
                          </TabsList>
                        </Tabs>

                        {backgroundMode === "Color" && (
                          <div className="mt-1.5 flex items-center justify-between">
                            <span className="field-label mb-0">Color</span>
                            <button
                              className="color-input hover:border-[#4b7991] transition-colors cursor-pointer"
                              type="button"
                              data-testid="button-background-color"
                              title="Choose background color"
                            >
                              <span className="color-swatch" />
                              <span>#000102</span>
                            </button>
                          </div>
                        )}

                        {backgroundMode === "Image" && (
                          <div className="mt-2 text-[9px] text-[#81838a] bg-[#16181c] border border-[#26282e] rounded p-2 text-center">
                            <span>Default Canvas Background</span>
                          </div>
                        )}

                        {backgroundMode === "Shader" && (
                          <div className="mt-2 text-[9px] text-[#81838a] bg-[#16181c] border border-[#26282e] rounded p-2 text-center">
                            <span>GLSL Shader</span>
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* 3. Camera */}
                  <AccordionItem value="camera" className="border-b border-[#202227]">
                    <AccordionTrigger className="py-2.5 text-[11px] font-semibold tracking-wider text-[#999ba0] uppercase hover:text-[#d8d9dc] hover:no-underline">
                      <div className="flex items-center gap-1.5">
                        <CameraIcon size={12} className="text-[#38bdf8]" />
                        <span>Camera</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-3 pt-0 text-left">
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className="text-[9px] text-[#81838a] hover:text-[#d8d9dc] cursor-pointer"
                          onClick={() => {
                            setIsCameraSelected(true);
                            setActiveTool("camera");
                          }}
                        >
                          Select Camera in 3D Viewport
                        </span>
                        <button
                          type="button"
                          className="text-[8.5px] text-[#81838a] hover:text-[#d8d9dc] flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded hover:bg-[#1f2127]"
                          onClick={() => {
                            setIsCameraSelected(true);
                            setActiveTool("camera");
                            updateCamera({ x: 0, y: 0, z: 0, fov: 60, focusDistance: 1000 });
                          }}
                          title="Reset camera coordinates"
                        >
                          <RotateCcw size={9} />
                          <span>Reset</span>
                        </button>
                      </div>

                      {/* Camera 3D Position */}
                      <div className="mb-2">
                        <span className="text-[8.5px] font-medium text-[#81838a] mb-1 block">Position (3D)</span>
                        <div className="grid grid-cols-3 gap-1.5">
                          <label className="flex items-center gap-1 bg-[#1a1b1e] border border-[#2a2c30] rounded px-1.5 h-6 focus-within:border-[#4b7991]" title="Camera Pos X">
                            <ScrubbableLabel
                              value={camera.x ?? 0}
                              onChange={(x) => updateCamera({ x })}
                              step={1}
                              className="text-[9px] font-mono text-[#6c6e75] hover:text-[#38bdf8] transition-colors select-none"
                              title="Drag horizontal to scrub Camera X (Shift: fast, Alt: precision)"
                            >
                              X
                            </ScrubbableLabel>
                            <input
                              type="number"
                              className="w-full bg-transparent text-[9px] text-[#d8d9dc] outline-none font-mono"
                              value={camera.x ?? 0}
                              data-testid="input-camera-x"
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                updateCamera({ x: isNaN(val) ? 0 : val });
                              }}
                            />
                          </label>

                          <label className="flex items-center gap-1 bg-[#1a1b1e] border border-[#2a2c30] rounded px-1.5 h-6 focus-within:border-[#4b7991]" title="Camera Pos Y">
                            <ScrubbableLabel
                              value={camera.y ?? 0}
                              onChange={(y) => updateCamera({ y })}
                              step={1}
                              className="text-[9px] font-mono text-[#6c6e75] hover:text-[#38bdf8] transition-colors select-none"
                              title="Drag horizontal to scrub Camera Y (Shift: fast, Alt: precision)"
                            >
                              Y
                            </ScrubbableLabel>
                            <input
                              type="number"
                              className="w-full bg-transparent text-[9px] text-[#d8d9dc] outline-none font-mono"
                              value={camera.y ?? 0}
                              data-testid="input-camera-y"
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                updateCamera({ y: isNaN(val) ? 0 : val });
                              }}
                            />
                          </label>

                          <label className="flex items-center gap-1 bg-[#1a1b1e] border border-[#2a2c30] rounded px-1.5 h-6 focus-within:border-[#4b7991]" title="Camera Pos Z (Depth)">
                            <ScrubbableLabel
                              value={camera.z ?? 0}
                              onChange={(z) => updateCamera({ z })}
                              step={1}
                              className="text-[9px] font-mono text-[#6c6e75] hover:text-[#38bdf8] transition-colors select-none"
                              title="Drag horizontal to scrub Camera Z (Shift: fast, Alt: precision)"
                            >
                              Z
                            </ScrubbableLabel>
                            <input
                              type="number"
                              className="w-full bg-transparent text-[9px] text-[#d8d9dc] outline-none font-mono"
                              value={camera.z ?? 0}
                              data-testid="input-camera-z"
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                updateCamera({ z: isNaN(val) ? 0 : val });
                              }}
                            />
                          </label>
                        </div>
                      </div>

                      {/* 6DOF Extrinsic Rotation (Pitch, Yaw, Roll) */}
                      <div className="mb-2">
                        <div className="text-[8.5px] font-medium text-[#81838a] mb-1 flex items-center gap-1">
                          <Compass size={10} className="text-[#38bdf8]" />
                          <span>Rotation (6DOF)</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          <label className="flex items-center gap-1 bg-[#1a1b1e] border border-[#2a2c30] rounded px-1.5 h-6 focus-within:border-[#4b7991]" title="Camera Pitch (Tilt X°)">
                            <ScrubbableLabel
                              value={Math.round(camera.pitch ?? 0)}
                              onChange={(pitch) => updateCamera({ pitch })}
                              step={1}
                              className="text-[8.5px] font-mono text-[#6c6e75] hover:text-[#38bdf8] transition-colors select-none"
                              title="Drag horizontal to scrub Pitch (Shift: fast, Alt: precision)"
                            >
                              Pitch
                            </ScrubbableLabel>
                            <input
                              type="number"
                              className="w-full bg-transparent text-[9px] text-[#d8d9dc] outline-none font-mono"
                              value={Math.round(camera.pitch ?? 0)}
                              data-testid="input-camera-pitch"
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                updateCamera({ pitch: isNaN(val) ? 0 : val });
                              }}
                            />
                          </label>

                          <label className="flex items-center gap-1 bg-[#1a1b1e] border border-[#2a2c30] rounded px-1.5 h-6 focus-within:border-[#4b7991]" title="Camera Yaw (Pan Y°)">
                            <ScrubbableLabel
                              value={Math.round(camera.yaw ?? 0)}
                              onChange={(yaw) => updateCamera({ yaw })}
                              step={1}
                              className="text-[8.5px] font-mono text-[#6c6e75] hover:text-[#38bdf8] transition-colors select-none"
                              title="Drag horizontal to scrub Yaw (Shift: fast, Alt: precision)"
                            >
                              Yaw
                            </ScrubbableLabel>
                            <input
                              type="number"
                              className="w-full bg-transparent text-[9px] text-[#d8d9dc] outline-none font-mono"
                              value={Math.round(camera.yaw ?? 0)}
                              data-testid="input-camera-yaw"
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                updateCamera({ yaw: isNaN(val) ? 0 : val });
                              }}
                            />
                          </label>

                          <label className="flex items-center gap-1 bg-[#1a1b1e] border border-[#2a2c30] rounded px-1.5 h-6 focus-within:border-[#4b7991]" title="Camera Roll (Dutch tilt Z°)">
                            <ScrubbableLabel
                              value={Math.round(camera.roll ?? 0)}
                              onChange={(roll) => updateCamera({ roll })}
                              step={1}
                              className="text-[8.5px] font-mono text-[#6c6e75] hover:text-[#38bdf8] transition-colors select-none"
                              title="Drag horizontal to scrub Roll (Shift: fast, Alt: precision)"
                            >
                              Roll
                            </ScrubbableLabel>
                            <input
                              type="number"
                              className="w-full bg-transparent text-[9px] text-[#d8d9dc] outline-none font-mono"
                              value={Math.round(camera.roll ?? 0)}
                              data-testid="input-camera-roll"
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                updateCamera({ roll: isNaN(val) ? 0 : val });
                              }}
                            />
                          </label>
                        </div>
                      </div>

                      {/* Lens & Aperture */}
                      <div>
                        <div className="text-[8.5px] font-medium text-[#81838a] mb-1 flex items-center gap-1">
                          <Eye size={10} className="text-[#38bdf8]" />
                          <span>Lens & Optical Depth</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          <label className="flex items-center gap-1 bg-[#1a1b1e] border border-[#2a2c30] rounded px-1.5 h-6 focus-within:border-[#4b7991]" title="Field of View (degrees)">
                            <ScrubbableLabel
                              value={camera.fov ?? 60}
                              onChange={(fov) => updateCamera({ fov })}
                              min={10}
                              max={160}
                              step={1}
                              className="text-[8.5px] font-mono text-[#6c6e75] hover:text-[#38bdf8] transition-colors select-none"
                              title="Drag horizontal to scrub FOV (Shift: fast, Alt: precision)"
                            >
                              FOV
                            </ScrubbableLabel>
                            <input
                              type="number"
                              className="w-full bg-transparent text-[9px] text-[#d8d9dc] outline-none font-mono"
                              min={10}
                              max={160}
                              value={camera.fov ?? 60}
                              data-testid="input-camera-fov"
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                updateCamera({ fov: isNaN(val) ? 60 : val });
                              }}
                            />
                          </label>

                          <label className="flex items-center gap-1 bg-[#1a1b1e] border border-[#2a2c30] rounded px-1.5 h-6 focus-within:border-[#4b7991] relative" title="Aperture f-stop">
                            <span className="text-[8px] font-mono text-[#6c6e75]">Apert</span>
                            <select
                              className="w-full bg-transparent text-[9px] text-[#d8d9dc] outline-none font-mono cursor-pointer appearance-none pr-3"
                              value={camera.aperture ?? 2.8}
                              onChange={(e) => updateCamera({ aperture: parseFloat(e.target.value) })}
                            >
                              <option value={1.4} className="bg-[#1a1b1e] text-[#d8d9dc]">f/1.4</option>
                              <option value={2.8} className="bg-[#1a1b1e] text-[#d8d9dc]">f/2.8</option>
                              <option value={4.0} className="bg-[#1a1b1e] text-[#d8d9dc]">f/4.0</option>
                              <option value={8.0} className="bg-[#1a1b1e] text-[#d8d9dc]">f/8.0</option>
                              <option value={16.0} className="bg-[#1a1b1e] text-[#d8d9dc]">f/16</option>
                            </select>
                            <span className="pointer-events-none absolute right-1 text-[8px] text-[#65686e]">⌄</span>
                          </label>

                          <label className="flex items-center gap-1 bg-[#1a1b1e] border border-[#2a2c30] rounded px-1.5 h-6 focus-within:border-[#4b7991]" title="Focus Distance (px)">
                            <ScrubbableLabel
                              value={Math.round(camera.focusDistance ?? 1000)}
                              onChange={(focusDistance) => updateCamera({ focusDistance })}
                              min={10}
                              step={10}
                              className="text-[8.5px] font-mono text-[#6c6e75] hover:text-[#38bdf8] transition-colors select-none"
                              title="Drag horizontal to scrub Focus Distance (Shift: fast, Alt: precision)"
                            >
                              Focus
                            </ScrubbableLabel>
                            <input
                              type="number"
                              className="w-full bg-transparent text-[9px] text-[#d8d9dc] outline-none font-mono"
                              value={Math.round(camera.focusDistance ?? 1000)}
                              data-testid="input-camera-focus-distance"
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                updateCamera({ focusDistance: isNaN(val) ? 1000 : val });
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* 4. Studio Lighting & Shadows */}
                  <AccordionItem value="lighting" className="border-b border-[#202227]">
                    <AccordionTrigger className="py-2.5 text-[11px] font-semibold tracking-wider text-[#999ba0] uppercase hover:text-[#d8d9dc] hover:no-underline">
                      <div className="flex items-center gap-1.5">
                        <Sun size={12} className="text-[#38bdf8]" />
                        <span>Studio Lighting & Shadows</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-3 pt-0 text-left">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] text-[#81838a]">Direct Illumination</span>
                        <Switch
                          checked={activeScene?.lighting?.enabled ?? true}
                          onCheckedChange={(checked) =>
                            updateSceneLighting({
                              enabled: checked,
                            })
                          }
                          data-testid="switch-lighting-enabled"
                          title={(activeScene?.lighting?.enabled ?? true) ? "Disable Direct Illumination" : "Enable Direct Illumination"}
                          className="h-3.5 w-6.5 data-[state=checked]:bg-[#0284c7] data-[state=unchecked]:bg-[#252830] [&>span]:h-2.5 [&>span]:w-2.5 [&>span]:data-[state=checked]:translate-x-3 [&>span]:data-[state=unchecked]:translate-x-0"
                        />
                      </div>

                      {(activeScene?.lighting?.enabled ?? true) && (
                        <div className="space-y-2.5 p-2 bg-[#16181c] border border-[#26282e] rounded shadow-xs">
                          <div>
                            <span className="text-[8.5px] font-medium text-[#81838a] mb-1.5 block">Light Source & Intensity</span>
                            <div className="grid grid-cols-3 gap-1.5">
                              <label className="flex items-center gap-1 bg-[#1a1b1e] border border-[#2a2c30] rounded px-1.5 h-6 focus-within:border-[#4b7991] focus-within:ring-1 focus-within:ring-[#244c60] transition-colors" title="Light Position X">
                                <ScrubbableLabel
                                  value={activeScene?.lighting?.lightX ?? -300}
                                  onChange={(lightX) => updateSceneLighting({ lightX })}
                                  step={5}
                                  className="text-[9px] font-mono text-[#6c6e75] hover:text-[#38bdf8] transition-colors select-none"
                                  title="Drag horizontal to scrub Light X (Shift: fast, Alt: precision)"
                                >
                                  X
                                </ScrubbableLabel>
                                <input
                                  type="number"
                                  className="w-full bg-transparent text-[9px] text-[#d8d9dc] outline-none font-mono"
                                  value={activeScene?.lighting?.lightX ?? -300}
                                  onChange={(e) =>
                                    updateSceneLighting({ lightX: parseFloat(e.target.value) || 0 })
                                  }
                                />
                              </label>
                              <label className="flex items-center gap-1 bg-[#1a1b1e] border border-[#2a2c30] rounded px-1.5 h-6 focus-within:border-[#4b7991] focus-within:ring-1 focus-within:ring-[#244c60] transition-colors" title="Light Position Y">
                                <ScrubbableLabel
                                  value={activeScene?.lighting?.lightY ?? -450}
                                  onChange={(lightY) => updateSceneLighting({ lightY })}
                                  step={5}
                                  className="text-[9px] font-mono text-[#6c6e75] hover:text-[#38bdf8] transition-colors select-none"
                                  title="Drag horizontal to scrub Light Y (Shift: fast, Alt: precision)"
                                >
                                  Y
                                </ScrubbableLabel>
                                <input
                                  type="number"
                                  className="w-full bg-transparent text-[9px] text-[#d8d9dc] outline-none font-mono"
                                  value={activeScene?.lighting?.lightY ?? -450}
                                  onChange={(e) =>
                                    updateSceneLighting({ lightY: parseFloat(e.target.value) || 0 })
                                  }
                                />
                              </label>
                              <label className="flex items-center gap-1 bg-[#1a1b1e] border border-[#2a2c30] rounded px-1.5 h-6 focus-within:border-[#4b7991] focus-within:ring-1 focus-within:ring-[#244c60] transition-colors" title="Light Intensity (0.0 - 2.0)">
                                <ScrubbableLabel
                                  value={activeScene?.lighting?.intensity ?? 0.85}
                                  onChange={(intensity) => updateSceneLighting({ intensity })}
                                  min={0}
                                  max={2}
                                  step={0.05}
                                  className="text-[9px] font-mono text-[#6c6e75] hover:text-[#38bdf8] transition-colors select-none"
                                  title="Drag horizontal to scrub Light Intensity (Shift: fast, Alt: precision)"
                                >
                                  Int
                                </ScrubbableLabel>
                                <input
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  max="2"
                                  className="w-full bg-transparent text-[9px] text-[#d8d9dc] outline-none font-mono"
                                  value={activeScene?.lighting?.intensity ?? 0.85}
                                  onChange={(e) =>
                                    updateSceneLighting({ intensity: parseFloat(e.target.value) || 0.85 })
                                  }
                                />
                              </label>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#202227]">
                            <div>
                              <div className="flex items-center justify-between text-[8.5px] text-[#81838a] mb-1">
                                <span className="text-[#999ba0]">Contact Shadow</span>
                                <ScrubbableReadout
                                  value={activeScene?.lighting?.shadowOpacity ?? 0.35}
                                  onChange={(val) => updateSceneLighting({ shadowOpacity: val })}
                                  min={0}
                                  max={1}
                                  step={0.05}
                                  className="font-mono text-[9px] text-[#d8d9dc] font-semibold cursor-ew-resize"
                                  formatValue={(val) => `${Math.round(val * 100)}%`}
                                  title="Drag to scrub contact shadow (Shift: fast, Alt: precision)"
                                />
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                className="inspector-slider w-full"
                                value={activeScene?.lighting?.shadowOpacity ?? 0.35}
                                onChange={(e) =>
                                  updateSceneLighting({ shadowOpacity: parseFloat(e.target.value) })
                                }
                              />
                            </div>
                            <div>
                              <div className="flex items-center justify-between text-[8.5px] text-[#81838a] mb-1">
                                <span className="text-[#999ba0]">Shadow Blur</span>
                                <ScrubbableReadout
                                  value={activeScene?.lighting?.shadowBlur ?? 24}
                                  onChange={(val) => updateSceneLighting({ shadowBlur: val })}
                                  min={0}
                                  max={60}
                                  step={2}
                                  className="font-mono text-[9px] text-[#d8d9dc] font-semibold cursor-ew-resize"
                                  formatValue={(val) => `${val}px`}
                                  title="Drag to scrub shadow blur (Shift: fast, Alt: precision)"
                                />
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="60"
                                step="2"
                                className="inspector-slider w-full"
                                value={activeScene?.lighting?.shadowBlur ?? 24}
                                onChange={(e) =>
                                  updateSceneLighting({ shadowBlur: parseInt(e.target.value, 10) })
                                }
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>

                  {/* 5. Scene Effects */}
                  <AccordionItem value="effects" className="border-b-0">
                    <AccordionTrigger className="py-2.5 text-[11px] font-semibold tracking-wider text-[#999ba0] uppercase hover:text-[#d8d9dc] hover:no-underline">
                      <div className="flex items-center gap-1.5">
                        <Sparkles size={12} className="text-[#38bdf8]" />
                        <span>Scene Effects</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-3 pt-0 text-left">
                      <div className="max-h-[360px] overflow-y-auto pr-1">
                        <EffectStackPanel
                          effects={activeScene?.effects ?? []}
                          effectsOrder={activeScene?.effectsOrder}
                          availableTypes={SCENE_EFFECT_TYPES}
                          onAddEffect={(type) => activeScene && addSceneEffect(activeScene.id, type)}
                          onRemoveEffect={(id) => activeScene && removeSceneEffect(activeScene.id, id)}
                          onToggleVisible={(id) => activeScene && toggleSceneEffectVisible(activeScene.id, id)}
                          onReorder={(newOrder) => activeScene && reorderSceneEffects(activeScene.id, newOrder)}
                          renderSettings={(effect) => renderSceneEffectSettings(effect as SceneEffect)}
                          emptyStateText="No effects — click + to add one"
                          testIdPrefix="scene-effect"
                        />
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </TabsContent>

              {/* ANIMATE TAB: Camera Move Blocks */}
              <TabsContent value="animate" className="mt-0 focus-visible:outline-none">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#202227]">
                  <div className="flex items-center gap-1.5">
                    <CameraIcon size={12} className="text-[#34d399]" />
                    <span className="section-label mb-0">
                      Camera Moves ({cameraBlocks.length})
                    </span>
                  </div>

                  <button
                    type="button"
                    data-testid="button-add-camera-block"
                    className="py-1 px-2 text-[9px] font-medium bg-[#064e3b] hover:bg-[#047857] text-[#6ee7b7] rounded border border-[#10b981]/40 inline-flex items-center gap-1 shadow-sm transition-colors"
                    onClick={() => {
                      const start = Math.min(
                        (activeScene?.durationFrames || 180) - 10,
                        currentFrame,
                      );
                      const end = Math.min(
                        activeScene?.durationFrames || 180,
                        start + 45,
                      );
                      addAnimationBlock(activeSceneId, {
                        layerId: null,
                        preset: "camera-move",
                        startFrame: start,
                        endFrame: end,
                        easing: "ease-in-out",
                        cameraTo: { x: 200, y: 0, z: 300, fov: 0 },
                      });
                    }}
                  >
                    <Plus size={10} strokeWidth={2} />
                    <span>Add Camera Move</span>
                  </button>
                </div>

                {cameraBlocks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 text-center px-2">
                    <div className="w-8 h-8 rounded-full bg-[#181a1e] border border-[#25282f] flex items-center justify-center text-[#6e7178] mb-2 shadow-sm">
                      <CameraIcon size={14} strokeWidth={1.8} className="text-[#34d399]" />
                    </div>
                    <p className="text-[10px] text-[#9ca0a8] mb-1 font-semibold">
                      No Camera Movements
                    </p>
                    <p className="text-[8.5px] text-[#63666d] max-w-[220px] leading-relaxed mb-3">
                      Add camera moves to animate camera position and FOV with multiplane 3D parallax effects.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {cameraBlocks.map((block) => (
                      <div
                        key={block.id}
                        className="bg-[#15171b] border border-[#23262c] rounded p-2.5 flex flex-col gap-2.5 shadow-sm"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded bg-[#064e3b]/50 text-[#6ee7b7] border border-[#10b981]/40 font-mono text-[8.5px] font-medium">
                              Camera Move
                            </span>
                          </div>
                          <button
                            type="button"
                            className="text-[#64748b] hover:text-[#f87171] p-1 rounded hover:bg-[#202227] transition-colors"
                            title="Remove camera block"
                            onClick={() => removeAnimationBlock(block.id)}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>

                        {/* Timing Range: Start & End Frames */}
                        <div className="grid grid-cols-2 gap-2">
                          <label className="field mb-0">
                            <ScrubbableLabel
                              value={block.startFrame}
                              onChange={(startFrame) =>
                                updateAnimationBlock(block.id, {
                                  startFrame: Math.max(0, Math.min(block.endFrame - 1, Math.round(startFrame))),
                                })
                              }
                              min={0}
                              max={activeScene?.durationFrames || 180}
                              step={1}
                              className="field-label text-[8.5px] hover:text-[#38bdf8] transition-colors select-none"
                              title="Drag horizontal to scrub Start Frame (Shift: fast, Alt: precision)"
                            >
                              Start Frame
                            </ScrubbableLabel>
                            <input
                              type="number"
                              className="text-input font-mono text-[9px]"
                              min={0}
                              max={activeScene?.durationFrames || 180}
                              value={block.startFrame}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val)) {
                                  updateAnimationBlock(block.id, {
                                    startFrame: val,
                                  });
                                }
                              }}
                            />
                          </label>

                          <label className="field mb-0">
                            <ScrubbableLabel
                              value={block.endFrame}
                              onChange={(endFrame) =>
                                updateAnimationBlock(block.id, {
                                  endFrame: Math.max(block.startFrame + 1, Math.min(activeScene?.durationFrames || 180, Math.round(endFrame))),
                                })
                              }
                              min={block.startFrame + 1}
                              max={activeScene?.durationFrames || 180}
                              step={1}
                              className="field-label text-[8.5px] hover:text-[#38bdf8] transition-colors select-none"
                              title="Drag horizontal to scrub End Frame (Shift: fast, Alt: precision)"
                            >
                              End Frame
                            </ScrubbableLabel>
                            <input
                              type="number"
                              className="text-input font-mono text-[9px]"
                              min={block.startFrame + 1}
                              max={activeScene?.durationFrames || 180}
                              value={block.endFrame}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val)) {
                                  updateAnimationBlock(block.id, {
                                    endFrame: val,
                                  });
                                }
                              }}
                            />
                          </label>
                        </div>

                        {/* Camera Delta Targets (cameraTo) */}
                        <div className="border-t border-[#23262c] pt-2">
                          <span className="field-label text-[8.5px] text-[#93c5fd] mb-1.5 block">
                            Target Deltas (Motion Shift)
                          </span>
                          <div className="grid grid-cols-2 gap-2 mb-2">
                            <label className="field mb-0">
                              <ScrubbableLabel
                                value={block.cameraTo?.x ?? 0}
                                onChange={(x) =>
                                  updateAnimationBlock(block.id, {
                                    cameraTo: {
                                      ...block.cameraTo,
                                      x: Math.round(x),
                                    },
                                  })
                                }
                                step={1}
                                className="field-label text-[8px] hover:text-[#38bdf8] transition-colors select-none"
                                title="Drag horizontal to scrub Delta X (Shift: fast, Alt: precision)"
                              >
                                Delta X (px)
                              </ScrubbableLabel>
                              <input
                                type="number"
                                className="text-input font-mono text-[9px]"
                                value={block.cameraTo?.x ?? 0}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  updateAnimationBlock(block.id, {
                                    cameraTo: {
                                      ...block.cameraTo,
                                      x: isNaN(val) ? 0 : val,
                                    },
                                  });
                                }}
                              />
                            </label>
                            <label className="field mb-0">
                              <ScrubbableLabel
                                value={block.cameraTo?.y ?? 0}
                                onChange={(y) =>
                                  updateAnimationBlock(block.id, {
                                    cameraTo: {
                                      ...block.cameraTo,
                                      y: Math.round(y),
                                    },
                                  })
                                }
                                step={1}
                                className="field-label text-[8px] hover:text-[#38bdf8] transition-colors select-none"
                                title="Drag horizontal to scrub Delta Y (Shift: fast, Alt: precision)"
                              >
                                Delta Y (px)
                              </ScrubbableLabel>
                              <input
                                type="number"
                                className="text-input font-mono text-[9px]"
                                value={block.cameraTo?.y ?? 0}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  updateAnimationBlock(block.id, {
                                    cameraTo: {
                                      ...block.cameraTo,
                                      y: isNaN(val) ? 0 : val,
                                    },
                                  });
                                }}
                              />
                            </label>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="field mb-0">
                              <ScrubbableLabel
                                value={block.cameraTo?.z ?? 0}
                                onChange={(z) =>
                                  updateAnimationBlock(block.id, {
                                    cameraTo: {
                                      ...block.cameraTo,
                                      z: Math.round(z),
                                    },
                                  })
                                }
                                step={1}
                                className="field-label text-[8px] hover:text-[#38bdf8] transition-colors select-none"
                                title="Drag horizontal to scrub Delta Z (Shift: fast, Alt: precision)"
                              >
                                Delta Z (Depth)
                              </ScrubbableLabel>
                              <input
                                type="number"
                                className="text-input font-mono text-[9px]"
                                value={block.cameraTo?.z ?? 0}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  updateAnimationBlock(block.id, {
                                    cameraTo: {
                                      ...block.cameraTo,
                                      z: isNaN(val) ? 0 : val,
                                    },
                                  });
                                }}
                              />
                            </label>
                            <label className="field mb-0">
                              <ScrubbableLabel
                                value={block.cameraTo?.fov ?? 0}
                                onChange={(fov) =>
                                  updateAnimationBlock(block.id, {
                                    cameraTo: {
                                      ...block.cameraTo,
                                      fov: Math.round(fov),
                                    },
                                  })
                                }
                                step={1}
                                className="field-label text-[8px] hover:text-[#38bdf8] transition-colors select-none"
                                title="Drag horizontal to scrub Delta FOV (Shift: fast, Alt: precision)"
                              >
                                Delta FOV (deg)
                              </ScrubbableLabel>
                              <input
                                type="number"
                                className="text-input font-mono text-[9px]"
                                value={block.cameraTo?.fov ?? 0}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  updateAnimationBlock(block.id, {
                                    cameraTo: {
                                      ...block.cameraTo,
                                      fov: isNaN(val) ? 0 : val,
                                    },
                                  });
                                }}
                              />
                            </label>
                          </div>
                        </div>

                        {/* Easing Picker */}
                        <div className="border-t border-[#23262c] pt-2">
                          <label className="field mb-0">
                            <span className="field-label text-[8.5px]">Easing</span>
                            <span className="select-wrap">
                              <select
                                className="select-input text-[9px]"
                                value={block.easing}
                                onChange={(e) => {
                                  updateAnimationBlock(block.id, {
                                    easing: e.target.value as any,
                                  });
                                }}
                              >
                                <option value="ease-in-out">Ease In-Out</option>
                                <option value="linear">Linear</option>
                                <option value="spring">Spring (Elastic)</option>
                                <option value="custom">Custom Cubic Bezier</option>
                              </select>
                            </span>
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        ) : selectedLayerIds.length === 1 && selectedLayer ? (
          /* Single Layer Inspector with Design & Animate Tabs */
          <div data-testid="layer-inspector-view">
            <Tabs defaultValue="design" className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-[#17181c] border border-[#26282e] p-0.5 rounded h-7 mb-3">
                <TabsTrigger
                  value="design"
                  className="text-[10px] py-1 data-[state=active]:bg-[#26292f] data-[state=active]:text-white text-[#8c8f96] rounded font-medium"
                  data-testid="tab-inspector-design"
                >
                  Design
                </TabsTrigger>
                <TabsTrigger
                  value="animate"
                  className="text-[10px] py-1 data-[state=active]:bg-[#26292f] data-[state=active]:text-white text-[#8c8f96] rounded font-medium"
                  data-testid="tab-inspector-animate"
                >
                  Animate
                </TabsTrigger>
              </TabsList>

              {/* DESIGN TAB */}
              <TabsContent value="design" className="mt-0 focus-visible:outline-none">
                {/* Layer Header */}
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#202227]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="p-1 rounded bg-[#1e2025] text-[#8e9198]">
                      {selectedLayer.type === "shape" ? (
                        <Square size={11} />
                      ) : selectedLayer.type === "text" ? (
                        <Type size={11} />
                      ) : selectedLayer.type === "image" ? (
                        <ImageIcon size={11} />
                      ) : (
                        <Layers size={11} />
                      )}
                    </span>
                    <input
                      className="text-[10px] font-semibold text-[#e2e4e8] bg-transparent border-0 hover:bg-[#1a1b1f] focus:bg-[#151619] focus:ring-1 focus:ring-[#38bdf8] rounded px-1 py-0.5 min-w-0 outline-none"
                      value={selectedLayer.name}
                      onChange={(e) =>
                        updateLayer(selectedLayer.id, { name: e.target.value })
                      }
                      data-testid="input-layer-name"
                      title="Edit layer name"
                    />
                  </div>
                  <span className="text-[8.5px] uppercase font-mono tracking-wider text-[#6d7077] bg-[#1a1c20] px-1.5 py-0.5 rounded border border-[#27292f]">
                    {selectedLayer.type}
                  </span>
                </div>

                {/* Collapsible Layer Inspector Sections */}
                <Accordion
                  type="multiple"
                  value={layerAccordionSections}
                  onValueChange={handleLayerAccordionChange}
                  className="w-full space-y-0"
                >
                  {/* 1. Transform Section (All Types) */}
                  <AccordionItem value="transform" className="border-b border-[#202227]">
                    <AccordionTrigger className="py-2.5 text-[11px] font-semibold tracking-wider text-[#999ba0] uppercase hover:text-[#d8d9dc] hover:no-underline">
                      <div className="flex items-center gap-1.5">
                        <Box size={12} className="text-[#38bdf8]" />
                        <span>Transform</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-3 pt-0 text-left">
                      {/* Alignment & Flip Toolbar */}
                      <div className="flex items-center justify-between gap-1 mb-2.5 pb-2 border-b border-[#202227]">
                        <div className="flex items-center gap-0.5 bg-[#141518] p-0.5 rounded border border-[#23252a]">
                          <button
                            type="button"
                            onClick={() => alignLeft()}
                            className="p-1 rounded text-[#999ba0] hover:text-[#e4e4e7] hover:bg-[#202227] transition-colors"
                            title="Align Left (⌥A)"
                            data-testid="btn-align-left"
                          >
                            <AlignStartHorizontal size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => alignCenterHorizontal()}
                            className="p-1 rounded text-[#999ba0] hover:text-[#e4e4e7] hover:bg-[#202227] transition-colors"
                            title="Align Center Horizontal (⌥H)"
                            data-testid="btn-align-center-h"
                          >
                            <AlignCenterHorizontal size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => alignRight()}
                            className="p-1 rounded text-[#999ba0] hover:text-[#e4e4e7] hover:bg-[#202227] transition-colors"
                            title="Align Right (⌥D)"
                            data-testid="btn-align-right"
                          >
                            <AlignEndHorizontal size={13} />
                          </button>
                          <div className="w-[1px] h-3 bg-[#2a2c30] mx-0.5" />
                          <button
                            type="button"
                            onClick={() => alignTop()}
                            className="p-1 rounded text-[#999ba0] hover:text-[#e4e4e7] hover:bg-[#202227] transition-colors"
                            title="Align Top (⌥W)"
                            data-testid="btn-align-top"
                          >
                            <AlignStartVertical size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => alignCenterVertical()}
                            className="p-1 rounded text-[#999ba0] hover:text-[#e4e4e7] hover:bg-[#202227] transition-colors"
                            title="Align Center Vertical (⌥V)"
                            data-testid="btn-align-center-v"
                          >
                            <AlignCenterVertical size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => alignBottom()}
                            className="p-1 rounded text-[#999ba0] hover:text-[#e4e4e7] hover:bg-[#202227] transition-colors"
                            title="Align Bottom (⌥S)"
                            data-testid="btn-align-bottom"
                          >
                            <AlignEndVertical size={13} />
                          </button>
                        </div>

                        <div className="flex items-center gap-0.5 bg-[#141518] p-0.5 rounded border border-[#23252a]">
                          <button
                            type="button"
                            onClick={() => flipHorizontal()}
                            className={`p-1 rounded transition-colors ${selectedLayer.transform.flipX ? "text-[#38bdf8] bg-[#38bdf8]/15" : "text-[#999ba0] hover:text-[#e4e4e7] hover:bg-[#202227]"}`}
                            title="Flip Horizontal (⇧H)"
                            data-testid="btn-flip-horizontal"
                          >
                            <FlipHorizontal size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => flipVertical()}
                            className={`p-1 rounded transition-colors ${selectedLayer.transform.flipY ? "text-[#38bdf8] bg-[#38bdf8]/15" : "text-[#999ba0] hover:text-[#e4e4e7] hover:bg-[#202227]"}`}
                            title="Flip Vertical (⇧V)"
                            data-testid="btn-flip-vertical"
                          >
                            <FlipVertical size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Position (X, Y) */}
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <div className="flex items-center gap-1 bg-[#1a1b1e] border border-[#2a2c30] rounded px-1.5 h-6 focus-within:border-[#4b7991]">
                          <span
                            {...scrubX.scrubProps}
                            className="text-[9px] font-mono text-[#6c6e75] hover:text-[#38bdf8] transition-colors select-none"
                            title="Drag horizontal to scrub X (Shift: fast, Alt: precision)"
                          >
                            X
                          </span>
                          <input
                            type="number"
                            className="w-full bg-transparent text-[9.5px] text-[#d8d9dc] outline-none font-mono"
                            value={Math.round(selectedLayer.transform.x)}
                            onChange={(e) =>
                              handleTransformChange("x", parseFloat(e.target.value))
                            }
                            data-testid="input-transform-x"
                          />
                        </div>
                        <div className="flex items-center gap-1 bg-[#1a1b1e] border border-[#2a2c30] rounded px-1.5 h-6 focus-within:border-[#4b7991]">
                          <span
                            {...scrubY.scrubProps}
                            className="text-[9px] font-mono text-[#6c6e75] hover:text-[#38bdf8] transition-colors select-none"
                            title="Drag horizontal to scrub Y (Shift: fast, Alt: precision)"
                          >
                            Y
                          </span>
                          <input
                            type="number"
                            className="w-full bg-transparent text-[9.5px] text-[#d8d9dc] outline-none font-mono"
                            value={Math.round(selectedLayer.transform.y)}
                            onChange={(e) =>
                              handleTransformChange("y", parseFloat(e.target.value))
                            }
                            data-testid="input-transform-y"
                          />
                        </div>
                      </div>

                      {/* Dimensions (W, H) */}
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <div className="flex items-center gap-1 bg-[#1a1b1e] border border-[#2a2c30] rounded px-1.5 h-6 focus-within:border-[#4b7991]">
                          <span
                            {...scrubWidth.scrubProps}
                            className="text-[9px] font-mono text-[#6c6e75] hover:text-[#38bdf8] transition-colors select-none"
                            title="Drag horizontal to scrub Width (Shift: fast, Alt: precision)"
                          >
                            W
                          </span>
                          <input
                            type="number"
                            min="1"
                            className="w-full bg-transparent text-[9.5px] text-[#d8d9dc] outline-none font-mono"
                            value={Math.round(selectedLayer.transform.width)}
                            onChange={(e) =>
                              handleTransformChange("width", Math.max(1, parseFloat(e.target.value)))
                            }
                            data-testid="input-transform-w"
                          />
                        </div>
                        <div className="flex items-center gap-1 bg-[#1a1b1e] border border-[#2a2c30] rounded px-1.5 h-6 focus-within:border-[#4b7991]">
                          <span
                            {...scrubHeight.scrubProps}
                            className="text-[9px] font-mono text-[#6c6e75] hover:text-[#38bdf8] transition-colors select-none"
                            title="Drag horizontal to scrub Height (Shift: fast, Alt: precision)"
                          >
                            H
                          </span>
                          <input
                            type="number"
                            min="1"
                            className="w-full bg-transparent text-[9.5px] text-[#d8d9dc] outline-none font-mono"
                            value={Math.round(selectedLayer.transform.height)}
                            onChange={(e) =>
                              handleTransformChange("height", Math.max(1, parseFloat(e.target.value)))
                            }
                            data-testid="input-transform-h"
                          />
                        </div>
                      </div>

                      {/* Rotation & Depth */}
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <div className="flex items-center gap-1 bg-[#1a1b1e] border border-[#2a2c30] rounded px-1.5 h-6 focus-within:border-[#4b7991]">
                          <span
                            {...scrubRotation.scrubProps}
                            className="text-[9px] font-mono text-[#6c6e75] hover:text-[#38bdf8] transition-colors select-none"
                            title="Drag horizontal to scrub Rotation (Shift: fast, Alt: precision)"
                          >
                            R°
                          </span>
                          <input
                            type="number"
                            className="w-full bg-transparent text-[9.5px] text-[#d8d9dc] outline-none font-mono"
                            value={Math.round(selectedLayer.transform.rotation || 0)}
                            onChange={(e) =>
                              handleTransformChange("rotation", parseFloat(e.target.value))
                            }
                            data-testid="input-transform-rotation"
                          />
                        </div>
                        <label
                          className="flex items-center gap-1 bg-[#1a1b1e] border border-[#2a2c30] rounded px-1.5 h-6"
                          title="Z-Depth (Camera space layer plane)"
                        >
                          <ScrubbableLabel
                            value={selectedLayer.transform.depth || 0}
                            onChange={(depth) => handleTransformChange("depth", depth)}
                            step={1}
                            className="text-[9px] font-mono text-[#6c6e75] hover:text-[#38bdf8] transition-colors select-none"
                            title="Drag horizontal to scrub Z-Depth (Shift: fast, Alt: precision)"
                          >
                            Z
                          </ScrubbableLabel>
                          <input
                            type="number"
                            className="w-full bg-transparent text-[9.5px] text-[#d8d9dc] outline-none font-mono"
                            value={selectedLayer.transform.depth || 0}
                            onChange={(e) =>
                              handleTransformChange("depth", parseFloat(e.target.value))
                            }
                            data-testid="input-transform-depth"
                          />
                        </label>
                      </div>

                      {/* 3D Tilt (X) & Swivel (Y) */}
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <label
                          className="flex items-center gap-1 bg-[#1a1b1e] border border-[#2a2c30] rounded px-1.5 h-6"
                          title="3D Tilt (Pitch X-axis rotation)"
                        >
                          <ScrubbableLabel
                            value={Math.round(selectedLayer.transform.rotateX || 0)}
                            onChange={(rotateX) => handleTransformChange("rotateX", rotateX)}
                            step={1}
                            className="text-[9px] font-mono text-[#38bdf8] hover:text-[#7dd3fc] transition-colors select-none"
                            title="Drag horizontal to scrub Tilt X (Shift: fast, Alt: precision)"
                          >
                            Tilt X°
                          </ScrubbableLabel>
                          <input
                            type="number"
                            className="w-full bg-transparent text-[9.5px] text-[#d8d9dc] outline-none font-mono"
                            value={Math.round(selectedLayer.transform.rotateX || 0)}
                            onChange={(e) =>
                              handleTransformChange("rotateX", parseFloat(e.target.value))
                            }
                            data-testid="input-transform-rotate-x"
                          />
                        </label>
                        <label
                          className="flex items-center gap-1 bg-[#1a1b1e] border border-[#2a2c30] rounded px-1.5 h-6"
                          title="3D Swivel (Yaw Y-axis rotation)"
                        >
                          <ScrubbableLabel
                            value={Math.round(selectedLayer.transform.rotateY || 0)}
                            onChange={(rotateY) => handleTransformChange("rotateY", rotateY)}
                            step={1}
                            className="text-[9px] font-mono text-[#38bdf8] hover:text-[#7dd3fc] transition-colors select-none"
                            title="Drag horizontal to scrub Swivel Y (Shift: fast, Alt: precision)"
                          >
                            Swivel Y°
                          </ScrubbableLabel>
                          <input
                            type="number"
                            className="w-full bg-transparent text-[9.5px] text-[#d8d9dc] outline-none font-mono"
                            value={Math.round(selectedLayer.transform.rotateY || 0)}
                            onChange={(e) =>
                              handleTransformChange("rotateY", parseFloat(e.target.value))
                            }
                            data-testid="input-transform-rotate-y"
                          />
                        </label>
                      </div>

                      {/* Device Mockup Frame */}
                      <div className="mb-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] text-[#999ba0] flex items-center gap-1">
                            <Smartphone size={10} className="text-[#38bdf8]" />
                            <span>3D Device Frame</span>
                          </span>
                        </div>
                        <span className="select-wrap">
                          <select
                            className="select-input text-[9px]"
                            value={selectedLayer.mockup || "none"}
                            onChange={(e) =>
                              updateLayer(selectedLayer.id, {
                                mockup: e.target.value === "none" ? undefined : (e.target.value as any),
                              })
                            }
                          >
                            <option value="none">None (Raw Layer)</option>
                            <option value="iphone">iPhone 16 Pro (Titanium + Island)</option>
                            <option value="macbook">MacBook Pro (Aluminum + Notch)</option>
                            <option value="browser">Safari Browser (Dark Header)</option>
                          </select>
                        </span>
                      </div>

                      {/* Opacity Slider */}
                      <div className="mt-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] text-[#999ba0]">Opacity</span>
                          <ScrubbableReadout
                            value={selectedLayer.opacity ?? 1}
                            onChange={handleOpacityChange}
                            min={0}
                            max={1}
                            step={0.01}
                            className="text-[9px] font-mono text-[#c5c7cc] font-semibold cursor-ew-resize"
                            formatValue={(val) => `${Math.round(val * 100)}%`}
                            title="Drag to scrub opacity (Shift: fast, Alt: precision)"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            className="inspector-slider w-full"
                            value={selectedLayer.opacity ?? 1}
                            onChange={(e) =>
                              handleOpacityChange(parseFloat(e.target.value))
                            }
                            data-testid="input-opacity-slider"
                          />
                          <input
                            type="number"
                            min="0"
                            max="100"
                            className="w-10 bg-[#1a1b1e] border border-[#2a2c30] rounded text-[9px] text-center text-[#d8d9dc] h-5 outline-none font-mono"
                            value={Math.round((selectedLayer.opacity ?? 1) * 100)}
                            onChange={(e) =>
                              handleOpacityChange(parseFloat(e.target.value) / 100)
                            }
                            data-testid="input-opacity"
                          />
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* 2. Shape Appearance (Shape Layers) */}
                  {selectedLayer.type === "shape" && (
                    <AccordionItem value="appearance" className="border-b border-[#202227]" data-testid="section-shape-props">
                      <AccordionTrigger className="py-2.5 text-[11px] font-semibold tracking-wider text-[#999ba0] uppercase hover:text-[#d8d9dc] hover:no-underline">
                        <div className="flex items-center gap-1.5">
                          <Square size={12} className="text-[#38bdf8]" />
                          <span>Shape Appearance</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-3 pt-0 text-left">
                        {/* Shape Kind */}
                        <div className="field mb-2">
                          <span className="field-label">Type</span>
                          <div className="grid grid-cols-3 gap-1 bg-[#1a1b1e] p-0.5 rounded border border-[#2a2c30]">
                            <button
                              type="button"
                              className={`py-1 text-[9px] rounded font-medium transition-colors ${
                                selectedLayer.shape?.kind === "rect" ||
                                (!selectedLayer.shape?.kind && !selectedLayer.shape?.path)
                                  ? "bg-[#25282f] text-white"
                                  : "text-[#80838a] hover:text-[#d0d2d6]"
                              }`}
                              onClick={() =>
                                updateLayer(selectedLayer.id, {
                                  shape: {
                                    ...(selectedLayer.shape || { fill: "#38bdf8" }),
                                    kind: "rect",
                                  },
                                })
                              }
                              data-testid="button-shape-rect"
                            >
                              Rectangle
                            </button>
                            <button
                              type="button"
                              className={`py-1 text-[9px] rounded font-medium transition-colors ${
                                selectedLayer.shape?.kind === "ellipse"
                                  ? "bg-[#25282f] text-white"
                                  : "text-[#80838a] hover:text-[#d0d2d6]"
                              }`}
                              onClick={() =>
                                updateLayer(selectedLayer.id, {
                                  shape: {
                                    ...(selectedLayer.shape || { fill: "#38bdf8" }),
                                    kind: "ellipse",
                                  },
                                })
                              }
                              data-testid="button-shape-ellipse"
                            >
                              Ellipse
                            </button>
                            <button
                              type="button"
                              className={`py-1 text-[9px] rounded font-medium transition-colors ${
                                selectedLayer.shape?.kind === "path" || selectedLayer.shape?.path
                                  ? "bg-[#25282f] text-[#38bdf8]"
                                  : "text-[#80838a] hover:text-[#d0d2d6]"
                              }`}
                              onClick={() =>
                                updateLayer(selectedLayer.id, {
                                  shape: {
                                    ...(selectedLayer.shape || { fill: "#38bdf8" }),
                                    kind: "path",
                                  },
                                })
                              }
                              data-testid="button-shape-path"
                            >
                              Path
                            </button>
                          </div>
                        </div>

                        {/* Path data viewer if vector path */}
                        {selectedLayer.shape?.path && (
                          <div className="field mb-2">
                            <span className="field-label">SVG Path Data</span>
                            <input
                              type="text"
                              readOnly
                              className="w-full bg-[#16181d] border border-[#262930] rounded text-[8.5px] font-mono text-[#94a3b8] px-2 py-1 outline-none truncate select-all"
                              value={selectedLayer.shape.path}
                              title={selectedLayer.shape.path}
                            />
                          </div>
                        )}

                        {/* Fill Color */}
                        <div className="field mb-2">
                          <span className="field-label">Fill Color</span>
                          <div className="flex items-center gap-1.5 bg-[#1a1b1e] border border-[#2a2c30] rounded p-1 h-7">
                            <input
                              type="color"
                              className="w-5 h-5 rounded cursor-pointer border-0 p-0 bg-transparent"
                              value={
                                selectedLayer.shape?.fill && selectedLayer.shape.fill.startsWith("#")
                                  ? selectedLayer.shape.fill
                                  : "#38bdf8"
                              }
                              onChange={(e) =>
                                updateLayer(selectedLayer.id, {
                                  shape: {
                                    ...(selectedLayer.shape || { kind: "rect" }),
                                    fill: e.target.value,
                                  },
                                })
                              }
                              data-testid="input-shape-fill"
                            />
                            <input
                              type="text"
                              className="w-full bg-transparent text-[9px] font-mono text-[#d8d9dc] outline-none"
                              value={selectedLayer.shape?.fill || "#38bdf8"}
                              onChange={(e) =>
                                updateLayer(selectedLayer.id, {
                                  shape: {
                                    ...(selectedLayer.shape || { kind: "rect" }),
                                    fill: e.target.value,
                                  },
                                })
                              }
                            />
                          </div>
                        </div>

                        {/* Stroke Color & Width */}
                        <div className="field mb-0">
                          <span className="field-label">Stroke</span>
                          <div className="grid grid-cols-3 gap-1.5">
                            <div className="col-span-2 flex items-center gap-1.5 bg-[#1a1b1e] border border-[#2a2c30] rounded p-1 h-7">
                              <input
                                type="color"
                                className="w-5 h-5 rounded cursor-pointer border-0 p-0 bg-transparent"
                                value={
                                  selectedLayer.shape?.stroke && selectedLayer.shape.stroke.startsWith("#")
                                    ? selectedLayer.shape.stroke
                                    : "#0284c7"
                                }
                                onChange={(e) =>
                                  updateLayer(selectedLayer.id, {
                                    shape: {
                                      ...(selectedLayer.shape || { kind: "rect", fill: "#38bdf8" }),
                                      stroke: e.target.value,
                                    },
                                  })
                                }
                                data-testid="input-shape-stroke"
                              />
                              <input
                                type="text"
                                className="w-full bg-transparent text-[9px] font-mono text-[#d8d9dc] outline-none"
                                value={selectedLayer.shape?.stroke || "#0284c7"}
                                onChange={(e) =>
                                  updateLayer(selectedLayer.id, {
                                    shape: {
                                      ...(selectedLayer.shape || { kind: "rect", fill: "#38bdf8" }),
                                      stroke: e.target.value,
                                    },
                                  })
                                }
                              />
                            </div>
                            <label className="flex items-center gap-1 bg-[#1a1b1e] border border-[#2a2c30] rounded px-1.5 h-7">
                              <ScrubbableLabel
                                value={selectedLayer.shape?.strokeWidth ?? 2}
                                onChange={(w) =>
                                  updateLayer(selectedLayer.id, {
                                    shape: {
                                      ...(selectedLayer.shape || { kind: "rect", fill: "#38bdf8" }),
                                      strokeWidth: Math.max(0, Math.round(w)),
                                    },
                                  })
                                }
                                min={0}
                                max={50}
                                step={1}
                                className="text-[8.5px] font-mono text-[#6c6e75] hover:text-[#38bdf8] transition-colors select-none"
                                title="Drag horizontal to scrub Stroke Width (Shift: fast, Alt: precision)"
                              >
                                px
                              </ScrubbableLabel>
                              <input
                                type="number"
                                min="0"
                                max="50"
                                className="w-full bg-transparent text-[9px] text-[#d8d9dc] outline-none font-mono"
                                value={selectedLayer.shape?.strokeWidth ?? 2}
                                onChange={(e) =>
                                  updateLayer(selectedLayer.id, {
                                    shape: {
                                      ...(selectedLayer.shape || { kind: "rect", fill: "#38bdf8" }),
                                      strokeWidth: Math.max(0, parseInt(e.target.value) || 0),
                                    },
                                  })
                                }
                                data-testid="input-shape-stroke-width"
                              />
                            </label>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {/* Layer Effects (for shape layers: after Shape Appearance, before Typography) */}
                  {selectedLayer.type === "shape" && (
                    <AccordionItem value="layer-effects" className="border-b border-[#202227]" data-testid="section-layer-effects">
                      <AccordionTrigger className="py-2.5 text-[11px] font-semibold tracking-wider text-[#999ba0] uppercase hover:text-[#d8d9dc] hover:no-underline">
                        <div className="flex items-center gap-1.5">
                          <Sparkles size={12} className="text-[#38bdf8]" />
                          <span>Layer Effects</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-3 pt-0 text-left">
                        <LayerEffectsPanel layer={selectedLayer} />
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {/* 3. Typography (Text Layers) */}
                  {selectedLayer.type === "text" && (
                    <AccordionItem value="appearance" className="border-b border-[#202227]" data-testid="section-text-props">
                      <AccordionTrigger className="py-2.5 text-[11px] font-semibold tracking-wider text-[#999ba0] uppercase hover:text-[#d8d9dc] hover:no-underline">
                        <div className="flex items-center gap-1.5">
                          <Type size={12} className="text-[#38bdf8]" />
                          <span>Typography</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-3 pt-0 text-left">
                        {/* Text Content */}
                        <label className="field mb-2 block">
                          <span className="field-label">Content</span>
                          <textarea
                            className="w-full bg-[#1a1b1e] border border-[#2a2c30] rounded p-1.5 text-[9.5px] text-[#d8d9dc] outline-none resize-none focus:border-[#4b7991]"
                            rows={2}
                            value={selectedLayer.text?.content || ""}
                            onChange={(e) =>
                              updateLayer(selectedLayer.id, {
                                text: {
                                  ...(selectedLayer.text || {
                                    fontSize: 32,
                                    fontFamily: "Inter",
                                    color: "#ffffff",
                                    align: "left",
                                  }),
                                  content: e.target.value,
                                },
                              })
                            }
                            data-testid="textarea-text-content"
                          />
                        </label>

                        {/* Font Family Select */}
                        <label className="field mb-2 block">
                          <span className="field-label">Font Family</span>
                          <span className="select-wrap">
                            <select
                              className="select-input"
                              value={selectedLayer.text?.fontFamily || "Inter, system-ui, sans-serif"}
                              onChange={(e) =>
                                updateLayer(selectedLayer.id, {
                                  text: {
                                    ...(selectedLayer.text || {
                                      content: "Heading",
                                      fontSize: 32,
                                      color: "#ffffff",
                                      align: "left",
                                    }),
                                    fontFamily: e.target.value,
                                  },
                                })
                              }
                              data-testid="select-text-font"
                            >
                              {FONT_OPTIONS.map((f) => (
                                <option key={f.value} value={f.value}>
                                  {f.label}
                                </option>
                              ))}
                            </select>
                          </span>
                        </label>

                        {/* Font Size & Color */}
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <label className="flex items-center gap-1 bg-[#1a1b1e] border border-[#2a2c30] rounded px-1.5 h-7">
                            <ScrubbableLabel
                              value={selectedLayer.text?.fontSize || 32}
                              onChange={(fontSize) =>
                                updateLayer(selectedLayer.id, {
                                  text: {
                                    ...(selectedLayer.text || {
                                      content: "Text",
                                      fontFamily: "Inter",
                                      color: "#ffffff",
                                      align: "left",
                                    }),
                                    fontSize: Math.max(8, Math.min(200, Math.round(fontSize))),
                                  },
                                })
                              }
                              min={8}
                              max={200}
                              step={1}
                              className="text-[8.5px] font-mono text-[#6c6e75] hover:text-[#38bdf8] transition-colors select-none"
                              title="Drag horizontal to scrub Font Size (Shift: fast, Alt: precision)"
                            >
                              Size
                            </ScrubbableLabel>
                            <input
                              type="number"
                              min="8"
                              max="200"
                              className="w-full bg-transparent text-[9.5px] text-[#d8d9dc] outline-none font-mono"
                              value={selectedLayer.text?.fontSize || 32}
                              onChange={(e) =>
                                updateLayer(selectedLayer.id, {
                                  text: {
                                    ...(selectedLayer.text || {
                                      content: "Text",
                                      fontFamily: "Inter",
                                      color: "#ffffff",
                                      align: "left",
                                    }),
                                    fontSize: Math.max(8, parseInt(e.target.value) || 32),
                                  },
                                })
                              }
                              data-testid="input-text-size"
                            />
                          </label>

                          <div className="flex items-center gap-1.5 bg-[#1a1b1e] border border-[#2a2c30] rounded p-1 h-7">
                            <input
                              type="color"
                              className="w-5 h-5 rounded cursor-pointer border-0 p-0 bg-transparent"
                              value={
                                selectedLayer.text?.color && selectedLayer.text.color.startsWith("#")
                                  ? selectedLayer.text.color
                                  : "#ffffff"
                              }
                              onChange={(e) =>
                                updateLayer(selectedLayer.id, {
                                  text: {
                                    ...(selectedLayer.text || {
                                      content: "Text",
                                      fontFamily: "Inter",
                                      fontSize: 32,
                                      align: "left",
                                    }),
                                    color: e.target.value,
                                  },
                                })
                              }
                              data-testid="input-text-color"
                            />
                            <input
                              type="text"
                              className="w-full bg-transparent text-[9px] font-mono text-[#d8d9dc] outline-none"
                              value={selectedLayer.text?.color || "#ffffff"}
                              onChange={(e) =>
                                updateLayer(selectedLayer.id, {
                                  text: {
                                    ...(selectedLayer.text || {
                                      content: "Text",
                                      fontFamily: "Inter",
                                      fontSize: 32,
                                      align: "left",
                                    }),
                                    color: e.target.value,
                                  },
                                })
                              }
                            />
                          </div>
                        </div>

                        {/* Text Alignment */}
                        <div className="field">
                          <span className="field-label">Alignment</span>
                          <div className="flex items-center gap-1 bg-[#1a1b1e] p-0.5 rounded border border-[#2a2c30]">
                            {(["left", "center", "right"] as const).map((alignMode) => (
                              <button
                                key={alignMode}
                                type="button"
                                className={`flex-1 flex items-center justify-center py-1 rounded transition-colors ${
                                  (selectedLayer.text?.align || "left") === alignMode
                                    ? "bg-[#25282f] text-white"
                                    : "text-[#777a82] hover:text-[#c4c6cc]"
                                }}`}
                                onClick={() =>
                                  updateLayer(selectedLayer.id, {
                                    text: {
                                      ...(selectedLayer.text || {
                                        content: "Text",
                                        fontSize: 32,
                                        fontFamily: "Inter",
                                        color: "#ffffff",
                                      }),
                                      align: alignMode,
                                    },
                                  })
                                }
                                data-testid={`button-align-${alignMode}`}
                                title={`Align ${alignMode}`}
                              >
                                {alignMode === "left" && <AlignLeft size={12} />}
                                {alignMode === "center" && <AlignCenter size={12} />}
                                {alignMode === "right" && <AlignRight size={12} />}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Kinetic Typography Quick Presets */}
                        <div className="mt-3 pt-2 border-t border-[#202227]">
                          <span className="field-label text-[8.5px] text-[#38bdf8] flex items-center gap-1 mb-1.5">
                            <Zap size={10} className="text-[#38bdf8]" />
                            <span>Kinetic Typography Presets</span>
                          </span>
                          <div className="grid grid-cols-3 gap-1">
                            <button
                              type="button"
                              className="py-1 px-1.5 bg-[#16181d] hover:bg-[#20242c] border border-[#272a31] hover:border-[#38bdf8]/50 rounded text-[8px] font-medium text-[#94a3b8] hover:text-white transition-colors"
                              onClick={() => {
                                const start = Math.max(0, currentFrame);
                                addAnimationBlock(activeSceneId, {
                                  layerId: selectedLayer.id,
                                  preset: "fade-in",
                                  startFrame: start,
                                  endFrame: start + 24,
                                  easing: "spring",
                                });
                              }}
                            >
                              Pop & Rise
                            </button>
                            <button
                              type="button"
                              className="py-1 px-1.5 bg-[#16181d] hover:bg-[#20242c] border border-[#272a31] hover:border-[#38bdf8]/50 rounded text-[8px] font-medium text-[#94a3b8] hover:text-white transition-colors"
                              onClick={() => {
                                const start = Math.max(0, currentFrame);
                                addAnimationBlock(activeSceneId, {
                                  layerId: selectedLayer.id,
                                  preset: "scale-in",
                                  startFrame: start,
                                  endFrame: start + 30,
                                  easing: "spring",
                                });
                              }}
                            >
                              Punch Scale
                            </button>
                            <button
                              type="button"
                              className="py-1 px-1.5 bg-[#16181d] hover:bg-[#20242c] border border-[#272a31] hover:border-[#38bdf8]/50 rounded text-[8px] font-medium text-[#94a3b8] hover:text-white transition-colors"
                              onClick={() => {
                                const start = Math.max(0, currentFrame);
                                addAnimationBlock(activeSceneId, {
                                  layerId: selectedLayer.id,
                                  preset: "slide-in-left",
                                  startFrame: start,
                                  endFrame: start + 25,
                                  easing: "spring",
                                });
                              }}
                            >
                              Kinetic Slide
                            </button>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {/* Layer Effects (for non-shape layers: rendered after Typography / Appearance) */}
                  {selectedLayer.type !== "shape" && (
                    <AccordionItem value="layer-effects" className="border-b border-[#202227]" data-testid="section-layer-effects">
                      <AccordionTrigger className="py-2.5 text-[11px] font-semibold tracking-wider text-[#999ba0] uppercase hover:text-[#d8d9dc] hover:no-underline">
                        <div className="flex items-center gap-1.5">
                          <Sparkles size={12} className="text-[#38bdf8]" />
                          <span>Layer Effects</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-3 pt-0 text-left">
                        <LayerEffectsPanel layer={selectedLayer} />
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {/* 4. Image Source (Image Layers) */}
                  {selectedLayer.type === "image" && (
                    <AccordionItem value="appearance" className="border-b border-[#202227]" data-testid="section-image-props">
                      <AccordionTrigger className="py-2.5 text-[11px] font-semibold tracking-wider text-[#999ba0] uppercase hover:text-[#d8d9dc] hover:no-underline">
                        <div className="flex items-center gap-1.5">
                          <ImageIcon size={12} className="text-[#38bdf8]" />
                          <span>Image Source</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-3 pt-0 text-left">
                        <div className="field mb-2">
                          <span className="field-label">Natural Dimensions</span>
                          <div
                            data-testid="text-image-dimensions"
                            className="text-[9.5px] text-[#a0a3a8] font-mono bg-[#1a1b1e] px-2 py-1.5 rounded border border-[#2a2c30] flex items-center justify-between"
                          >
                            <span>Size</span>
                            <span>
                              {selectedLayer.image?.naturalWidth || Math.round(selectedLayer.transform.width)} ×{" "}
                              {selectedLayer.image?.naturalHeight || Math.round(selectedLayer.transform.height)} px
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="w-full mt-1 py-1.5 px-2 text-[9.5px] font-medium bg-[#212328] hover:bg-[#2a2d34] text-[#cfd0d4] rounded border border-[#2f323a] transition-colors flex items-center justify-center gap-1.5"
                          data-testid="button-replace-image"
                          onClick={() => {
                            console.log("Replace image stub clicked");
                          }}
                        >
                          <ImageIcon size={11} />
                          <span>Replace image</span>
                        </button>
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {/* 5. Group Hierarchy (Group Layers) */}
                  {selectedLayer.type === "group" && (
                    <AccordionItem value="appearance" className="border-b border-[#202227]" data-testid="section-group-props">
                      <AccordionTrigger className="py-2.5 text-[11px] font-semibold tracking-wider text-[#999ba0] uppercase hover:text-[#d8d9dc] hover:no-underline">
                        <div className="flex items-center gap-1.5">
                          <Layers size={12} className="text-[#38bdf8]" />
                          <span>Group Hierarchy</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-3 pt-0 text-left">
                        <div className="text-[9px] text-[#8e9198] bg-[#1a1b1e] p-2 rounded border border-[#2a2c30]">
                          Child layers are transformed relative to canvas coordinates enclosed in this group container.
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}
                </Accordion>
              </TabsContent>

              {/* ANIMATE TAB */}
              <TabsContent value="animate" className="mt-0 focus-visible:outline-none">
                {/* Header Action to Add Animation Block */}
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#202227]">
                  <div className="flex items-center gap-1.5">
                    <span className="section-label mb-0 inspector-effects-label font-medium text-[#94a3b8] tracking-wide">
                      Effects ({layerBlocks.length})
                    </span>
                    {layerBlocks.length > 0 && (
                      <button
                        type="button"
                        data-testid="button-save-layer-combo-preset"
                        title="Save all effects on this layer as an animation combo preset"
                        onClick={() => setSavingBlockCombo(layerBlocks)}
                        className="py-0.5 px-1.5 text-[8.5px] font-medium bg-[#8b5cf6]/15 hover:bg-[#8b5cf6]/25 text-[#c4b5fd] rounded border border-[#8b5cf6]/30 inline-flex items-center gap-1 transition-colors"
                      >
                        <Sparkles size={9} strokeWidth={2} />
                        <span>Save Combo</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      data-testid="button-animate-open-presets"
                      title="Open Presets Library"
                      onClick={() => openPresets("animations")}
                      className="inspector-animate-presets-btn py-1 px-2 text-[9px] font-medium bg-[#1d1f24] hover:bg-[#252830] text-[#cfd3dc] rounded border border-[#2d313b] inline-flex items-center gap-1 shadow-sm transition-colors"
                    >
                      <SlidersHorizontal size={10} strokeWidth={1.8} className="inspector-presets-icon text-[#94a3b8]" />
                      <span>Presets</span>
                    </button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          data-testid="button-add-animation-block"
                          className="py-1 px-2 text-[9px] font-medium bg-[#1d1f24] hover:bg-[#252830] text-[#38bdf8] rounded border border-[#2d313b] inline-flex items-center gap-1 shadow-sm transition-colors"
                        >
                          <Plus size={10} strokeWidth={2} />
                          <span>Add Effect</span>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="w-48 max-h-[320px] overflow-y-auto bg-[#14161a] border border-[#26282e] text-[#cfd3dc] text-[9.5px] min-w-[150px] shadow-2xl rounded-md p-1 outline-none"
                      >
                        <DropdownMenuLabel className="text-[8px] uppercase tracking-wider text-[#38bdf8] font-mono px-2 py-1.5 flex items-center justify-between border-b border-[#1c1f26] mb-1">
                          <span className="flex items-center gap-1.5">
                            <Diamond size={8} className="fill-[#0284c7] text-[#38bdf8]" />
                            <span>Add Keyframe Track</span>
                          </span>
                          <span className="text-[7.5px] text-[#4b5563] font-sans font-normal lowercase tracking-normal">curves</span>
                        </DropdownMenuLabel>
                        <div className="space-y-0.5">
                          {getAnimatablePropertiesForLayer(selectedLayer).map((prop) => {
                            const hasTrack = layerBlocks.filter(isKeyframeTrack).some((t) => t.property === prop.id);
                            return (
                              <DropdownMenuItem
                                key={prop.id}
                                className="cursor-pointer hover:bg-[#1a2c3d] hover:text-[#38bdf8] focus:bg-[#1a2c3d] focus:text-[#38bdf8] px-2 py-1.5 rounded-[3px] flex items-center justify-between text-[9.5px] text-[#cbd5e1] transition-colors"
                                onClick={() => {
                                  addKeyframeTrack(activeSceneId, selectedLayer.id, prop.id);
                                }}
                                data-testid={`inspector-add-kf-track-${prop.id}`}
                              >
                                <span className="flex items-center gap-1.5">
                                  <span className={`w-1.5 h-1.5 rounded-full ${hasTrack ? "bg-[#38bdf8] shadow-[0_0_4px_#38bdf8]" : "bg-[#333742]"}`} />
                                  <span>{prop.label}</span>
                                </span>
                                {hasTrack && (
                                  <span className="text-[7.5px] text-[#38bdf8] font-mono opacity-80">
                                    active
                                  </span>
                                )}
                              </DropdownMenuItem>
                            );
                          })}
                        </div>
                        <DropdownMenuSeparator className="bg-[#20232a] my-1.5" />
                        <DropdownMenuLabel className="text-[8px] uppercase tracking-wider text-[#717684] font-mono px-2 py-1.5 flex items-center justify-between border-b border-[#1c1f26] mb-1">
                          <span className="flex items-center gap-1.5">
                            <Sparkles size={8} className="text-[#c084fc]" />
                            <span>Animation Presets</span>
                          </span>
                          <span className="text-[7.5px] text-[#4b5563] font-sans font-normal lowercase tracking-normal">blocks</span>
                        </DropdownMenuLabel>
                        <div className="space-y-0.5">
                          {BLOCK_PRESETS.map((preset) => (
                            <DropdownMenuItem
                              key={preset.id}
                              className="cursor-pointer hover:bg-[#20242e] hover:text-white focus:bg-[#20242e] focus:text-white px-2 py-1.5 rounded-[3px] flex items-center justify-between text-[9.5px] text-[#cbd5e1] transition-colors"
                              onClick={() => {
                                const start = Math.min(
                                  (activeScene?.durationFrames || 180) - 10,
                                  currentFrame,
                                );
                                const end = Math.min(
                                  activeScene?.durationFrames || 180,
                                  start + 30,
                                );
                                addAnimationBlock(activeSceneId, {
                                  layerId: selectedLayer.id,
                                  preset: preset.id,
                                  startFrame: start,
                                  endFrame: end,
                                  easing: "ease-in-out",
                                });
                              }}
                            >
                              <span className="capitalize">{preset.label}</span>
                              <span className="text-[7.5px] text-[#4b5563] font-mono">preset</span>
                            </DropdownMenuItem>
                          ))}
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {layerBlocks.length === 0 ? (
                  <div
                    className="flex flex-col items-center justify-center py-6 text-center px-2"
                    data-testid="animate-tab-empty-state"
                  >
                    <div className="w-8 h-8 rounded-full bg-[#181a1e] border border-[#25282f] flex items-center justify-center text-[#6e7178] mb-2 shadow-sm">
                      <CirclePlay size={14} strokeWidth={1.8} />
                    </div>
                    <p className="text-[10px] text-[#9ca0a8] mb-1 font-semibold">
                      No Animation Blocks
                    </p>
                    <p className="text-[8.5px] text-[#63666d] max-w-[220px] leading-relaxed mb-3">
                      Add transitions, scale pulses, slide-ins, and keyframes to animate this layer.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {layerBlocks.map((block) => {
                      if (isKeyframeTrack(block)) {
                        const kfTrack = block as KeyframeTrackBlock;
                        const isColorProp = kfTrack.property === "fill" || kfTrack.property === "stroke";

                        return (
                          <div
                            key={block.id}
                            className="bg-[#12161f] border border-[#1e3a5f] rounded p-2.5 flex flex-col gap-2.5 shadow-sm"
                            data-testid={`inspector-keyframe-track-${block.id}`}
                          >
                            {/* Keyframe Track Header */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <Diamond size={10} className="text-[#38bdf8] fill-[#0284c7]" />
                                <span className="px-1.5 py-0.5 rounded bg-[#0369a1]/30 text-[#38bdf8] border border-[#0284c7]/40 font-mono text-[8.5px] font-semibold uppercase">
                                  Track: {kfTrack.property}
                                </span>
                                <span className="text-[#64748b] text-[8px] font-mono">
                                  {kfTrack.keyframes.length} kf
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  className="text-[8.5px] font-medium bg-[#1e293b] hover:bg-[#0284c7] text-[#38bdf8] hover:text-white px-1.5 py-0.5 rounded border border-[#0369a1]/40 flex items-center gap-1 transition-colors"
                                  title="Add keyframe at current playhead position"
                                  onClick={() => {
                                    let defaultVal: any = 0;
                                    if (kfTrack.property === "fill") {
                                      defaultVal = selectedLayer.type === "shape" ? (selectedLayer.shape?.fill || "#38bdf8") : (selectedLayer.text?.color || "#ffffff");
                                    } else if (kfTrack.property === "stroke") {
                                      defaultVal = selectedLayer.type === "shape" ? (selectedLayer.shape?.stroke || "#000000") : "#000000";
                                    } else if (kfTrack.property === "fontSize") {
                                      defaultVal = selectedLayer.type === "text" ? (selectedLayer.text?.fontSize || 24) : 24;
                                    } else if (kfTrack.property === "opacity") {
                                      defaultVal = selectedLayer.opacity ?? 1;
                                    } else if (kfTrack.property === "rotation") {
                                      defaultVal = selectedLayer.transform.rotation ?? 0;
                                    } else if (kfTrack.property in selectedLayer) {
                                      defaultVal = (selectedLayer as any)[kfTrack.property] ?? 0;
                                    }
                                    const sampled = sampleKeyframeTrack(kfTrack, currentFrame);
                                    const finalVal = sampled !== null ? sampled : defaultVal;

                                    addKeyframe(activeSceneId, kfTrack.id, {
                                      frame: currentFrame,
                                      value: finalVal,
                                      easing: "ease-in-out",
                                    });
                                  }}
                                  data-testid={`button-inspector-add-kf-${kfTrack.id}`}
                                >
                                  <Plus size={9} />
                                  <span>Add @ {currentFrame}f</span>
                                </button>
                                <button
                                  type="button"
                                  className="text-[#64748b] hover:text-[#f87171] p-1 rounded hover:bg-[#202227] transition-colors"
                                  title="Delete track"
                                  onClick={() => removeAnimationBlock(block.id)}
                                  data-testid={`button-inspector-del-track-${block.id}`}
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            </div>

                            {/* Keyframes list */}
                            <div className="flex flex-col gap-2">
                              {kfTrack.keyframes.map((kf, idx) => (
                                <div
                                  key={`${kfTrack.id}-${idx}-${kf.frame}`}
                                  className="bg-[#171c26] border border-[#232d3d] rounded p-2 flex flex-col gap-1.5"
                                  data-testid={`inspector-keyframe-item-${kfTrack.id}-${kf.frame}`}
                                >
                                  <div className="flex items-center justify-between text-[8px] text-[#94a3b8]">
                                    <div className="flex items-center gap-1">
                                      <Diamond size={7} className="text-[#38bdf8] fill-[#38bdf8]" />
                                      <span className="font-semibold text-white">KF #{idx + 1}</span>
                                    </div>
                                    <button
                                      type="button"
                                      className="text-[#64748b] hover:text-[#ef4444] transition-colors p-0.5"
                                      title="Remove this keyframe"
                                      onClick={() => removeKeyframe(activeSceneId, kfTrack.id, kf.frame)}
                                      data-testid={`btn-del-kf-${kfTrack.id}-${kf.frame}`}
                                    >
                                      <Trash2 size={9} />
                                    </button>
                                  </div>

                                   {/* Frame and Value Row */}
                                  <div className="grid grid-cols-2 gap-2">
                                    <label className="field mb-0">
                                      <ScrubbableLabel
                                        value={kf.frame}
                                        onChange={(newF) =>
                                          updateKeyframe(activeSceneId, kfTrack.id, kf.frame, {
                                            frame: Math.max(0, Math.min(activeScene?.durationFrames || 180, Math.round(newF))),
                                          })
                                        }
                                        min={0}
                                        max={activeScene?.durationFrames || 180}
                                        step={1}
                                        className="field-label text-[8px] hover:text-[#38bdf8] transition-colors select-none"
                                        title="Drag horizontal to scrub Keyframe Frame (Shift: fast, Alt: precision)"
                                      >
                                        Frame
                                      </ScrubbableLabel>
                                      <input
                                        type="number"
                                        className="text-input font-mono text-[8.5px]"
                                        min={0}
                                        max={activeScene?.durationFrames || 180}
                                        value={kf.frame}
                                        onChange={(e) => {
                                          const newF = parseInt(e.target.value, 10);
                                          if (!isNaN(newF)) {
                                            updateKeyframe(activeSceneId, kfTrack.id, kf.frame, { frame: newF });
                                          }
                                        }}
                                      />
                                    </label>

                                    <label className="field mb-0">
                                      {!isColorProp && typeof kf.value === "number" ? (
                                        <ScrubbableLabel
                                          value={kf.value}
                                          onChange={(num) =>
                                            updateKeyframe(activeSceneId, kfTrack.id, kf.frame, {
                                              value: kfTrack.property === "opacity"
                                                ? Math.max(0, Math.min(1, Math.round(num * 100) / 100))
                                                : Math.round(num * 10) / 10,
                                            })
                                          }
                                          min={kfTrack.property === "opacity" ? 0 : undefined}
                                          max={kfTrack.property === "opacity" ? 1 : undefined}
                                          step={kfTrack.property === "opacity" ? 0.05 : 1}
                                          className="field-label text-[8px] hover:text-[#38bdf8] transition-colors select-none"
                                          title="Drag horizontal to scrub Keyframe Value (Shift: fast, Alt: precision)"
                                        >
                                          Value
                                        </ScrubbableLabel>
                                      ) : (
                                        <span className="field-label text-[8px]">Value</span>
                                      )}
                                      {isColorProp ? (
                                        <div className="flex items-center gap-1">
                                          <input
                                            type="color"
                                            className="w-5 h-5 rounded border border-[#2d3139] bg-transparent cursor-pointer"
                                            value={typeof kf.value === "string" ? kf.value : "#38bdf8"}
                                            onChange={(e) => {
                                              updateKeyframe(activeSceneId, kfTrack.id, kf.frame, { value: e.target.value });
                                            }}
                                          />
                                          <input
                                            type="text"
                                            className="text-input font-mono text-[8.5px] flex-1"
                                            value={String(kf.value)}
                                            onChange={(e) => {
                                              updateKeyframe(activeSceneId, kfTrack.id, kf.frame, { value: e.target.value });
                                            }}
                                          />
                                        </div>
                                      ) : (
                                        <input
                                          type="number"
                                          step={kfTrack.property === "opacity" ? 0.05 : 1}
                                          className="text-input font-mono text-[8.5px]"
                                          value={typeof kf.value === "number" ? kf.value : Number(kf.value) || 0}
                                          onChange={(e) => {
                                            const num = parseFloat(e.target.value);
                                            if (!isNaN(num)) {
                                              updateKeyframe(activeSceneId, kfTrack.id, kf.frame, { value: num });
                                            }
                                          }}
                                        />
                                      )}
                                    </label>
                                  </div>

                                  {/* Easing row */}
                                  <label className="field mb-0">
                                    <span className="field-label text-[8px]">Easing to next KF</span>
                                    <select
                                      className="select-input text-[8.5px]"
                                      value={kf.easing || "ease-in-out"}
                                      onChange={(e) => {
                                        updateKeyframe(activeSceneId, kfTrack.id, kf.frame, {
                                          easing: e.target.value as any,
                                        });
                                      }}
                                    >
                                      <option value="ease-in-out">Ease In Out (Cubic)</option>
                                      <option value="linear">Linear</option>
                                      <option value="spring">Spring</option>
                                      <option value="custom">Custom Bezier</option>
                                    </select>
                                  </label>

                                  {/* Custom Bezier Curve editor if custom */}
                                  {kf.easing === "custom" && (
                                    <div className="mt-1 pt-1 border-t border-[#232d3d]">
                                      <CubicBezierEditor
                                        value={kf.customCurve || [0.25, 0.1, 0.25, 1.0]}
                                        onChange={(newCurve) => {
                                          updateKeyframe(activeSceneId, kfTrack.id, kf.frame, {
                                            customCurve: newCurve,
                                          });
                                        }}
                                      />
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }

                      const presetBlock = block as PresetAnimationBlock;
                      return (
                      <div
                        key={presetBlock.id}
                        className="bg-[#15171b] border border-[#23262c] rounded p-2.5 flex flex-col gap-2.5 shadow-sm"
                      >
                        {/* Block Header with Preset Action Menu */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded bg-[#1e293b] text-[#38bdf8] border border-[#0369a1]/40 font-mono text-[8.5px] font-medium capitalize">
                              {typeof presetBlock.preset === "string"
                                ? presetBlock.preset.replace(/-/g, " ")
                                : (presetBlock.preset as any)?.label || (presetBlock.preset as any)?.id || "effect"}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className="text-[#64748b] hover:text-[#38bdf8] p-1 rounded hover:bg-[#202227] transition-colors"
                                  title="Block options"
                                  data-testid={`button-block-options-${block.id}`}
                                >
                                  <MoreVertical size={11} />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                className="w-40 bg-[#14161a] border border-[#26282e] text-[#cfd3dc] text-[9.5px] shadow-2xl rounded-md p-1 outline-none"
                              >
                                <DropdownMenuItem
                                  className="cursor-pointer hover:bg-[#1e232d] hover:text-white focus:bg-[#1e232d] focus:text-white px-2 py-1.5 rounded-[3px] flex items-center gap-1.5 text-[#cbd5e1] transition-colors"
                                  onClick={() => setSavingBlockPreset(block)}
                                  data-testid={`menu-save-preset-${block.id}`}
                                >
                                  <Sparkles size={11} className="text-[#38bdf8]" />
                                  <span>Save as preset</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="bg-[#20232a] my-1" />
                                <DropdownMenuItem
                                  className="cursor-pointer hover:bg-[#3f1618] hover:text-[#fca5a5] focus:bg-[#3f1618] focus:text-[#fca5a5] text-[#f87171] px-2 py-1.5 rounded-[3px] flex items-center gap-1.5 transition-colors"
                                  onClick={() => removeAnimationBlock(block.id)}
                                >
                                  <Trash2 size={11} />
                                  <span>Delete block</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>

                            <button
                              type="button"
                              className="text-[#64748b] hover:text-[#f87171] p-1 rounded hover:bg-[#202227] transition-colors"
                              title="Remove animation block"
                              onClick={() => removeAnimationBlock(block.id)}
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>

                        {/* Timing Range: Start & End Frames */}
                        <div className="grid grid-cols-2 gap-2">
                          <label className="field mb-0">
                            <ScrubbableLabel
                              value={block.startFrame}
                              onChange={(startFrame) =>
                                updateAnimationBlock(block.id, {
                                  startFrame: Math.max(0, Math.min(block.endFrame - 1, Math.round(startFrame))),
                                })
                              }
                              min={0}
                              max={activeScene?.durationFrames || 180}
                              step={1}
                              className="field-label text-[8.5px] hover:text-[#38bdf8] transition-colors select-none"
                              title="Drag horizontal to scrub Start Frame (Shift: fast, Alt: precision)"
                            >
                              Start Frame
                            </ScrubbableLabel>
                            <input
                              type="number"
                              className="text-input font-mono text-[9px]"
                              min={0}
                              max={activeScene?.durationFrames || 180}
                              value={block.startFrame}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val)) {
                                  updateAnimationBlock(block.id, {
                                    startFrame: val,
                                  });
                                }
                              }}
                            />
                          </label>

                          <label className="field mb-0">
                            <ScrubbableLabel
                              value={block.endFrame}
                              onChange={(endFrame) =>
                                updateAnimationBlock(block.id, {
                                  endFrame: Math.max(block.startFrame + 1, Math.min(activeScene?.durationFrames || 180, Math.round(endFrame))),
                                })
                              }
                              min={block.startFrame + 1}
                              max={activeScene?.durationFrames || 180}
                              step={1}
                              className="field-label text-[8.5px] hover:text-[#38bdf8] transition-colors select-none"
                              title="Drag horizontal to scrub End Frame (Shift: fast, Alt: precision)"
                            >
                              End Frame
                            </ScrubbableLabel>
                            <input
                              type="number"
                              className="text-input font-mono text-[9px]"
                              min={block.startFrame + 1}
                              max={activeScene?.durationFrames || 180}
                              value={block.endFrame}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val)) {
                                  updateAnimationBlock(block.id, {
                                    endFrame: val,
                                  });
                                }
                              }}
                            />
                          </label>
                        </div>

                        {/* Duration info */}
                        <div className="flex items-center justify-between text-[8px] text-[#6b7280] font-mono px-0.5">
                          <span>
                            Duration: {block.endFrame - block.startFrame} frames
                          </span>
                          <span>
                            {(
                              (block.endFrame - block.startFrame) /
                              (activeScene?.fps || 30)
                            ).toFixed(2)}
                            s
                          </span>
                        </div>

                        {/* Easing Selector */}
                        <label className="field mb-0">
                          <span className="field-label text-[8.5px]">Easing</span>
                          <select
                            className="select-input text-[9px]"
                            value={block.easing}
                            onChange={(e) => {
                              updateAnimationBlock(block.id, {
                                easing: e.target.value as AnimationBlock["easing"],
                              });
                            }}
                          >
                            <option value="ease-in-out">Ease In Out (Cubic)</option>
                            <option value="linear">Linear</option>
                            <option value="spring">Spring (Damped Physics)</option>
                            <option value="custom">Custom (Cubic-Bezier)</option>
                          </select>
                        </label>

                        {/* Spring description */}
                        {block.easing === "spring" && (
                          <div className="text-[8px] text-[#38bdf8] bg-[#0c2233] p-1.5 rounded border border-[#0369a1]/30 flex items-center gap-1.5">
                            <Zap size={10} className="flex-shrink-0" />
                            <span>Natural damped harmonic oscillation with subtle bounce.</span>
                          </div>
                        )}

                        {/* Custom Cubic Bezier Editor */}
                        {block.easing === "custom" && (
                          <div className="pt-1">
                            <CubicBezierEditor
                              value={block.customCurve || [0.25, 0.1, 0.25, 1.0]}
                              onChange={(curve) =>
                                updateAnimationBlock(block.id, {
                                  customCurve: curve,
                                })
                              }
                            />
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          /* Multi-Layer Selection Panel */
          <div data-testid="multi-selection-view">
            <span className="section-label">Multiple Selection</span>
            <div className="bg-[#17191d] border border-[#24272e] rounded p-2.5 mb-3">
              <div className="text-[10.5px] font-semibold text-[#e2e4e8] mb-1 flex items-center gap-1.5">
                <Layers size={13} className="text-[#38bdf8]" />
                <span>{selectedLayerIds.length} Layers Selected</span>
              </div>
              <p className="text-[9px] text-[#787b84] leading-relaxed mb-2.5">
                Move, scale, or group selected items together on the canvas.
              </p>
              <button
                type="button"
                className="w-full py-1 text-[9px] font-medium bg-[#202227] hover:bg-[#272a31] text-[#cfd0d5] border border-[#2d3038] rounded transition-colors"
                data-testid="button-deselect-layers"
                onClick={() => selectLayers([])}
              >
                Clear Selection
              </button>
            </div>
          </div>
        )}
      </div>
      {shared && (
        <div
          role="status"
          data-testid="status-editor-prompt"
          style={{
            position: "absolute",
            bottom: 34,
            left: 8,
            right: 8,
            padding: "7px 8px",
            border: "1px solid #2f3940",
            borderRadius: 4,
            background: "#182126",
            color: "#a7cfe2",
            fontSize: 9,
          }}
        >
          Share link ready
        </div>
      )}

      {/* Save Animation Preset Modals */}
      {savingBlockPreset && (
        <SaveAnimationPresetModal
          open={!!savingBlockPreset}
          onOpenChange={(open) => !open && setSavingBlockPreset(null)}
          blocks={[savingBlockPreset]}
          defaultName={`${
            typeof savingBlockPreset.preset === "string"
              ? savingBlockPreset.preset.replace(/-/g, " ")
              : "Effect"
          } Preset`}
        />
      )}

      {savingBlockCombo && (
        <SaveAnimationPresetModal
          open={!!savingBlockCombo}
          onOpenChange={(open) => !open && setSavingBlockCombo(null)}
          blocks={savingBlockCombo}
          defaultName={`${selectedLayer?.name || "Layer"} Combo`}
        />
      )}
    </aside>
  );
}
