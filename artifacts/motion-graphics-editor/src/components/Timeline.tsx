import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  CirclePlay,
  Pause,
  Plus,
  Layers,
  Sparkles,
  ChevronRight,
  MoveHorizontal,
  Trash2,
  Lock,
  Eye,
  EyeOff,
  Type as TypeIcon,
  Square,
  Image as ImageIcon,
  Folder,
  Camera as CameraIcon,
  AlertTriangle,
  Diamond,
  Film,
  ChevronLeft,
  Sun,
  Volume2,
  VolumeX,
  Music,
} from "lucide-react";
import { SceneFilmstrip } from "./SceneFilmstrip";
import { decodeAudioFile, syncAudioPlayback, stopAudioPlayback } from "../lib/audio-manager";
import { useEditorStore, useEditorUIStore, type Layer } from "../store/editor-store";
import {
  type AnimationBlock,
  type PresetAnimationBlock,
  type BlockPreset,
  type AnimatableProperty,
  type Keyframe,
  type KeyframeTrackBlock,
  BLOCK_PRESETS,
  isKeyframeTrack,
  sampleKeyframeTrack,
} from "../store/animation-blocks";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface DragBlockState {
  blockId: string;
  type: "move" | "resize-left" | "resize-right";
  startClientX: number;
  initialStartFrame: number;
  initialEndFrame: number;
}

