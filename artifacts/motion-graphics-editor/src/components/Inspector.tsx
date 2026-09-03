import React, { useState } from "react";
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
} from "lucide-react";
import { SaveAnimationPresetModal } from "./SavePresetModals";
import { useEditorStore, useEditorUIStore, type Layer, type BackgroundMode } from "../store/editor-store";
import {
  type AnimationBlock,
  type BlockPreset,
  type KeyframeTrackBlock,
  type Keyframe,
  type AnimatableProperty,
  BLOCK_PRESETS,
  isKeyframeTrack,
  sampleKeyframeTrack,
} from "../store/animation-blocks";
import { CubicBezierEditor } from "./CubicBezierEditor";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  const bloom = useEditorStore((state) => state.bloom) || {
    enabled: false,
    threshold: 200,
    intensity: 1.0,
    blurPx: 16,
  };
  const updateBloom = useEditorStore((state) => state.updateBloom);
  const optics = useEditorStore((state) => state.optics) || { filmGrain: 0, vignette: 0, chromaticAberration: 0 };
  const updateOptics = useEditorStore((state) => state.updateOptics);
  const updateSceneLighting = useEditorStore((state) => state.updateSceneLighting);
  const resetCamera = useEditorStore((state) => state.resetCamera);
  const openPresets = useEditorUIStore((state) => state.openPresets);
  const setExportModalOpen = useEditorUIStore((state) => state.setExportModalOpen);
  const setIsCameraSelected = useEditorUIStore((state) => state.setIsCameraSelected);
  const setActiveTool = useEditorUIStore((state) => state.setActiveTool);

  const [savingBlockPreset, setSavingBlockPreset] = useState<AnimationBlock | null>(null);
  const [savingBlockCombo, setSavingBlockCombo] = useState<AnimationBlock[] | null>(null);

  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>("Color");
  const [lens, setLens] = useState("F 50 mm");
  const [shared, setShared] = useState(false);

  const activeScene = scenes.find((s) => s.id === activeSceneId) || scenes[0];
  const camera = activeScene?.camera || { x: 0, y: 0, z: 0, fov: 60, focusDistance: 1000 };
  const cameraBlocks = (activeScene?.animationBlocks || []).filter(
    (b) => b.preset === "camera-move" || b.layerId === null,
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
  };

  const handleOpacityChange = (val: number) => {
    if (!selectedLayer) return;
    const clamped = Math.min(1, Math.max(0, val));
    updateLayer(selectedLayer.id, { opacity: clamped });
  };

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
                <span className="section-label">Project Settings</span>

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

                <label className="field">
                  <span className="field-label">Lens</span>
                  <input
                    className="text-input"
                    value={lens}
                    onChange={(event) => setLens(event.target.value)}
                    data-testid="input-lens"
                  />
                </label>

                <div className="field">
                  <span className="field-label">Background</span>
                  <div
                    className="background-tabs"
                    role="tablist"
                    aria-label="Background type"
                  >
                    {(["Color", "Image", "Shader"] as BackgroundMode[]).map(
                      (mode) => (
                        <button
                          key={mode}
                          className={`background-tab ${
                            backgroundMode === mode ? "active" : ""
                          }`}
                          type="button"
                          role="tab"
                          aria-selected={backgroundMode === mode}
                          data-testid={`tab-background-${mode.toLowerCase()}`}
                          onClick={() => {
                            setBackgroundMode(mode);
                            if (mode === "Shader" && !bloom.enabled) {
                              updateBloom({ enabled: true });
                            }
                          }}
                        >
                          {mode}
                        </button>
                      ),
                    )}
                  </div>

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
                    <div
                      className="mt-2.5 p-2 bg-[#16181c] border border-[#26282e] rounded flex flex-col gap-2"
                      data-testid="shader-bloom-controls"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Sparkles size={11} className="text-[#38bdf8]" />
                          <span className="text-[9px] font-medium text-[#d8d9dc]">Bloom Post-Processing</span>
                        </div>
                        {/* Bloom toggle switch */}
                        <button
                          type="button"
                          className={`relative inline-flex h-3.5 w-6.5 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            bloom.enabled ? "bg-[#0284c7]" : "bg-[#252830]"
                          }`}
                          role="switch"
                          aria-checked={bloom.enabled}
                          data-testid="switch-bloom-enabled"
                          onClick={() => updateBloom({ enabled: !bloom.enabled })}
                          title={bloom.enabled ? "Disable Bloom Effect" : "Enable Bloom Effect"}
                        >
                          <span
                            className={`pointer-events-none inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              bloom.enabled ? "translate-x-3" : "translate-x-0"
                            }`}
                          />
                        </button>
                      </div>

                      {/* Threshold Slider */}
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-[8px] text-[#81838a]">
                          <span>Luminance Threshold</span>
                          <span className="font-mono text-[#d8d9dc] font-semibold">{bloom.threshold ?? 200}</span>
                        </div>
                        <input
                          type="range"
                          min="50"
                          max="255"
                          step="5"
                          value={bloom.threshold ?? 200}
                          data-testid="slider-bloom-threshold"
                          className="w-full h-1 bg-[#282a30] rounded-lg appearance-none cursor-pointer accent-[#38bdf8]"
                          onChange={(e) => updateBloom({ threshold: parseInt(e.target.value, 10) })}
                        />
                      </div>

                      {/* Intensity Slider */}
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-[8px] text-[#81838a]">
                          <span>Bloom Intensity</span>
                          <span className="font-mono text-[#d8d9dc] font-semibold">{Math.round((bloom.intensity ?? 1.0) * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0.1"
                          max="2.0"
                          step="0.05"
                          value={bloom.intensity ?? 1.0}
                          data-testid="slider-bloom-intensity"
                          className="w-full h-1 bg-[#282a30] rounded-lg appearance-none cursor-pointer accent-[#38bdf8]"
                          onChange={(e) => updateBloom({ intensity: parseFloat(e.target.value) })}
                        />
                      </div>

                      {/* Blur Radius Slider */}
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-[8px] text-[#81838a]">
                          <span>Diffusion Blur Radius</span>
                          <span className="font-mono text-[#d8d9dc] font-semibold">{bloom.blurPx ?? 16}px</span>
                        </div>
                        <input
                          type="range"
                          min="4"
                          max="40"
                          step="2"
                          value={bloom.blurPx ?? 16}
                          data-testid="slider-bloom-blur"
                          className="w-full h-1 bg-[#282a30] rounded-lg appearance-none cursor-pointer accent-[#38bdf8]"
                          onChange={(e) => updateBloom({ blurPx: parseInt(e.target.value, 10) })}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Camera (3D Parallax & Projection) Controls */}
                <div className="section-divider my-2.5 border-t border-[#202227]" />
                <div
                  className="flex items-center justify-between mb-2 cursor-pointer group"
                  onClick={() => {
                    setIsCameraSelected(true);
                    setActiveTool("camera");
                  }}
                  title="Click to select Camera and show Camera Focus control"
                >
                  <div className="flex items-center gap-1.5">
                    <CameraIcon size={12} className="text-[#38bdf8] group-hover:scale-110 transition-transform" />
                    <span className="section-label mb-0 text-[#d8d9dc] group-hover:text-white transition-colors">Camera (3D Parallax)</span>
                  </div>
                  <button
                    type="button"
                    className="text-[8.5px] text-[#81838a] hover:text-[#d8d9dc] flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded hover:bg-[#1f2127]"
                    onClick={(e) => {
                      e.stopPropagation();
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
                      <span className="text-[9px] font-mono text-[#6c6e75]">X</span>
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
                      <span className="text-[9px] font-mono text-[#6c6e75]">Y</span>
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
                      <span className="text-[9px] font-mono text-[#6c6e75]">Z</span>
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
                      <span className="text-[8.5px] font-mono text-[#6c6e75]">Pitch</span>
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
                      <span className="text-[8.5px] font-mono text-[#6c6e75]">Yaw</span>
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
                      <span className="text-[8.5px] font-mono text-[#6c6e75]">Roll</span>
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
                <div className="mb-2">
                  <div className="text-[8.5px] font-medium text-[#81838a] mb-1 flex items-center gap-1">
                    <Eye size={10} className="text-[#38bdf8]" />
                    <span>Lens & Optical Depth</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <label className="flex items-center gap-1 bg-[#1a1b1e] border border-[#2a2c30] rounded px-1.5 h-6 focus-within:border-[#4b7991]" title="Field of View (degrees)">
                      <span className="text-[8.5px] font-mono text-[#6c6e75]">FOV</span>
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
                      <span className="text-[8.5px] font-mono text-[#6c6e75]">Focus</span>
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

                {/* Studio Lighting Section */}
                <div className="section-divider my-2.5 border-t border-[#202227]" />
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Sun size={12} className="text-[#38bdf8]" />
                    <span className="section-label mb-0 text-[#d8d9dc]">Studio Lighting & Shadows</span>
                  </div>
                  <button
                    type="button"
                    className={`relative inline-flex h-3.5 w-6.5 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      (activeScene?.lighting?.enabled ?? true) ? "bg-[#0284c7]" : "bg-[#252830]"
                    }`}
                    role="switch"
                    aria-checked={activeScene?.lighting?.enabled ?? true}
                    onClick={() =>
                      updateSceneLighting({
                        enabled: !(activeScene?.lighting?.enabled ?? true),
                      })
                    }
                  >
                    <span
                      className={`pointer-events-none inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        (activeScene?.lighting?.enabled ?? true) ? "translate-x-3" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {(activeScene?.lighting?.enabled ?? true) && (
                  <div className="space-y-2.5 p-2 bg-[#16181c] border border-[#26282e] rounded mb-3 shadow-xs">
                    <div>
                      <span className="text-[8.5px] font-medium text-[#81838a] mb-1.5 block">Light Source & Intensity</span>
                      <div className="grid grid-cols-3 gap-1.5">
                        <label className="flex items-center gap-1 bg-[#1a1b1e] border border-[#2a2c30] rounded px-1.5 h-6 focus-within:border-[#4b7991] focus-within:ring-1 focus-within:ring-[#244c60] transition-colors" title="Light Position X">
                          <span className="text-[9px] font-mono text-[#6c6e75] select-none">X</span>
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
                          <span className="text-[9px] font-mono text-[#6c6e75] select-none">Y</span>
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
                          <span className="text-[9px] font-mono text-[#6c6e75] select-none">Int</span>
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
                          <span className="font-mono text-[9px] text-[#d8d9dc]">
                            {Math.round((activeScene?.lighting?.shadowOpacity ?? 0.35) * 100)}%
                          </span>
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
                          <span className="font-mono text-[9px] text-[#d8d9dc]">{activeScene?.lighting?.shadowBlur ?? 24}px</span>
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

                {/* Film-Grade Optics Section */}
                <div className="section-divider my-2.5 border-t border-[#202227]" />
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Sparkles size={12} className="text-[#38bdf8]" />
                    <span className="section-label mb-0 text-[#d8d9dc]">Film Optics & Imperfections</span>
                  </div>
                  <button
                    type="button"
                    className="text-[8.5px] text-[#81838a] hover:text-[#d8d9dc] flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded hover:bg-[#1f2127]"
                    onClick={() => updateOptics({ filmGrain: 0, vignette: 0, chromaticAberration: 0 })}
                    title="Reset optics to defaults"
                  >
                    <RotateCcw size={9} />
                    <span>Reset</span>
                  </button>
                </div>

                <div className="space-y-2.5 p-2 bg-[#16181c] border border-[#26282e] rounded mb-3 shadow-xs">
                  {/* Film Grain */}
                  <div>
                    <div className="flex items-center justify-between text-[8.5px] text-[#81838a] mb-1">
                      <span className="text-[#999ba0]">35mm Film Grain</span>
                      <span className="font-mono text-[9px] text-[#d8d9dc]">{Math.round((optics.filmGrain ?? 0) * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="0.4"
                      step="0.01"
                      className="inspector-slider w-full"
                      value={optics.filmGrain ?? 0}
                      onChange={(e) => updateOptics({ filmGrain: parseFloat(e.target.value) })}
                    />
                  </div>

                  {/* Vignette */}
                  <div>
                    <div className="flex items-center justify-between text-[8.5px] text-[#81838a] mb-1">
                      <span className="text-[#999ba0]">Lens Vignette</span>
                      <span className="font-mono text-[9px] text-[#d8d9dc]">{Math.round((optics.vignette ?? 0) * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      className="inspector-slider w-full"
                      value={optics.vignette ?? 0}
                      onChange={(e) => updateOptics({ vignette: parseFloat(e.target.value) })}
                    />
                  </div>

                  {/* Chromatic Aberration */}
                  <div>
                    <div className="flex items-center justify-between text-[8.5px] text-[#81838a] mb-1">
                      <span className="text-[#999ba0]">Chromatic Aberration</span>
                      <span className="font-mono text-[9px] text-[#d8d9dc]">
                        {Math.round((optics.chromaticAberration ?? 0) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      className="inspector-slider w-full"
                      value={optics.chromaticAberration ?? 0}
                      onChange={(e) =>
                        updateOptics({ chromaticAberration: parseFloat(e.target.value) })
                      }
                    />
                  </div>
                </div>
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
                    <p className="text-[8.5px] text-[#63666d] max-w-[180px] leading-relaxed mb-3">
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
                            <span className="field-label text-[8.5px]">Start Frame</span>
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
                            <span className="field-label text-[8.5px]">End Frame</span>
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
                              <span className="field-label text-[8px]">Delta X (px)</span>
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
                              <span className="field-label text-[8px]">Delta Y (px)</span>
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
                              <span className="field-label text-[8px]">Delta Z (Depth)</span>
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
                              <span className="field-label text-[8px]">Delta FOV (deg)</span>
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

                {/* Transform Section (All Types) */}
                <div className="mb-3">
                  <span className="section-label mb-1.5">Transform</span>

                  {/* Position (X, Y) */}
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <label className="flex items-center gap-1 bg-[#1a1b1e] border border-[#2a2c30] rounded px-1.5 h-6">
                      <span className="text-[9px] font-mono text-[#6c6e75]">X</span>
                      <input
                        type="number"
                        className="w-full bg-transparent text-[9.5px] text-[#d8d9dc] outline-none font-mono"
                        value={Math.round(selectedLayer.transform.x)}
                        onChange={(e) =>
                          handleTransformChange("x", parseFloat(e.target.value))
                        }
                        data-testid="input-transform-x"
                      />
                    </label>
                    <label className="flex items-center gap-1 bg-[#1a1b1e] border border-[#2a2c30] rounded px-1.5 h-6">
                      <span className="text-[9px] font-mono text-[#6c6e75]">Y</span>
                      <input
                        type="number"
                        className="w-full bg-transparent text-[9.5px] text-[#d8d9dc] outline-none font-mono"
                        value={Math.round(selectedLayer.transform.y)}
                        onChange={(e) =>
                          handleTransformChange("y", parseFloat(e.target.value))
                        }
                        data-testid="input-transform-y"
                      />
                    </label>
                  </div>

                  {/* Dimensions (W, H) */}
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <label className="flex items-center gap-1 bg-[#1a1b1e] border border-[#2a2c30] rounded px-1.5 h-6">
                      <span className="text-[9px] font-mono text-[#6c6e75]">W</span>
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
                    </label>
                    <label className="flex items-center gap-1 bg-[#1a1b1e] border border-[#2a2c30] rounded px-1.5 h-6">
                      <span className="text-[9px] font-mono text-[#6c6e75]">H</span>
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
                    </label>
                  </div>

                  {/* Rotation & Depth */}
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <label className="flex items-center gap-1 bg-[#1a1b1e] border border-[#2a2c30] rounded px-1.5 h-6">
                      <span className="text-[9px] font-mono text-[#6c6e75]">R°</span>
                      <input
                        type="number"
                        className="w-full bg-transparent text-[9.5px] text-[#d8d9dc] outline-none font-mono"
                        value={Math.round(selectedLayer.transform.rotation || 0)}
                        onChange={(e) =>
                          handleTransformChange("rotation", parseFloat(e.target.value))
                        }
                        data-testid="input-transform-rotation"
                      />
                    </label>
                    <label
                      className="flex items-center gap-1 bg-[#1a1b1e] border border-[#2a2c30] rounded px-1.5 h-6"
                      title="Z-Depth (Camera space layer plane)"
                    >
                      <span className="text-[9px] font-mono text-[#6c6e75]">Z</span>
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
                      <span className="text-[9px] font-mono text-[#38bdf8]">Tilt X°</span>
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
                      <span className="text-[9px] font-mono text-[#38bdf8]">Swivel Y°</span>
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
                        value={selectedLayer.mockupFrame || "none"}
                        onChange={(e) =>
                          updateLayer(selectedLayer.id, {
                            mockupFrame: e.target.value === "none" ? undefined : (e.target.value as any),
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
                      <span className="text-[9px] font-mono text-[#c5c7cc]">
                        {Math.round((selectedLayer.opacity ?? 1) * 100)}%
                      </span>
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
                </div>

                {/* TYPE-SPECIFIC SECTIONS */}

                {/* 1. SHAPE LAYER */}
                {selectedLayer.type === "shape" && (
                  <div className="pt-2 border-t border-[#202227] mb-3" data-testid="section-shape-props">
                    <span className="section-label mb-2">Shape Appearance</span>

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
                    <div className="field mb-2">
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
                          <span className="text-[8.5px] font-mono text-[#6c6e75]">px</span>
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
                  </div>
                )}

                {/* 2. TEXT LAYER */}
                {selectedLayer.type === "text" && (
                  <div className="pt-2 border-t border-[#202227] mb-3" data-testid="section-text-props">
                    <span className="section-label mb-2">Typography</span>

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
                        <span className="text-[8.5px] font-mono text-[#6c6e75]">Size</span>
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
                            }`}
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
                            addAnimationBlock({
                              layerId: selectedLayer.id,
                              name: "Pop & Rise",
                              preset: "fade-in",
                              startFrame: start,
                              durationFrames: 24,
                              easing: "spring",
                              deltaY: -20,
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
                            addAnimationBlock({
                              layerId: selectedLayer.id,
                              name: "Punch Scale",
                              preset: "scale-spring",
                              startFrame: start,
                              durationFrames: 30,
                              easing: "spring",
                              scaleTo: 1.0,
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
                            addAnimationBlock({
                              layerId: selectedLayer.id,
                              name: "Kinetic Slide",
                              preset: "slide-left",
                              startFrame: start,
                              durationFrames: 25,
                              easing: "spring",
                              deltaX: 80,
                            });
                          }}
                        >
                          Kinetic Slide
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. IMAGE LAYER */}
                {selectedLayer.type === "image" && (
                  <div className="pt-2 border-t border-[#202227] mb-3" data-testid="section-image-props">
                    <span className="section-label mb-2">Image Source</span>

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
                  </div>
                )}

                {/* 4. GROUP LAYER */}
                {selectedLayer.type === "group" && (
                  <div className="pt-2 border-t border-[#202227] mb-3" data-testid="section-group-props">
                    <span className="section-label mb-2">Group Hierarchy</span>
                    <div className="text-[9px] text-[#8e9198] bg-[#1a1b1e] p-2 rounded border border-[#2a2c30]">
                      Child layers are transformed relative to canvas coordinates enclosed in this group container.
                    </div>
                  </div>
                )}
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
                    <p className="text-[8.5px] text-[#63666d] max-w-[170px] leading-relaxed mb-3">
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
                                      defaultVal = selectedLayer.rotation ?? 0;
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
                                      <span className="field-label text-[8px]">Frame</span>
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
                                      <span className="field-label text-[8px]">Value</span>
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

                      return (
                      <div
                        key={block.id}
                        className="bg-[#15171b] border border-[#23262c] rounded p-2.5 flex flex-col gap-2.5 shadow-sm"
                      >
                        {/* Block Header with Preset Action Menu */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded bg-[#1e293b] text-[#38bdf8] border border-[#0369a1]/40 font-mono text-[8.5px] font-medium capitalize">
                              {typeof block.preset === "string"
                                ? block.preset.replace(/-/g, " ")
                                : (block.preset as any)?.label || (block.preset as any)?.id || "effect"}
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
                            <span className="field-label text-[8.5px]">Start Frame</span>
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
                            <span className="field-label text-[8.5px]">End Frame</span>
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