export function Timeline() {
  const playing = useEditorUIStore((s) => s.playing);
  const setPlaying = useEditorUIStore((s) => s.setPlaying);
  const currentFrame = useEditorUIStore((s) => s.currentFrame);
  const setCurrentFrame = useEditorUIStore((s) => s.setCurrentFrame);
  const isCameraSelected = useEditorUIStore((s) => s.isCameraSelected);
  const setIsCameraSelected = useEditorUIStore((s) => s.setIsCameraSelected);
  const isLightSelected = useEditorUIStore((s) => s.isLightSelected);
  const setIsLightSelected = useEditorUIStore((s) => s.setIsLightSelected);
  const activeTool = useEditorUIStore((s) => s.activeTool);
  const setActiveTool = useEditorUIStore((s) => s.setActiveTool);
  const timelineViewLevel = useEditorUIStore((s) => s.timelineViewLevel);
  const setTimelineViewLevel = useEditorUIStore((s) => s.setTimelineViewLevel);
  const isCameraActive = isCameraSelected || activeTool === "camera";
  const scenes = useEditorStore((s) => s.scenes);
  const activeSceneId = useEditorStore((s) => s.activeSceneId);
  const activeSceneIndex = scenes.findIndex((s) => s.id === activeSceneId);
  const selectedLayerIds = useEditorStore((s) => s.selectedLayerIds);
  const selectLayers = useEditorStore((s) => s.selectLayers);
  const updateSceneLighting = useEditorStore((s) => s.updateSceneLighting);
  const addAnimationBlock = useEditorStore((s) => s.addAnimationBlock);
  const updateAnimationBlock = useEditorStore((s) => s.updateAnimationBlock);
  const removeAnimationBlock = useEditorStore((s) => s.removeAnimationBlock);
  const addKeyframeTrack = useEditorStore((s) => s.addKeyframeTrack);
  const addKeyframe = useEditorStore((s) => s.addKeyframe);
  const updateKeyframe = useEditorStore((s) => s.updateKeyframe);
  const removeKeyframe = useEditorStore((s) => s.removeKeyframe);
  const toggleLayerVisibility = useEditorStore((s) => s.toggleLayerVisibility);
  const toggleLayerLock = useEditorStore((s) => s.toggleLayerLock);
  const setAudioTrack = useEditorStore((s) => s.setAudioTrack);
  const updateAudioTrack = useEditorStore((s) => s.updateAudioTrack);
  const removeAudioTrack = useEditorStore((s) => s.removeAudioTrack);

  const timelineZoom = useEditorUIStore((s) => s.timelineZoom);
  const setTimelineZoom = useEditorUIStore((s) => s.setTimelineZoom);
  const [expandedLayers, setExpandedLayers] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    layerId: string | null;
    frame: number;
  } | null>(null);

  const audioFileInputRef = useRef<HTMLInputElement>(null);
  const audioDragRef = useRef<{ startX: number; initialOffset: number } | null>(null);
  const [isDraggingAudio, setIsDraggingAudio] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const leftHeadersRef = useRef<HTMLDivElement>(null);
  const isSyncingScrollRef = useRef(false);
  const dragRef = useRef<DragBlockState | null>(null);
  const isScrubbingRef = useRef(false);

  const handleTracksScroll = () => {
    if (isSyncingScrollRef.current) return;
    if (scrollContainerRef.current && leftHeadersRef.current) {
      if (Math.abs(leftHeadersRef.current.scrollTop - scrollContainerRef.current.scrollTop) > 0.5) {
        isSyncingScrollRef.current = true;
        leftHeadersRef.current.scrollTop = scrollContainerRef.current.scrollTop;
        isSyncingScrollRef.current = false;
      }
    }
  };

  const handleHeadersScroll = () => {
    if (isSyncingScrollRef.current) return;
    if (scrollContainerRef.current && leftHeadersRef.current) {
      if (Math.abs(scrollContainerRef.current.scrollTop - leftHeadersRef.current.scrollTop) > 0.5) {
        isSyncingScrollRef.current = true;
        scrollContainerRef.current.scrollTop = leftHeadersRef.current.scrollTop;
        isSyncingScrollRef.current = false;
      }
    }
  };

  const activeScene = scenes.find((s) => s.id === activeSceneId) || scenes[0];
  const durationFrames = activeScene?.durationFrames || 180;
  const fps = activeScene?.fps || 30;
  const layers = activeScene?.layers || [];
  const animationBlocks = activeScene?.animationBlocks || [];
  const cameraBlocks = animationBlocks.filter(
    (b): b is PresetAnimationBlock => !isKeyframeTrack(b) && (b.preset === "camera-move" || b.layerId === null),
  );
  const hasDeviceMockup = layers.some((l) => Boolean(l.mockup && l.mockup !== "none"));
  const isLightActive = isLightSelected;

  // Zoom to pxPerFrame mapping: zoom 0 = 2px, zoom 50 = 6px, zoom 100 = 16px
  const zoomNum = timelineZoom ?? 54;
  const pxPerFrame = Math.max(1.5, 2 + (zoomNum / 100) * 12);
  const totalWidth = Math.max(800, durationFrames * pxPerFrame + 120);

  // Time formatting
  const formatTime = (frame: number) => {
    const totalSeconds = frame / fps;
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    const sub = Math.floor((totalSeconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, "0")}.${sub.toString().padStart(2, "0")}`;
  };

  const formatTimeSecondsOnly = (frame: number) => {
    const totalSeconds = frame / fps;
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Synchronize soundtrack audio playback with canvas timeline playhead
  useEffect(() => {
    syncAudioPlayback(
      activeScene?.audioTrack,
      playing,
      currentFrame,
      activeScene?.fps || 30,
    );
  }, [playing, currentFrame, activeScene?.audioTrack, activeScene?.fps]);

  // Stop soundtrack audio playback on unmount
  useEffect(() => {
    return () => {
      stopAudioPlayback();
    };
  }, []);

  // Convert clientX in ruler/tracks to frame
  const getFrameFromClientX = useCallback(
    (clientX: number) => {
      if (!scrollContainerRef.current) return 0;
      const rect = scrollContainerRef.current.getBoundingClientRect();
      const scrollLeft = scrollContainerRef.current.scrollLeft;
      const offsetX = clientX - rect.left + scrollLeft;
      const frame = Math.round(offsetX / pxPerFrame);
      return Math.max(0, Math.min(durationFrames, frame));
    },
    [pxPerFrame, durationFrames],
  );

  // Ruler scrub handlers
  const handleRulerPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    isScrubbingRef.current = true;
    (e.target as Element).setPointerCapture(e.pointerId);
    const frame = getFrameFromClientX(e.clientX);
    setCurrentFrame(frame);
  };

  const handleRulerPointerMove = (e: React.PointerEvent) => {
    if (isScrubbingRef.current) {
      const frame = getFrameFromClientX(e.clientX);
      setCurrentFrame(frame);
    }
  };

  const handleRulerPointerUp = (e: React.PointerEvent) => {
    if (isScrubbingRef.current) {
      isScrubbingRef.current = false;
      try {
        (e.target as Element).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

  // Global block drag handlers
  const startBlockDrag = (
    e: React.PointerEvent,
    block: AnimationBlock,
    type: "move" | "resize-left" | "resize-right",
  ) => {
    e.stopPropagation();
    if (e.button !== 0) return;

    if (block.layerId) {
      selectLayers([block.layerId]);
    }

    dragRef.current = {
      blockId: block.id,
      type,
      startClientX: e.clientX,
      initialStartFrame: block.startFrame,
      initialEndFrame: block.endFrame,
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!dragRef.current) return;
      const { blockId, type, startClientX, initialStartFrame, initialEndFrame } =
        dragRef.current;
      const deltaPixels = moveEvent.clientX - startClientX;
      const deltaFrames = Math.round(deltaPixels / pxPerFrame);

      if (type === "move") {
        const duration = initialEndFrame - initialStartFrame;
        let newStart = initialStartFrame + deltaFrames;
        newStart = Math.max(0, Math.min(durationFrames - duration, newStart));
        const newEnd = newStart + duration;
        updateAnimationBlock(blockId, {
          startFrame: newStart,
          endFrame: newEnd,
        });
      } else if (type === "resize-left") {
        let newStart = initialStartFrame + deltaFrames;
        newStart = Math.max(0, Math.min(initialEndFrame - 1, newStart));
        updateAnimationBlock(blockId, { startFrame: newStart });
      } else if (type === "resize-right") {
        let newEnd = initialEndFrame + deltaFrames;
        newEnd = Math.max(initialStartFrame + 1, Math.min(durationFrames, newEnd));
        updateAnimationBlock(blockId, { endFrame: newEnd });
      }
    };

    const handlePointerUp = () => {
      dragRef.current = null;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  // Add camera block helper
  const handleAddCameraBlock = () => {
    const start = Math.min(durationFrames - 10, currentFrame);
    const end = Math.min(durationFrames, start + 45);
    addAnimationBlock(activeSceneId, {
      layerId: null,
      preset: "camera-move",
      startFrame: start,
      endFrame: end,
      easing: "ease-in-out",
      cameraTo: { x: 200, y: 0, z: 300, fov: 0 },
    });
    selectLayers([]);
  };

  // Add block helper
  const handleAddBlock = (layerId: string | null, preset: BlockPreset) => {
    if (preset === "camera-move" || !layerId) {
      handleAddCameraBlock();
      return;
    }
    const start = Math.min(durationFrames - 10, currentFrame);
    const end = Math.min(durationFrames, start + 30);
    addAnimationBlock(activeSceneId, {
      layerId,
      preset,
      startFrame: start,
      endFrame: end,
      easing: "ease-in-out",
    });
    selectLayers([layerId]);
  };

  const startKeyframeDrag = (
    e: React.PointerEvent,
    track: KeyframeTrackBlock,
    initialFrame: number,
  ) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {}

    const startClientX = e.clientX;
    let lastFrame = initialFrame;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaPixels = moveEvent.clientX - startClientX;
      const deltaFrames = Math.round(deltaPixels / pxPerFrame);
      const newFrame = Math.max(0, Math.min(durationFrames, initialFrame + deltaFrames));
      if (newFrame !== lastFrame) {
        updateKeyframe(activeSceneId, track.id, lastFrame, { frame: newFrame });
        lastFrame = newFrame;
      }
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      try {
        (e.target as Element).releasePointerCapture(upEvent.pointerId);
      } catch {}
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const getAnimatablePropertiesForLayer = (
    layer: Layer,
  ): { id: AnimatableProperty; label: string }[] => {
    const common: { id: AnimatableProperty; label: string }[] = [
      { id: "rotation", label: "Rotation" },
      { id: "opacity", label: "Opacity" },
      { id: "x", label: "Position X" },
      { id: "y", label: "Position Y" },
      { id: "width", label: "Width" },
      { id: "height", label: "Height" },
    ];
    if (layer.type === "shape") {
      common.push({ id: "fill", label: "Fill Color" });
      common.push({ id: "stroke", label: "Stroke Color" });
    } else if (layer.type === "text") {
      common.push({ id: "fill", label: "Text Color" });
      common.push({ id: "fontSize", label: "Font Size" });
    }
    return common;
  };

  const getPropertyValueAtFrame = (layer: Layer, property: AnimatableProperty) => {
    switch (property) {
      case "x":
        return layer.transform.x;
      case "y":
        return layer.transform.y;
      case "width":
        return layer.transform.width;
      case "height":
        return layer.transform.height;
      case "rotation":
        return layer.transform.rotation;
      case "opacity":
        return layer.opacity ?? 1;
      case "fill":
        return layer.shape?.fill ?? layer.text?.color ?? "#38bdf8";
      case "stroke":
        return layer.shape?.stroke ?? "#ffffff";
      case "fontSize":
        return layer.text?.fontSize ?? 32;
      default:
        return 0;
    }
  };

  const handleAddKeyframeToTrack = (
    track: KeyframeTrackBlock,
    targetFrame: number = currentFrame,
  ) => {
    const layer = layers.find((l) => l.id === track.layerId);
    if (!layer) return;
    const existingVal = sampleKeyframeTrack(track, targetFrame);
    const val =
      existingVal !== undefined
        ? existingVal
        : getPropertyValueAtFrame(layer, track.property);
    addKeyframe(activeSceneId, track.id, {
      frame: targetFrame,
      value: val,
      easing: "ease-in-out",
    });
  };

  const handleAddTrack = (layerId: string, property: AnimatableProperty) => {
    addKeyframeTrack(activeSceneId, layerId, property);
    setExpandedLayers((prev) => ({ ...prev, [layerId]: true }));
    selectLayers([layerId]);
  };

  // Track ruler tick intervals
  const majorTickStep = pxPerFrame >= 8 ? 15 : pxPerFrame >= 4 ? 30 : 60;
  const ticksCount = Math.ceil(durationFrames / majorTickStep);

  const getLayerIcon = (type: Layer["type"]) => {
    switch (type) {
      case "shape":
        return <Square size={11} className="text-[#38bdf8]" />;
      case "text":
        return <TypeIcon size={11} className="text-[#a78bfa]" />;
      case "image":
        return <ImageIcon size={11} className="text-[#34d399]" />;
      case "group":
        return <Folder size={11} className="text-[#f59e0b]" />;
      default:
        return <Layers size={11} className="text-[#94a3b8]" />;
    }
  };

  const getPresetColor = (preset: any) => {
    const p = typeof preset === "string" ? preset : preset?.id || "";
    if (p === "camera-move") return "bg-[#047857] border-[#10b981] text-[#ecfdf5]";
    if (p.startsWith("fade")) return "bg-[#0369a1] border-[#0284c7] text-[#e0f2fe]";
    if (p.startsWith("slide")) return "bg-[#4f46e5] border-[#6366f1] text-[#e0e7ff]";
    if (p.startsWith("scale")) return "bg-[#059669] border-[#10b981] text-[#ecfdf5]";
    return "bg-[#d97706] border-[#f59e0b] text-[#fef3c7]";
  };

  const getPresetLabel = (preset: any) => {
    if (typeof preset === "string") return preset.replace(/-/g, " ");
    if (preset && typeof preset === "object") {
      if (preset.label) return preset.label;
      if (preset.id) return String(preset.id).replace(/-/g, " ");
    }
    return "effect";
  };

  return (
    <section
      className="timeline flex flex-col h-full bg-[#0f1012] border-t border-[#191b1e] select-none"
      aria-label="Timeline"
    >
      {/* Timeline Top Control Bar */}
      <div className="timeline-top flex items-center justify-between px-3 h-9 border-b border-[#191b1e] bg-[#121316]">
        {/* Play/Pause & Frame Nav */}
        <div className="flex items-center gap-2">
          <button
            className="timeline-playhead-button p-1 rounded hover:bg-[#202227] text-[#d1d4dc] transition-colors"
            type="button"
            aria-label={playing ? "Pause timeline" : "Play timeline"}
            title={playing ? "Pause timeline" : "Play timeline"}
            data-testid="button-timeline-play"
            onClick={() => setPlaying((v) => !v)}
          >
            {playing ? (
              <Pause size={13} strokeWidth={2} className="text-[#38bdf8]" />
            ) : (
              <CirclePlay size={13} strokeWidth={2} />
            )}
          </button>

          {/* Time text / Current Frame readout */}
          <div className="flex items-center gap-2 pl-1 font-mono text-[9.5px]">
            <span
              className="time-zero text-[#9ca3af] font-medium"
              data-testid="text-time-zero"
            >
              {formatTimeSecondsOnly(currentFrame)}
            </span>
            <span className="text-[#4b5563]">/</span>
            <span className="text-[#6b7280]">
              {currentFrame}f ({durationFrames}f @ {fps}fps)
            </span>
          </div>
        </div>

        {/* Timeline View Level Switcher (Whole Video vs Scene Detail) */}
        <div className="flex items-center gap-1 bg-[#16181d] border border-[#232730] p-0.5 rounded-md">
          <button
            type="button"
            className={`px-2 py-0.5 rounded text-[9px] font-medium flex items-center gap-1 transition-colors ${
              timelineViewLevel === "all-scenes"
                ? "bg-[#0284c7] text-white shadow-sm font-semibold"
                : "text-[#94a3b8] hover:text-white"
            }`}
            onClick={() => setTimelineViewLevel("all-scenes")}
            data-testid="button-timeline-view-all-scenes"
            title="Zoomed-out Whole Video level: view and reorder all scenes"
          >
            <Film size={10} />
            <span>Whole Video</span>
          </button>
          <button
            type="button"
            className={`px-2 py-0.5 rounded text-[9px] font-medium flex items-center gap-1 transition-colors ${
              timelineViewLevel === "scene-detail"
                ? "bg-[#0284c7] text-white shadow-sm font-semibold"
                : "text-[#94a3b8] hover:text-white"
            }`}
            onClick={() => setTimelineViewLevel("scene-detail")}
            data-testid="button-timeline-view-scene-detail"
            title={`Zoomed-in Scene level: ${activeScene?.name || "Scene"}`}
          >
            <Layers size={10} />
            <span className="truncate max-w-[90px]">{activeScene?.name || "Scene"}</span>
          </button>
        </div>

        {/* Global Add Animation Block Dropdown */}
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="py-1 px-2.5 text-[9px] font-medium bg-[#1a1c20] hover:bg-[#24272e] text-[#cbd5e1] rounded border border-[#272a31] transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Plus size={10} strokeWidth={2} />
                <span>Add Effect</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-48 max-h-[300px] overflow-y-auto bg-[#14161a] border border-[#26282e] text-[#cfd3dc] text-[9.5px] min-w-[150px] shadow-2xl rounded-md p-1 outline-none"
            >
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
                    onClick={() =>
                      handleAddBlock(
                        selectedLayerIds.length === 1 ? selectedLayerIds[0] : null,
                        preset.id,
                      )
                    }
                  >
                    <span className="capitalize">{preset.label}</span>
                    <span className="text-[7.5px] text-[#4b5563] font-mono">preset</span>
                  </DropdownMenuItem>
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Zoom Slider Control */}
          <label
            className="zoom-control flex items-center gap-1.5 text-[8.5px] text-[#717684] hover:text-[#94a3b8] transition-colors select-none cursor-pointer"
            aria-label="Timeline zoom"
          >
            <span>Zoom</span>
            <input
              className="timeline-range cursor-pointer"
              type="range"
              min="0"
              max="100"
              value={timelineZoom}
              onChange={(e) => setTimelineZoom(parseInt(e.target.value, 10) || 0)}
              data-testid="input-timeline-zoom"
              title={`Timeline zoom: ${timelineZoom}%`}
            />
          </label>
        </div>
      </div>

      {/* Timeline Main Split Layout: Whole Video Filmstrip vs Single Scene Detail */}
      {timelineViewLevel === "all-scenes" ? (
        <SceneFilmstrip />
      ) : (
        <div className="timeline-body flex flex-1 min-h-0 relative overflow-hidden bg-[#0c0d0f]">
          {/* Left Dimmed Margin (click to step back out to All Scenes) */}
          {activeSceneIndex > 0 && (
            <button
              type="button"
              className="w-6 flex-shrink-0 bg-[#080a0d] hover:bg-[#121722] border-r border-[#1e2330] flex flex-col items-center justify-center text-[#64748b] hover:text-[#38bdf8] transition-colors cursor-pointer z-30 group select-none"
              onClick={() => setTimelineViewLevel("all-scenes")}
              title={`Click dimmed area to return to Whole Video (◀ ${scenes[activeSceneIndex - 1]?.name})`}
              data-testid="button-dimmed-margin-left"
            >
              <ChevronLeft size={13} className="group-hover:-translate-x-0.5 transition-transform" />
              <span className="text-[7.5px] font-mono [writing-mode:vertical-rl] rotate-180 mt-1 uppercase tracking-wider text-[#475569] group-hover:text-[#38bdf8]">
                All Scenes
              </span>
            </button>
          )}

          {/* Left Track Headers Column */}
          <div className="timeline-headers-sidebar w-40 flex-shrink-0 flex flex-col border-r border-[#191b1e] bg-[#111215] z-10">
          {/* Header ruler placeholder */}
          <div className="h-6 flex items-center px-2.5 border-b border-[#191b1e] bg-[#131518] text-[8.5px] font-medium text-[#64748b] tracking-wider uppercase">
            <span>Layers ({layers.length})</span>
          </div>

          {/* Pinned Camera Lane Header */}
          <div
            className={`h-7 px-2 flex items-center justify-between border-b border-[#20252e] text-[9.5px] transition-colors cursor-pointer ${
              isCameraActive
                ? "bg-[#064e3b]/80 border-l-2 border-l-[#10b981] text-[#34d399] font-medium"
                : "bg-[#0d151c] hover:bg-[#131d27] text-[#6ee7b7]"
            }`}
            data-testid="timeline-camera-lane-header"
            onClick={() => {
              selectLayers([]);
              setIsLightSelected(false);
              setIsCameraSelected(true);
              setActiveTool("camera");
            }}
            title="Camera Track: click to view Camera settings & Focus control"
          >
            <div className="flex items-center gap-1.5 truncate">
              <CameraIcon size={11} className={`${isCameraActive ? "text-[#34d399]" : "text-[#10b981]"} flex-shrink-0`} />
              <span className={`font-medium ${isCameraActive ? "text-[#ecfdf5]" : "text-[#e2e8f0]"}`}>Camera</span>
              {cameraBlocks.length > 0 && (
                <span className="px-1 py-0.2 rounded-full bg-[#064e3b] text-[#34d399] text-[7.5px] font-mono">
                  {cameraBlocks.length}
                </span>
              )}
            </div>

            {/* Add Camera Move Block Picker */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="w-4 h-4 rounded hover:bg-[#134e4a] text-[#34d399] hover:text-[#a7f3d0] flex items-center justify-center transition-colors"
                  title="Add camera move block"
                  data-testid="button-add-camera-block-lane"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Plus size={10} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-48 bg-[#14161a] border border-[#26282e] text-[#cfd3dc] text-[9.5px] min-w-[150px] shadow-2xl rounded-md p-1 outline-none"
              >
                <DropdownMenuLabel className="text-[8px] uppercase tracking-wider text-[#34d399] font-mono px-2 py-1.5 flex items-center justify-between border-b border-[#1c1f26] mb-1">
                  <span className="flex items-center gap-1.5">
                    <CameraIcon size={9} />
                    <span>Camera Track</span>
                  </span>
                  <span className="text-[7.5px] text-[#4b5563] font-sans font-normal lowercase tracking-normal">motion</span>
                </DropdownMenuLabel>
                <DropdownMenuItem
                  className="cursor-pointer hover:bg-[#064e3b] hover:text-[#6ee7b7] focus:bg-[#064e3b] focus:text-[#6ee7b7] px-2 py-1.5 rounded-[3px] flex items-center justify-between text-[9.5px] text-[#cbd5e1] transition-colors"
                  onClick={() => handleAddCameraBlock()}
                >
                  <span>Camera Move (Pan / Zoom)</span>
                  <span className="text-[7.5px] text-[#10b981]/70 font-mono">block</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Pinned Light Lane Header (conditionally visible when scene has device mockup) */}
          {hasDeviceMockup && (
            <div
              className={`h-7 px-2 flex items-center justify-between border-b border-[#20252e] text-[9.5px] transition-colors cursor-pointer ${
                isLightActive
                  ? "bg-[#854d0e]/60 border-l-2 border-l-[#eab308] text-[#fde047] font-medium"
                  : "bg-[#0d151c] hover:bg-[#181a1d] text-[#eab308]"
              }`}
              data-testid="timeline-light-lane-header"
              onClick={() => {
                selectLayers([]);
                setIsCameraSelected(false);
                setIsLightSelected(true);
              }}
              title="Light Track: Studio Illumination & Shadows for device mockups"
            >
              <div className="flex items-center gap-1.5 truncate">
                <Sun size={11} className={`${isLightActive ? "text-[#fde047]" : "text-[#eab308]"} flex-shrink-0`} />
                <span className={`font-medium ${isLightActive ? "text-[#fef08a]" : "text-[#e2e8f0]"}`}>Light</span>
                <span className="px-1 py-0.2 rounded-full bg-[#713f12]/60 text-[#fde047] text-[7.5px] font-mono">
                  {Math.round((activeScene?.lighting?.intensity ?? 0.85) * 100)}%
                </span>
                {!(activeScene?.lighting?.enabled ?? true) && (
                  <span className="text-[7.5px] text-[#78716c] font-mono">(off)</span>
                )}
              </div>

              {/* Quick toggle lighting button */}
              <button
                type="button"
                className="w-4 h-4 rounded hover:bg-[#713f12] text-[#fde047] hover:text-[#fef08a] flex items-center justify-center transition-colors"
                title={(activeScene?.lighting?.enabled ?? true) ? "Disable Studio Illumination" : "Enable Studio Illumination"}
                data-testid="button-toggle-lighting-lane"
                onClick={(e) => {
                  e.stopPropagation();
                  updateSceneLighting({
                    enabled: !(activeScene?.lighting?.enabled ?? true),
                  });
                }}
              >
                <Sun size={10} />
              </button>
            </div>
          )}
          {/* Pinned Audio Lane Header */}
          <div
            className="h-7 px-2 flex items-center justify-between border-b border-[#20252e] text-[9.5px] bg-[#161226]/90 transition-colors"
            data-testid="timeline-audio-lane-header"
            title="Audio Soundtrack Track"
          >
            <div className="flex items-center gap-1.5 truncate">
              <Music size={11} className="text-[#a78bfa] flex-shrink-0" />
              <span className="font-medium text-[#f5f3ff] truncate max-w-[70px]">
                {activeScene?.audioTrack?.name || "Audio"}
              </span>
              {activeScene?.audioTrack && (
                <span className="text-[7.5px] text-[#c4b5fd]/70 font-mono">
                  {activeScene.audioTrack.duration.toFixed(1)}s
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {activeScene?.audioTrack ? (
                <>
                  <button
                    type="button"
                    className="w-4 h-4 rounded hover:bg-[#2e1065] text-[#c4b5fd] hover:text-white flex items-center justify-center transition-colors"
                    title={activeScene.audioTrack.muted ? "Unmute audio" : "Mute audio"}
                    onClick={() =>
                      updateAudioTrack(activeSceneId, {
                        muted: !activeScene.audioTrack?.muted,
                      })
                    }
                    data-testid="button-toggle-audio-mute"
                  >
                    {activeScene.audioTrack.muted ? (
                      <VolumeX size={10} className="text-rose-400" />
                    ) : (
                      <Volume2 size={10} />
                    )}
                  </button>
                  <button
                    type="button"
                    className="w-4 h-4 rounded hover:bg-[#4c0519] text-[#f43f5e] hover:text-[#fda4af] flex items-center justify-center transition-colors"
                    title="Remove audio track"
                    onClick={() => removeAudioTrack(activeSceneId)}
                    data-testid="button-remove-audio-track"
                  >
                    <Trash2 size={9} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="w-4 h-4 rounded hover:bg-[#2e1065] text-[#a78bfa] hover:text-white flex items-center justify-center transition-colors"
                    title="Add soundtrack (.mp3, .wav)"
                    onClick={() => audioFileInputRef.current?.click()}
                    data-testid="button-add-audio-track"
                  >
                    <Plus size={10} />
                  </button>
                  <input
                    ref={audioFileInputRef}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        try {
                          const decoded = await decodeAudioFile(file);
                          setAudioTrack(activeSceneId, {
                            id: `audio-${Date.now()}`,
                            name: file.name.replace(/\.[^/.]+$/, ""),
                            url: decoded.url,
                            duration: decoded.duration,
                            volume: 1,
                            muted: false,
                            offsetFrames: 0,
                            waveformData: decoded.waveformData,
                          });
                        } catch (err) {
                          console.warn("Failed to load audio file:", err);
                        }
                      }
                    }}
                  />
                </>
              )}
            </div>
          </div>

          {/* Layer Row Headers */}
          <div
            id="timeline-headers-container"
            ref={leftHeadersRef}
            onScroll={handleHeadersScroll}
            className="flex-1 overflow-y-auto overflow-x-hidden select-none scrollbar-none"
          >
            {layers.map((layer) => {
              const isSelected = selectedLayerIds.includes(layer.id);
              const isExpanded = !!expandedLayers[layer.id];
              const layerBlocks = animationBlocks.filter(
                (b) => b.layerId === layer.id,
              );
              const keyframeTracks = layerBlocks.filter(isKeyframeTrack);
              const availableProps = getAnimatablePropertiesForLayer(layer);

              return (
                <React.Fragment key={layer.id}>
                  <div
                    className={`h-7 px-2 flex items-center justify-between border-b border-[#18191c] text-[9.5px] transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-[#182836] text-[#60c5ff] font-medium"
                        : "hover:bg-[#15171b] text-[#9ca3af]"
                    }`}
                    onClick={() => selectLayers([layer.id])}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <button
                        type="button"
                        className="w-3.5 h-3.5 flex items-center justify-center text-[#6b7280] hover:text-[#e5e7eb] rounded transition-transform"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedLayers((prev) => ({ ...prev, [layer.id]: !prev[layer.id] }));
                        }}
                        title={isExpanded ? "Collapse keyframes" : "Expand keyframes"}
                        data-testid={`toggle-expand-${layer.id}`}
                      >
                        <ChevronRight
                          size={10}
                          className={`transition-transform duration-150 ${isExpanded ? "rotate-90 text-[#38bdf8]" : ""}`}
                        />
                      </button>
                      {getLayerIcon(layer.type)}
                      <span className="truncate max-w-[65px]">{layer.name}</span>
                      {keyframeTracks.length > 0 && (
                        <span
                          className="px-1 py-0.2 rounded bg-[#0369a1]/40 border border-[#0284c7]/50 text-[#38bdf8] text-[7px] font-mono flex items-center gap-0.5"
                          title={`${keyframeTracks.length} keyframe track${keyframeTracks.length > 1 ? "s" : ""}`}
                          data-testid={`badge-kf-count-${layer.id}`}
                        >
                          <Diamond size={6} className="fill-[#38bdf8]" />
                          {keyframeTracks.length}
                        </span>
                      )}
                    </div>

                    {/* Add Preset or Keyframe Track dropdown */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="w-4 h-4 rounded hover:bg-[#252830] text-[#6b7280] hover:text-[#d1d5db] flex items-center justify-center transition-colors"
                          title="Add animation block or keyframe track"
                          onClick={(e) => e.stopPropagation()}
                          data-testid={`add-menu-${layer.id}`}
                        >
                          <Plus size={10} />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="start"
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
                          {availableProps.map((prop) => {
                            const hasTrack = keyframeTracks.some((t) => t.property === prop.id);
                            return (
                              <DropdownMenuItem
                                key={prop.id}
                                className="cursor-pointer hover:bg-[#1a2c3d] hover:text-[#38bdf8] focus:bg-[#1a2c3d] focus:text-[#38bdf8] px-2 py-1.5 rounded-[3px] flex items-center justify-between text-[9.5px] text-[#cbd5e1] transition-colors"
                                onClick={() => handleAddTrack(layer.id, prop.id)}
                                data-testid={`menu-add-kf-${layer.id}-${prop.id}`}
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
                          {BLOCK_PRESETS.filter((p) => p.id !== "camera-move").map((preset) => (
                            <DropdownMenuItem
                              key={preset.id}
                              className="cursor-pointer hover:bg-[#20242e] hover:text-white focus:bg-[#20242e] focus:text-white px-2 py-1.5 rounded-[3px] flex items-center justify-between text-[9.5px] text-[#cbd5e1] transition-colors"
                              onClick={() => handleAddBlock(layer.id, preset.id)}
                            >
                              <span className="capitalize">{preset.label}</span>
                              <span className="text-[7.5px] text-[#4b5563] font-mono">preset</span>
                            </DropdownMenuItem>
                          ))}
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Expanded Keyframe Sub-track Headers */}
                  {isExpanded && (
                    <div className="bg-[#0b0d10] border-b border-[#181a1e]">
                      {keyframeTracks.map((track) => (
                        <div
                          key={track.id}
                          className="h-6 pl-5 pr-2 flex items-center justify-between border-b border-[#14161a] text-[8px] text-[#9ca3af] hover:bg-[#101317]"
                          title={`Keyframe track for ${track.property}`}
                          data-testid={`subtrack-header-${track.id}`}
                        >
                          <div className="flex items-center gap-1 truncate">
                            <Diamond size={7} className="text-[#38bdf8] fill-[#0284c7]" />
                            <span className="uppercase font-mono text-[7.5px] text-[#cbd5e1]">
                              {track.property}
                            </span>
                            <span className="text-[#64748b] text-[7px]">
                              ({track.keyframes.length})
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              className="w-3.5 h-3.5 rounded hover:bg-[#1e293b] text-[#38bdf8] flex items-center justify-center"
                              title="Add keyframe at current frame"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddKeyframeToTrack(track, currentFrame);
                              }}
                              data-testid={`button-add-keyframe-${track.id}`}
                            >
                              <Plus size={8} />
                            </button>
                            <button
                              type="button"
                              className="w-3.5 h-3.5 rounded hover:bg-[#450a0a] text-[#ef4444] hover:text-[#f87171] flex items-center justify-center"
                              title="Delete track"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeAnimationBlock(track.id);
                              }}
                              data-testid={`button-delete-track-${track.id}`}
                            >
                              <Trash2 size={7.5} />
                            </button>
                          </div>
                        </div>
                      ))}

                      {keyframeTracks.length === 0 && (
                        <div className="h-6 px-3 text-[7.5px] text-[#64748b] flex items-center justify-between">
                          <span>No tracks</span>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="text-[#38bdf8] hover:underline flex items-center gap-0.5"
                                data-testid={`btn-quick-add-track-${layer.id}`}
                              >
                                <Plus size={7} /> Add track
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="start"
                              className="w-44 max-h-[260px] overflow-y-auto bg-[#14161a] border border-[#26282e] text-[#cfd3dc] text-[9.5px] min-w-[130px] shadow-2xl rounded-md p-1 outline-none"
                            >
                              <DropdownMenuLabel className="text-[8px] uppercase tracking-wider text-[#38bdf8] font-mono px-2 py-1.5 flex items-center justify-between border-b border-[#1c1f26] mb-1">
                                <span className="flex items-center gap-1.5">
                                  <Diamond size={8} className="fill-[#0284c7] text-[#38bdf8]" />
                                  <span>Add Track</span>
                                </span>
                              </DropdownMenuLabel>
                              <div className="space-y-0.5">
                                {availableProps.map((prop) => (
                                  <DropdownMenuItem
                                    key={prop.id}
                                    className="cursor-pointer hover:bg-[#1a2c3d] hover:text-[#38bdf8] focus:bg-[#1a2c3d] focus:text-[#38bdf8] px-2 py-1.5 rounded-[3px] flex items-center justify-between text-[9.5px] text-[#cbd5e1] transition-colors"
                                    onClick={() => handleAddTrack(layer.id, prop.id)}
                                  >
                                    <span>{prop.label}</span>
                                  </DropdownMenuItem>
                                ))}
                              </div>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </div>
                  )}
                </React.Fragment>
              );
            })}

            {layers.length === 0 && (
              <div className="p-4 text-center text-[9px] text-[#4b5563]">
                No layers in scene.
              </div>
            )}
          </div>
        </div>

        {/* Right Scrollable Tracks & Frame Ruler */}
        <div
          id="timeline-tracks-container"
          ref={scrollContainerRef}
          onScroll={handleTracksScroll}
          onWheel={(e) => {
            if (e.shiftKey && scrollContainerRef.current) {
              scrollContainerRef.current.scrollLeft += e.deltaY || e.deltaX;
            }
          }}
          className="flex-1 overflow-x-auto overflow-y-auto relative select-none scrollbar-studio"
        >
          <div style={{ width: `${totalWidth}px`, height: "100%" }} className="relative">
            {/* Frame Ruler Header */}
            <div
              className="h-6 border-b border-[#191b1e] bg-[#14161a] relative cursor-pointer flex items-center"
              onPointerDown={handleRulerPointerDown}
              onPointerMove={handleRulerPointerMove}
              onPointerUp={handleRulerPointerUp}
            >
              {/* Ruler ticks */}
              {Array.from({ length: ticksCount + 1 }).map((_, i) => {
                const tickFrame = i * majorTickStep;
                if (tickFrame > durationFrames) return null;
                const leftPx = tickFrame * pxPerFrame;

                return (
                  <div
                    key={tickFrame}
                    className="timeline-ruler-tick absolute top-0 bottom-0 flex flex-col justify-end pointer-events-none"
                    style={{ left: `${leftPx}px` }}
                  >
                    <span className="text-[7.5px] font-mono text-[#71717a] font-medium leading-none mb-1 -translate-x-1/2">
                      {formatTimeSecondsOnly(tickFrame)}
                    </span>
                    <div className="h-1.5 w-[1px] bg-[#52525b]" />
                  </div>
                );
              })}
            </div>

            {/* Pinned Camera Lane Track */}
            <div
              className={`h-7 border-b border-[#20252e] relative cursor-pointer transition-colors ${
                isCameraActive ? "bg-[#064e3b]/25" : "bg-[#0c131a]/80"
              }`}
              data-testid="timeline-camera-lane-track"
              onClick={() => {
                selectLayers([]);
                setIsLightSelected(false);
                setIsCameraSelected(true);
                setActiveTool("camera");
              }}
            >
              {/* Frame grid markings */}
              {Array.from({ length: ticksCount + 1 }).map((_, i) => {
                const tickFrame = i * majorTickStep;
                if (tickFrame > durationFrames) return null;
                return (
                  <div
                    key={`cam-grid-${tickFrame}`}
                    className="absolute top-0 bottom-0 w-[1px] bg-[#1a2332]/40 pointer-events-none"
                    style={{ left: `${tickFrame * pxPerFrame}px` }}
                  />
                );
              })}

              {/* Camera Animation Blocks */}
              {cameraBlocks.map((block) => {
                const left = block.startFrame * pxPerFrame;
                const width = Math.max(
                  16,
                  (block.endFrame - block.startFrame) * pxPerFrame,
                );
                const isOverlapping = cameraBlocks.some(
                  (other) =>
                    other.id !== block.id &&
                    other.startFrame < block.endFrame &&
                    other.endFrame > block.startFrame,
                );

                return (
                  <div
                    key={block.id}
                    className={`absolute top-1 bottom-1 rounded border shadow-sm flex items-center justify-between px-1.5 cursor-grab active:cursor-grabbing text-[8px] font-medium select-none overflow-hidden transition-all bg-[#047857]/90 hover:bg-[#059669] border-[#10b981] text-[#ecfdf5] hover:brightness-110 z-10 ${
                      isOverlapping
                        ? "ring-1 ring-amber-400 !border-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.4)]"
                        : ""
                    }`}
                    style={{
                      left: `${left}px`,
                      width: `${width}px`,
                    }}
                    title={
                      isOverlapping
                        ? "Overlapping camera blocks compose additively"
                        : undefined
                    }
                    data-testid={`camera-block-${block.id}`}
                    onPointerDown={(e) => startBlockDrag(e, block, "move")}
                    onClick={(e) => {
                      e.stopPropagation();
                      selectLayers([]);
                      setIsLightSelected(false);
                      setIsCameraSelected(true);
                      setActiveTool("camera");
                    }}
                  >
                    {/* Left resize handle */}
                    <div
                      className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/40 z-10"
                      onPointerDown={(e) =>
                        startBlockDrag(e, block, "resize-left")
                      }
                    />

                    {/* Block label */}
                    <span className="truncate pointer-events-none flex items-center gap-1">
                      <CameraIcon size={9} className="flex-shrink-0 text-[#a7f3d0]" />
                      <span>Camera Move</span>
                      {block.cameraTo && (
                        <span className="text-[7px] text-[#a7f3d0]/80 hidden sm:inline">
                          ({block.cameraTo.z !== undefined && block.cameraTo.z !== 0 ? `Z:${block.cameraTo.z > 0 ? "+" : ""}${block.cameraTo.z}` : `X:${block.cameraTo.x ?? 0}`})
                        </span>
                      )}
                      {isOverlapping && (
                        <span
                          className="ml-1 inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-amber-500/30 text-amber-200 text-[6.5px] font-semibold uppercase tracking-wider"
                          data-testid={`camera-overlap-warning-${block.id}`}
                        >
                          <AlertTriangle size={7} className="text-amber-300" />
                          <span>Overlap</span>
                        </span>
                      )}
                    </span>

                    {/* Right resize handle */}
                    <div
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/40 z-10"
                      onPointerDown={(e) =>
                        startBlockDrag(e, block, "resize-right")
                      }
                    />
                  </div>
                );
              })}
            </div>

            {/* Pinned Light Lane Track (conditionally visible when scene has device mockup) */}
            {hasDeviceMockup && (
              <div
                className={`h-7 border-b border-[#20252e] relative cursor-pointer transition-colors ${
                  isLightActive ? "bg-[#713f12]/25" : "bg-[#0c131a]/80"
                }`}
                data-testid="timeline-light-lane-track"
                onClick={() => {
                  selectLayers([]);
                  setIsCameraSelected(false);
                  setIsLightSelected(true);
                }}
              >
                {/* Frame grid markings */}
                {Array.from({ length: ticksCount + 1 }).map((_, i) => {
                  const tickFrame = i * majorTickStep;
                  if (tickFrame > durationFrames) return null;
                  return (
                    <div
                      key={`light-grid-${tickFrame}`}
                      className="absolute top-0 bottom-0 w-[1px] bg-[#1a2332]/40 pointer-events-none"
                      style={{ left: `${tickFrame * pxPerFrame}px` }}
                    />
                  );
                })}

                {/* Studio Lighting span block across scene */}
                <div
                  className={`absolute top-1 bottom-1 rounded border shadow-sm flex items-center justify-between px-2 text-[8px] font-medium select-none overflow-hidden transition-all ${
                    (activeScene?.lighting?.enabled ?? true)
                      ? "bg-[#854d0e]/85 hover:bg-[#a16207] border-[#ca8a04] text-[#fef08a]"
                      : "bg-[#292524]/80 hover:bg-[#44403c] border-[#78716c] text-[#a8a29e]"
                  } z-10`}
                  style={{
                    left: 0,
                    width: `${durationFrames * pxPerFrame}px`,
                  }}
                  title={`Direct Studio Illumination: ${(activeScene?.lighting?.enabled ?? true) ? "Enabled" : "Disabled"}, Intensity: ${Math.round((activeScene?.lighting?.intensity ?? 0.85) * 100)}%, Light X: ${activeScene?.lighting?.lightX ?? -300}, Light Y: ${activeScene?.lighting?.lightY ?? -450}`}
                  data-testid="timeline-light-span-block"
                  onClick={(e) => {
                    e.stopPropagation();
                    selectLayers([]);
                    setIsCameraSelected(false);
                    setIsLightSelected(true);
                  }}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <Sun size={9} className={(activeScene?.lighting?.enabled ?? true) ? "text-[#fde047]" : "text-[#78716c]"} />
                    <span className="truncate">
                      Studio Illumination &bull; {Math.round((activeScene?.lighting?.intensity ?? 0.85) * 100)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-1 font-mono text-[7.5px] opacity-80 flex-shrink-0">
                    <span>X:{activeScene?.lighting?.lightX ?? -300}</span>
                    <span>Y:{activeScene?.lighting?.lightY ?? -450}</span>
                  </div>
                </div>
              </div>
            )}
            {/* Pinned Audio Lane Track */}
            <div
              className="h-7 border-b border-[#20252e] relative bg-[#120e20]/80 overflow-hidden"
              data-testid="timeline-audio-lane-track"
            >
              {/* Frame grid markings */}
              {Array.from({ length: ticksCount + 1 }).map((_, i) => {
                const tickFrame = i * majorTickStep;
                if (tickFrame > durationFrames) return null;
                return (
                  <div
                    key={`audio-grid-${tickFrame}`}
                    className="absolute top-0 bottom-0 w-[1px] bg-[#2e1065]/30 pointer-events-none"
                    style={{ left: `${tickFrame * pxPerFrame}px` }}
                  />
                );
              })}

              {/* Audio Waveform Clip */}
              {activeScene?.audioTrack && (() => {
                const track = activeScene.audioTrack;
                const audioLeft = (track.offsetFrames || 0) * pxPerFrame;
                const audioWidth = Math.max(30, (track.duration * fps) * pxPerFrame);

                return (
                  <div
                    className="absolute top-1 bottom-1 rounded border border-[#8b5cf6]/80 bg-[#4c1d95]/70 hover:bg-[#5b21b6]/80 text-[#ede9fe] shadow-sm flex items-center px-1 cursor-grab active:cursor-grabbing text-[8px] font-medium select-none overflow-hidden transition-all z-10"
                    style={{
                      left: `${audioLeft}px`,
                      width: `${audioWidth}px`,
                    }}
                    title={`${track.name} (${track.duration.toFixed(1)}s) - Drag horizontally to sync beat`}
                    data-testid="timeline-audio-waveform-clip"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      audioDragRef.current = {
                        startX: e.clientX,
                        initialOffset: track.offsetFrames || 0,
                      };
                      setIsDraggingAudio(true);

                      const onPointerMove = (moveEvent: PointerEvent) => {
                        if (!audioDragRef.current) return;
                        const deltaPx = moveEvent.clientX - audioDragRef.current.startX;
                        const deltaFrames = Math.round(deltaPx / pxPerFrame);
                        const newOffset = audioDragRef.current.initialOffset + deltaFrames;
                        updateAudioTrack(activeSceneId, { offsetFrames: newOffset });
                      };

                      const onPointerUp = () => {
                        audioDragRef.current = null;
                        setIsDraggingAudio(false);
                        window.removeEventListener("pointermove", onPointerMove);
                        window.removeEventListener("pointerup", onPointerUp);
                      };

                      window.addEventListener("pointermove", onPointerMove);
                      window.addEventListener("pointerup", onPointerUp);
                    }}
                  >
                    {/* SVG Waveform Visualization */}
                    <div className="absolute inset-0 flex items-center px-1 opacity-80 pointer-events-none">
                      <svg
                        className="w-full h-4"
                        preserveAspectRatio="none"
                        viewBox={`0 0 ${track.waveformData?.length || 100} 24`}
                      >
                        {(track.waveformData || []).map((peak, idx) => {
                          const barHeight = Math.max(2, peak * 22);
                          const y = (24 - barHeight) / 2;
                          return (
                            <rect
                              key={idx}
                              x={idx}
                              y={y}
                              width="0.85"
                              height={barHeight}
                              fill={track.muted ? "#94a3b8" : "#c4b5fd"}
                              rx="0.3"
                            />
                          );
                        })}
                      </svg>
                    </div>

                    {/* Audio Title badge */}
                    <span className="relative z-10 px-1 py-0.5 rounded bg-[#2e1065]/90 text-[7.5px] font-mono text-[#f5f3ff] truncate border border-[#7c3aed]/40 flex items-center gap-1">
                      <Music size={7} className="text-[#a78bfa]" />
                      <span>{track.name}</span>
                      {track.offsetFrames !== 0 && (
                        <span className="text-[#c4b5fd]/80">
                          ({track.offsetFrames > 0 ? `+${track.offsetFrames}` : track.offsetFrames}f)
                        </span>
                      )}
                    </span>
                  </div>
                );
              })()}

              {!activeScene?.audioTrack && (
                <div
                  className="absolute inset-0 flex items-center px-3 text-[8px] text-[#7c3aed]/70 italic cursor-pointer hover:text-[#c4b5fd] transition-colors"
                  onClick={() => audioFileInputRef.current?.click()}
                >
                  <span>+ Click to import soundtrack audio file (.mp3, .wav, .m4a) with waveform sync</span>
                </div>
              )}
            </div>

            {/* Per-Layer Lanes Container */}
            <div className="relative">
              {/* Horizontal lane rows */}
              {layers.map((layer) => {
                const isSelected = selectedLayerIds.includes(layer.id);
                const isExpanded = !!expandedLayers[layer.id];
                const layerBlocks = animationBlocks.filter(
                  (b) => b.layerId === layer.id,
                );
                const presetBlocks = layerBlocks.filter((b) => !isKeyframeTrack(b));
                const keyframeTracks = layerBlocks.filter(isKeyframeTrack);

                return (
                  <React.Fragment key={layer.id}>
                    <div
                      className={`h-7 border-b border-[#16171a] relative transition-colors ${
                        isSelected ? "bg-[#131b24]/40" : "hover:bg-[#121417]"
                      }`}
                      onClick={() => selectLayers([layer.id])}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        const frame = getFrameFromClientX(e.clientX);
                        handleAddBlock(layer.id, "fade-in");
                      }}
                    >
                      {/* Grid background vertical lines */}
                      {Array.from({ length: ticksCount + 1 }).map((_, i) => {
                        const tickFrame = i * majorTickStep;
                        if (tickFrame > durationFrames) return null;
                        return (
                          <div
                            key={tickFrame}
                            className="absolute top-0 bottom-0 w-[1px] bg-[#18191d]"
                            style={{ left: `${tickFrame * pxPerFrame}px` }}
                          />
                        );
                      })}

                      {/* Animation Block Chips on this lane */}
                      {presetBlocks.map((block) => {
                        const left = block.startFrame * pxPerFrame;
                        const width = Math.max(
                          16,
                          (block.endFrame - block.startFrame) * pxPerFrame,
                        );
                        const colorClass = getPresetColor(block.preset);
                        const isOverlapping = presetBlocks.some(
                          (other) =>
                            other.id !== block.id &&
                            other.startFrame < block.endFrame &&
                            other.endFrame > block.startFrame,
                        );

                        return (
                          <div
                            key={block.id}
                            className={`absolute top-1 bottom-1 rounded border shadow-sm flex items-center justify-between px-1.5 cursor-grab active:cursor-grabbing text-[8px] font-medium select-none overflow-hidden transition-all ${colorClass} hover:brightness-110 ${
                              isOverlapping
                                ? "ring-1 ring-amber-400 !border-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.4)]"
                                : ""
                            }`}
                            style={{
                              left: `${left}px`,
                              width: `${width}px`,
                            }}
                            title={
                              isOverlapping
                                ? "Overlapping blocks: effects compose additively on this layer"
                                : undefined
                            }
                            data-testid={`layer-block-${block.id}`}
                            onPointerDown={(e) => startBlockDrag(e, block, "move")}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (block.layerId) selectLayers([block.layerId]);
                            }}
                          >
                            {/* Left resize handle */}
                            <div
                              className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 z-10"
                              onPointerDown={(e) =>
                                startBlockDrag(e, block, "resize-left")
                              }
                            />

                            {/* Block label */}
                            <span className="truncate pointer-events-none capitalize flex items-center gap-1">
                              <span>{getPresetLabel(block.preset)}</span>
                              {isOverlapping && (
                                <span
                                  className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-amber-500/30 text-amber-200 text-[6.5px] font-semibold uppercase tracking-wider"
                                  data-testid={`layer-overlap-warning-${block.id}`}
                                >
                                  <AlertTriangle size={7} className="text-amber-300" />
                                  <span>Overlap</span>
                                </span>
                              )}
                            </span>

                            {/* Right resize handle */}
                            <div
                              className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 z-10"
                              onPointerDown={(e) =>
                                startBlockDrag(e, block, "resize-right")
                              }
                            />
                          </div>
                        );
                      })}
                    </div>

                    {/* Keyframe Sub-track Lanes */}
                    {isExpanded && (
                      <div className="bg-[#08090b]/90 border-b border-[#181a1e]">
                        {keyframeTracks.map((track) => (
                          <div
                            key={track.id}
                            className="h-6 border-b border-[#14161a] relative cursor-crosshair hover:bg-[#0f1217] transition-colors"
                            onClick={(e) => {
                              if ((e.target as HTMLElement).closest("[data-keyframe-diamond]")) return;
                              const frame = getFrameFromClientX(e.clientX);
                              handleAddKeyframeToTrack(track, frame);
                            }}
                            title="Click anywhere on track to add a keyframe"
                            data-testid={`subtrack-lane-${track.id}`}
                          >
                            {/* Grid vertical lines */}
                            {Array.from({ length: ticksCount + 1 }).map((_, i) => {
                              const tickFrame = i * majorTickStep;
                              if (tickFrame > durationFrames) return null;
                              return (
                                <div
                                  key={tickFrame}
                                  className="absolute top-0 bottom-0 w-[1px] bg-[#14161a]"
                                  style={{ left: `${tickFrame * pxPerFrame}px` }}
                                />
                              );
                            })}

                            {/* Center track guide line */}
                            <div className="absolute left-0 right-0 top-1/2 h-[1px] bg-[#1a1e24] -translate-y-1/2 pointer-events-none" />

                            {/* Connecting line between keyframes */}
                            {track.keyframes.length >= 2 && (
                              <div
                                className="absolute top-1/2 h-[2px] bg-[#0284c7]/70 -translate-y-1/2 pointer-events-none"
                                style={{
                                  left: `${track.keyframes[0].frame * pxPerFrame}px`,
                                  width: `${Math.max(0, (track.keyframes[track.keyframes.length - 1].frame - track.keyframes[0].frame) * pxPerFrame)}px`,
                                }}
                              />
                            )}

                            {/* Diamond markers */}
                            {track.keyframes.map((kf) => (
                              <div
                                key={`${track.id}-${kf.frame}`}
                                data-keyframe-diamond="true"
                                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45 bg-[#0284c7] hover:bg-[#38bdf8] border border-[#38bdf8] hover:scale-125 shadow-[0_0_6px_rgba(56,189,248,0.7)] cursor-ew-resize transition-transform z-10"
                                style={{ left: `${kf.frame * pxPerFrame}px` }}
                                title={`Frame ${kf.frame}: ${kf.value} (${kf.easing}) - Drag to reposition, double-click to delete`}
                                data-testid={`keyframe-diamond-${track.id}-${kf.frame}`}
                                onPointerDown={(e) => startKeyframeDrag(e, track, kf.frame)}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  removeKeyframe(activeSceneId, track.id, kf.frame);
                                }}
                              />
                            ))}
                          </div>
                        ))}

                        {keyframeTracks.length === 0 && (
                          <div className="h-6 flex items-center px-3 text-[7.5px] text-[#475569]">
                            No property tracks yet. Add a track to begin keyframing.
                          </div>
                        )}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}

              {/* Playhead Vertical Line with Head Handle */}
              <div
                className="playhead absolute top-[-24px] bottom-0 w-[1.5px] bg-[#38bdf8] pointer-events-none z-20"
                style={{
                  left: `${currentFrame * pxPerFrame}px`,
                  height: `calc(100% + 24px)`,
                }}
                data-testid="timeline-playhead"
              >
                {/* Needle scrubber cap */}
                <div className="absolute top-0 left-[-4px] w-2.5 h-3 bg-[#38bdf8] rounded-t-sm shadow-md flex items-center justify-center">
                  <div className="w-0.5 h-1.5 bg-[#082f49] rounded-full" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Dimmed Margin (click to step back out to All Scenes) */}
        {activeSceneIndex < scenes.length - 1 && (
          <button
            type="button"
            className="w-6 flex-shrink-0 bg-[#080a0d] hover:bg-[#121722] border-l border-[#1e2330] flex flex-col items-center justify-center text-[#64748b] hover:text-[#38bdf8] transition-colors cursor-pointer z-30 group select-none"
            onClick={() => setTimelineViewLevel("all-scenes")}
            title={`Click dimmed area to return to Whole Video (${scenes[activeSceneIndex + 1]?.name} ▶)`}
            data-testid="button-dimmed-margin-right"
          >
            <ChevronRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
            <span className="text-[7.5px] font-mono [writing-mode:vertical-rl] mt-1 uppercase tracking-wider text-[#475569] group-hover:text-[#38bdf8]">
              All Scenes
            </span>
          </button>
        )}
      </div>
    )}
  </section>
);
}
