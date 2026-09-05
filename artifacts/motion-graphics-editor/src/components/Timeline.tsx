import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  Play,
  Pause,
  SkipBack,
  Plus,
  Layers,
  ChevronRight,
  Trash2,
  Square,
  Type as TypeIcon,
  Image as ImageIcon,
  Folder,
  Camera as CameraIcon,
  Diamond,
  Film,
  Sun,
  Music,
  Copy,
  Edit2,
  MoreVertical,
  ZoomIn,
  ZoomOut,
  Sparkles,
} from "lucide-react";
import { decodeAudioFile, syncAudioPlayback, stopAudioPlayback } from "../lib/audio-manager";
import { useEditorStore, useEditorUIStore, type Layer, type Scene } from "../store/editor-store";
import { useTimelineViewStore } from "../store/timeline-view-store";
import {
  type AnimationBlock,
  type PresetAnimationBlock,
  type BlockPreset,
  type AnimatableProperty,
  type KeyframeTrackBlock,
  BLOCK_PRESETS,
  isKeyframeTrack,
  sampleKeyframeTrack,
} from "../store/animation-blocks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export type TrackLayerType =
  | 'shot'
  | 'shape'
  | 'text'
  | 'image'
  | 'audio'
  | 'animation'
  | 'camera-zoom'
  | 'light-key'
  | 'effect';

export interface TimelineClip {
  id: string;
  name: string;
  startFrame: number;
  durationFrames: number;
  type: TrackLayerType;
}

export interface TimelineTrack {
  id: string;
  name: string;
  type: TrackLayerType;
  clips: TimelineClip[];
}

export const LAYER_CONFIG: Record<TrackLayerType, { varName: string; border: string; bg: string; text?: string }> = {
  shot: { varName: 'var(--color-shot)', border: 'border-shot/60', bg: 'bg-shot/15' },
  shape: { varName: 'var(--color-shape)', border: 'border-[var(--color-shape)]/60', bg: 'bg-[var(--color-shape)]/15' },
  text: { varName: 'var(--color-text)', border: 'border-[var(--color-text)]/60', bg: 'bg-[var(--color-text)]/15', text: 'text-text' },
  image: { varName: 'var(--color-primary)', border: 'border-primary/60', bg: 'bg-primary/15' },
  audio: { varName: 'var(--color-audio-track)', border: 'border-[var(--color-audio-track)]/60', bg: 'bg-audio-track/15' },
  animation: { varName: 'var(--color-animation)', border: 'border-animation/60', bg: 'bg-animation/15', text: 'text-animation' },
  'camera-zoom': { varName: 'var(--color-brand-green)', border: 'border-camera-zoom/60', bg: 'bg-camera-zoom/15' },
  'light-key': { varName: 'var(--color-brand-amber)', border: 'border-light-key/60', bg: 'bg-light-key/15', text: 'text-light-key' },
  effect: { varName: 'var(--color-effect)', border: 'border-effect/60', bg: 'bg-effect/15', text: 'text-effect' },
};

interface DragBlockState {
  sceneId: string;
  blockId: string;
  type: "move" | "resize-left" | "resize-right";
  startClientX: number;
  initialStartFrame: number;
  initialEndFrame: number;
}

interface SceneTrimState {
  sceneId: string;
  edge: "start" | "end";
  startX: number;
  initialDuration: number;
}

interface HoveredEmptySlot {
  layerId: string;
  frame: number;
  leftPx: number;
  widthPx: number;
}

interface EffectPickerSlot {
  layerId: string;
  frame: number;
  leftPx: number;
  topPx: number;
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

  const scenes = useEditorStore((s) => s.scenes);
  const activeSceneId = useEditorStore((s) => s.activeSceneId);
  const setActiveScene = useEditorStore((s) => s.setActiveScene);
  const addScene = useEditorStore((s) => s.addScene);
  const updateScene = useEditorStore((s) => s.updateScene);
  const deleteScene = useEditorStore((s) => s.deleteScene);
  const duplicateScene = useEditorStore((s) => s.duplicateScene);
  const addLayer = useEditorStore((s) => s.addLayer);
  const removeLayer = useEditorStore((s) => s.removeLayer);
  const selectedLayerIds = useEditorStore((s) => s.selectedLayerIds);
  const selectLayers = useEditorStore((s) => s.selectLayers);
  const addAnimationBlock = useEditorStore((s) => s.addAnimationBlock);
  const updateAnimationBlock = useEditorStore((s) => s.updateAnimationBlock);
  const removeAnimationBlock = useEditorStore((s) => s.removeAnimationBlock);
  const addKeyframeTrack = useEditorStore((s) => s.addKeyframeTrack);
  const addKeyframe = useEditorStore((s) => s.addKeyframe);
  const updateKeyframe = useEditorStore((s) => s.updateKeyframe);
  const removeKeyframe = useEditorStore((s) => s.removeKeyframe);
  const setAudioTrack = useEditorStore((s) => s.setAudioTrack);
  const updateAudioTrack = useEditorStore((s) => s.updateAudioTrack);
  const removeAudioTrack = useEditorStore((s) => s.removeAudioTrack);

  const pxPerMs = useTimelineViewStore((s) => s.pxPerMs);
  const setViewportPx = useTimelineViewStore((s) => s.setViewportPx);
  const setTotalDurationMs = useTimelineViewStore((s) => s.setTotalDurationMs);
  const setScrollMs = useTimelineViewStore((s) => s.setScrollMs);
  const applyZoom = useTimelineViewStore((s) => s.applyZoom);
  const setFit = useTimelineViewStore((s) => s.setFit);

  // State to toggle whether nested assets stack is visible under scenes
  const [assetsVisible, setAssetsVisible] = useState(true);

  const [expandedLayers, setExpandedLayers] = useState<Record<string, boolean>>({});
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [editSceneName, setEditSceneName] = useState("");

  const [sceneTrimState, setSceneTrimState] = useState<SceneTrimState | null>(null);
  const [hoveredEmptySlot, setHoveredEmptySlot] = useState<HoveredEmptySlot | null>(null);
  const [effectPickerSlot, setEffectPickerSlot] = useState<EffectPickerSlot | null>(null);
  const [hoveredRulerFrame, setHoveredRulerFrame] = useState<number | null>(null);
  const [activeDragFeedback, setActiveDragFeedback] = useState<{
    blockId: string;
    type: "move" | "resize-left" | "resize-right";
    startFrame: number;
    endFrame: number;
    duration: number;
  } | null>(null);

  const audioFileInputRef = useRef<HTMLInputElement>(null);
  const audioTargetSceneIdRef = useRef<string | null>(null);
  const audioDragRef = useRef<{ startX: number; initialOffset: number; sceneId: string } | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const leftHeadersRef = useRef<HTMLDivElement>(null);
  const isSyncingScrollRef = useRef(false);
  const dragRef = useRef<DragBlockState | null>(null);
  const isScrubbingRef = useRef(false);

  // Active scene fallback
  const activeScene = scenes.find((s) => s.id === activeSceneId) || scenes[0] || {
    id: "default",
    name: "Scene 1",
    durationFrames: 180,
    fps: 30,
    layers: [],
    animationBlocks: [],
    camera: { x: 0, y: 0, z: 800, fov: 45, focusDistance: 800 },
    effects: [],
    effectsOrder: [],
  };

  const fps = activeScene?.fps || 30;

  // Compute horizontal sequential layout for all scenes (beside each other)
  let accumulatedFrames = 0;
  const sceneSequence = scenes.map((scene) => {
    const duration = Math.max(15, scene.durationFrames || 180);
    const startFrame = accumulatedFrames;
    const endFrame = startFrame + duration;
    accumulatedFrames += duration;
    return {
      scene,
      startFrame,
      endFrame,
      duration,
    };
  });

  const totalSequenceFrames = Math.max(180, accumulatedFrames);

  // Find active scene start frame and span
  const activeSequenceItem =
    sceneSequence.find((item) => item.scene.id === activeSceneId) ||
    sceneSequence[0] || {
      scene: activeScene,
      startFrame: 0,
      endFrame: activeScene.durationFrames || 180,
      duration: activeScene.durationFrames || 180,
    };

  const activeSceneStartFrame = activeSequenceItem.startFrame;
  const activeSceneDuration = activeSequenceItem.duration;

  // Derive pxPerFrame from store's pxPerMs and the active scene's fps
  // ms = frame / fps * 1000, so px = timeMs * pxPerMs = (frame / fps * 1000) * pxPerMs
  const pxPerFrame = pxPerMs > 0 ? (1000 / fps) * pxPerMs : 0;
  const totalDurationMs = (totalSequenceFrames / fps) * 1000;
  const totalWidth = Math.max(800, totalDurationMs * pxPerMs + 240);

  // Synchronize soundtrack audio playback with canvas timeline playhead
  useEffect(() => {
    syncAudioPlayback(
      activeScene?.audioTrack,
      playing,
      currentFrame,
      activeScene?.fps || 30,
    );
  }, [playing, currentFrame, activeScene?.audioTrack, activeScene?.fps]);

  useEffect(() => {
    return () => {
      stopAudioPlayback();
    };
  }, []);

  // ResizeObserver on scroll container to update viewportPx
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setViewportPx(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportPx(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [setViewportPx]);

  // Sync totalDurationMs into the store whenever it changes
  useEffect(() => {
    setTotalDurationMs(totalDurationMs);
  }, [totalDurationMs, setTotalDurationMs]);

  // Mirror scrollLeft → scrollMs on user scroll
  const handleTracksScroll = useCallback(() => {
    if (isSyncingScrollRef.current) return;
    if (scrollContainerRef.current && leftHeadersRef.current) {
      if (Math.abs(leftHeadersRef.current.scrollTop - scrollContainerRef.current.scrollTop) > 0.5) {
        isSyncingScrollRef.current = true;
        leftHeadersRef.current.scrollTop = scrollContainerRef.current.scrollTop;
        isSyncingScrollRef.current = false;
      }
    }
    if (pxPerMs > 0 && scrollContainerRef.current) {
      setScrollMs(scrollContainerRef.current.scrollLeft / pxPerMs);
    }
  }, [pxPerMs, setScrollMs]);

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

  // Sync scrollMs from store back to DOM scrollLeft (e.g. when setFit or applyZoom changes scrollMs)
  const scrollMs = useTimelineViewStore((s) => s.scrollMs);
  useEffect(() => {
    if (pxPerMs > 0 && scrollContainerRef.current) {
      const targetScrollLeft = scrollMs * pxPerMs;
      if (Math.abs(scrollContainerRef.current.scrollLeft - targetScrollLeft) > 0.5) {
        scrollContainerRef.current.scrollLeft = targetScrollLeft;
      }
    }
  }, [scrollMs, pxPerMs]);

  // Ctrl/Cmd + wheel zoom on the tracks container
  const handleTracksWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const el = scrollContainerRef.current;
      if (!el) return;
      const store = useTimelineViewStore.getState();
      const rect = el.getBoundingClientRect();
      const timeUnderCursor = store.scrollMs + (e.clientX - rect.left) / store.pxPerMs;
      const candidate = store.pxPerMs * (1 - e.deltaY * 0.001);
      store.applyZoom(candidate, timeUnderCursor);
    },
    [],
  );

  const formatTime = (frame: number) => {
    const totalSecs = frame / fps;
    const mins = Math.floor(totalSecs / 60);
    const secs = Math.floor(totalSecs % 60);
    const remFrames = frame % fps;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}:${remFrames.toString().padStart(2, "0")}`;
  };

  // Convert clientX in ruler/tracks to global frame
  const getFrameFromClientX = useCallback(
    (clientX: number) => {
      if (!scrollContainerRef.current) return 0;
      const rect = scrollContainerRef.current.getBoundingClientRect();
      const scrollLeft = scrollContainerRef.current.scrollLeft;
      const offsetX = clientX - rect.left + scrollLeft;
      const frame = Math.round(offsetX / pxPerFrame);
      return Math.max(0, Math.min(totalSequenceFrames, frame));
    },
    [pxPerFrame, totalSequenceFrames],
  );

  // Ruler scrub handlers
  const handleRulerPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    isScrubbingRef.current = true;
    (e.target as Element).setPointerCapture(e.pointerId);
    const frame = getFrameFromClientX(e.clientX);
    setCurrentFrame(frame);

    // Auto-select scene that contains this frame
    const matchingScene = sceneSequence.find(
      (item) => frame >= item.startFrame && frame <= item.endFrame,
    );
    if (matchingScene && matchingScene.scene.id !== activeSceneId) {
      setActiveScene(matchingScene.scene.id);
    }
  };

  const handleRulerPointerMove = (e: React.PointerEvent) => {
    if (isScrubbingRef.current) {
      const frame = getFrameFromClientX(e.clientX);
      setCurrentFrame(frame);

      const matchingScene = sceneSequence.find(
        (item) => frame >= item.startFrame && frame <= item.endFrame,
      );
      if (matchingScene && matchingScene.scene.id !== activeSceneId) {
        setActiveScene(matchingScene.scene.id);
      }
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

  // Fit timeline zoom to view container width
  const handleFitToView = () => {
    setFit();
  };

  // Global block drag handlers
  const startBlockDrag = (
    e: React.PointerEvent,
    sceneId: string,
    block: AnimationBlock,
    type: "move" | "resize-left" | "resize-right",
    sceneDuration: number,
  ) => {
    e.stopPropagation();
    if (e.button !== 0) return;

    setActiveScene(sceneId);
    if (block.layerId) {
      selectLayers([block.layerId]);
    }

    dragRef.current = {
      sceneId,
      blockId: block.id,
      type,
      startClientX: e.clientX,
      initialStartFrame: block.startFrame,
      initialEndFrame: block.endFrame,
    };

    setActiveDragFeedback({
      blockId: block.id,
      type,
      startFrame: block.startFrame,
      endFrame: block.endFrame,
      duration: block.endFrame - block.startFrame,
    });

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!dragRef.current) return;
      const { blockId, type, startClientX, initialStartFrame, initialEndFrame } =
        dragRef.current;
      const deltaPixels = moveEvent.clientX - startClientX;
      const deltaFrames = Math.round(deltaPixels / pxPerFrame);

      if (type === "move") {
        const duration = initialEndFrame - initialStartFrame;
        let newStart = initialStartFrame + deltaFrames;
        newStart = Math.max(0, Math.min(sceneDuration - duration, newStart));
        const newEnd = newStart + duration;
        setActiveDragFeedback({
          blockId,
          type,
          startFrame: newStart,
          endFrame: newEnd,
          duration,
        });
        updateAnimationBlock(blockId, {
          startFrame: newStart,
          endFrame: newEnd,
        });
      } else if (type === "resize-left") {
        let newStart = initialStartFrame + deltaFrames;
        newStart = Math.max(0, Math.min(initialEndFrame - 1, newStart));
        setActiveDragFeedback({
          blockId,
          type,
          startFrame: newStart,
          endFrame: initialEndFrame,
          duration: initialEndFrame - newStart,
        });
        updateAnimationBlock(blockId, { startFrame: newStart });
      } else if (type === "resize-right") {
        let newEnd = initialEndFrame + deltaFrames;
        newEnd = Math.max(initialStartFrame + 1, Math.min(sceneDuration, newEnd));
        setActiveDragFeedback({
          blockId,
          type,
          startFrame: initialStartFrame,
          endFrame: newEnd,
          duration: newEnd - initialStartFrame,
        });
        updateAnimationBlock(blockId, { endFrame: newEnd });
      }
    };

    const handlePointerUp = () => {
      dragRef.current = null;
      setActiveDragFeedback(null);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  // Scene Trim Handler
  const handleSceneTrimStart = (
    e: React.PointerEvent,
    scene: Scene,
    edge: "start" | "end",
  ) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const initialDur = scene.durationFrames || 180;
    setSceneTrimState({
      sceneId: scene.id,
      edge,
      startX: e.clientX,
      initialDuration: initialDur,
    });

    const handleTrimMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - e.clientX;
      const deltaFrames = Math.round(deltaX / pxPerFrame);
      let newDuration = initialDur;
      if (edge === "end") {
        newDuration = Math.max(15, initialDur + deltaFrames);
      } else {
        newDuration = Math.max(15, initialDur - deltaFrames);
      }
      updateScene(scene.id, { durationFrames: newDuration });
    };

    const handleTrimUp = (upEvent: PointerEvent) => {
      setSceneTrimState(null);
      window.removeEventListener("pointermove", handleTrimMove);
      window.removeEventListener("pointerup", handleTrimUp);
    };

    window.addEventListener("pointermove", handleTrimMove);
    window.addEventListener("pointerup", handleTrimUp);
  };

  // Add camera block helper
  const handleAddCameraBlock = (sceneId: string, sceneDuration: number) => {
    setActiveScene(sceneId);
    const start = Math.min(sceneDuration - 10, currentFrame);
    const end = Math.min(sceneDuration, start + 45);
    addAnimationBlock(sceneId, {
      layerId: null,
      preset: "camera-move",
      startFrame: start,
      endFrame: end,
      easing: "ease-in-out",
      cameraTo: { x: 200, y: 0, z: 300, fov: 0 },
    });
    selectLayers([]);
    setIsLightSelected(false);
    setIsCameraSelected(true);
    setActiveTool("camera");
  };

  // Add block helper
  const handleAddBlock = (sceneId: string, layerId: string | null, preset: BlockPreset, sceneDuration: number, customStart?: number) => {
    setActiveScene(sceneId);
    if (preset === "camera-move" || !layerId) {
      handleAddCameraBlock(sceneId, sceneDuration);
      return;
    }
    const start = customStart !== undefined ? customStart : Math.min(sceneDuration - 10, currentFrame);
    const end = Math.min(sceneDuration, start + 30);
    addAnimationBlock(sceneId, {
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
    sceneId: string,
    track: KeyframeTrackBlock,
    initialFrame: number,
    sceneDuration: number,
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
      const newFrame = Math.max(0, Math.min(sceneDuration, initialFrame + deltaFrames));
      if (newFrame !== lastFrame) {
        updateKeyframe(sceneId, track.id, lastFrame, { frame: newFrame });
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
    scene: Scene,
    track: KeyframeTrackBlock,
    targetFrame: number = currentFrame,
  ) => {
    const layer = scene.layers.find((l) => l.id === track.layerId);
    if (!layer) return;
    const existingVal = sampleKeyframeTrack(track, targetFrame);
    const val =
      existingVal !== undefined
        ? existingVal
        : getPropertyValueAtFrame(layer, track.property);
    addKeyframe(scene.id, track.id, {
      frame: targetFrame,
      value: val,
      easing: "ease-in-out",
    });
  };

  const handleAddTrack = (sceneId: string, layerId: string, property: AnimatableProperty) => {
    setActiveScene(sceneId);
    addKeyframeTrack(sceneId, layerId, property);
    setExpandedLayers((prev) => ({ ...prev, [layerId]: true }));
    selectLayers([layerId]);
  };

  // Pointer move inside a layer track to detect empty spots and show dotted insertion line
  const handleLayerTrackPointerMove = (e: React.PointerEvent, layer: Layer) => {
    if (!scrollContainerRef.current) return;
    const rect = scrollContainerRef.current.getBoundingClientRect();
    const scrollLeft = scrollContainerRef.current.scrollLeft;
    const clickX = e.clientX - rect.left + scrollLeft;
    const globalFrame = Math.round(clickX / pxPerFrame);
    const localFrame = globalFrame - activeSceneStartFrame;

    if (localFrame < 0 || localFrame >= activeSceneDuration) {
      setHoveredEmptySlot(null);
      return;
    }

    const layerBlocks = activeSceneBlocks.filter((b) => b.layerId === layer.id && !isKeyframeTrack(b));
    const isOverExistingBlock = layerBlocks.some(
      (b) => localFrame >= b.startFrame && localFrame <= b.endFrame,
    );

    if (isOverExistingBlock) {
      setHoveredEmptySlot(null);
    } else {
      const snapFrame = Math.max(0, Math.min(activeSceneDuration - 15, Math.floor(localFrame / 5) * 5));
      const effectWidthFrames = Math.min(30, activeSceneDuration - snapFrame);
      setHoveredEmptySlot({
        layerId: layer.id,
        frame: snapFrame,
        leftPx: (activeSceneStartFrame + snapFrame) * pxPerFrame,
        widthPx: effectWidthFrames * pxPerFrame,
      });
    }
  };

  // Ruler tick intervals
  const majorTickStep = pxPerFrame >= 8 ? 15 : pxPerFrame >= 4 ? 30 : 60;
  const ticksCount = Math.ceil(totalSequenceFrames / majorTickStep);

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

  const getClipType = (preset: any): TrackLayerType => {
    const p = typeof preset === "string" ? preset : preset?.id || "";
    if (p === "camera-move") return "camera-zoom";
    if (p.startsWith("fade") || p.startsWith("slide")) return "animation";
    if (p.startsWith("scale")) return "effect";
    return "animation";
  };

  const getPresetLabel = (preset: any) => {
    if (typeof preset === "string") return preset.replace(/-/g, " ");
    if (preset && typeof preset === "object") {
      if (preset.label) return preset.label;
      if (preset.id) return String(preset.id).replace(/-/g, " ");
    }
    return "effect";
  };

  // Active scene assets data
  const activeSceneLayers = activeScene.layers || [];
  const activeSceneBlocks = activeScene.animationBlocks || [];
  const activeCameraBlocks = activeSceneBlocks.filter(
    (b): b is PresetAnimationBlock => !isKeyframeTrack(b) && (b.preset === "camera-move" || b.layerId === null),
  );
  const activeHasMockup = activeSceneLayers.some((l) => Boolean(l.mockup && l.mockup !== "none"));
  const isCameraActiveInThisScene = isCameraSelected || activeTool === "camera";
  const isLightActiveInThisScene = isLightSelected;

  return (
    <div
      className="flex flex-col w-full h-full bg-background border-t border-border select-none font-sans min-h-0 relative overflow-hidden"
      aria-label="Timeline"
    >
      {/* Hidden audio input */}
      <input
        ref={audioFileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          const targetSceneId = audioTargetSceneIdRef.current || activeSceneId;
          if (file && targetSceneId) {
            try {
              const decoded = await decodeAudioFile(file);
              setAudioTrack(targetSceneId, {
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

      {/* 1. Transport Toolbar */}
      <div className="flex items-center justify-between h-9 px-3 bg-secondary/30 border-b border-border text-xs flex-shrink-0">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentFrame(0)}
            className="p-1.5 hover:bg-secondary/60 rounded text-muted-foreground hover:text-foreground transition-colors"
            title="Jump to Start"
          >
            <SkipBack className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setPlaying((v) => !v)}
            className="p-1.5 hover:bg-secondary/60 rounded text-foreground transition-colors"
            title={playing ? "Pause (Space)" : "Play (Space)"}
            data-testid="button-timeline-play"
          >
            {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5 fill-current" />}
          </Button>
          <div className="h-4 w-px bg-border mx-1" />
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {formatTime(currentFrame)}{" "}
            <span className="opacity-40">/</span> {formatTime(totalSequenceFrames)}
            <span className="opacity-50 ml-1.5 text-[10px]">({currentFrame}f)</span>
          </span>
        </div>

        {/* Center: Add Scene / Shot button + Assets Stack toggle */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => addScene()}
            className="px-2.5 py-1 rounded bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary hover:text-foreground text-[10px] font-semibold flex items-center gap-1 transition-colors shadow-xs"
            title="Add a new Scene/Shot to the timeline"
            data-testid="button-add-scene"
          >
            <Plus size={11} strokeWidth={2.5} />
            <span>Add Scene</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => setAssetsVisible((v) => !v)}
            className={`px-2.5 py-1 rounded border text-[10px] font-medium flex items-center gap-1 transition-colors ${
              assetsVisible
                ? "bg-input/30 border-primary/40 text-primary"
                : "bg-secondary/20 border-border text-muted-foreground hover:text-foreground"
            }`}
            title={assetsVisible ? "Hide nested assets (Double-click scene bar)" : "Show nested assets (Double-click scene bar)"}
          >
            <Layers size={11} />
            <span>{assetsVisible ? "Hide Assets" : "Show Assets"}</span>
          </Button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              const store = useTimelineViewStore.getState();
              const anchorTimeMs = store.scrollMs + (store.viewportPx / 2) / (store.pxPerMs || 1);
              applyZoom(store.pxPerMs * 0.8, anchorTimeMs);
            }}
            className="p-1 hover:bg-secondary/60 rounded text-muted-foreground hover:text-foreground transition-colors"
            title="Zoom Out (Cmd -)"
          >
            <ZoomOut className="size-3.5" />
          </Button>
          <span className="text-[10px] font-mono tabular-nums text-muted-foreground px-1">
            {pxPerMs > 0 ? `${Math.round((pxPerMs * 1000 / fps) * 10) / 10}x` : '0x'}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              const store = useTimelineViewStore.getState();
              const anchorTimeMs = store.scrollMs + (store.viewportPx / 2) / (store.pxPerMs || 1);
              applyZoom(store.pxPerMs * 1.25, anchorTimeMs);
            }}
            className="p-1 hover:bg-secondary/60 rounded text-muted-foreground hover:text-foreground transition-colors"
            title="Zoom In (Cmd +)"
          >
            <ZoomIn className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={handleFitToView}
            className="px-1.5 py-0.5 rounded hover:bg-secondary/60 border border-border text-muted-foreground hover:text-primary text-[9px] font-mono transition-colors ml-1"
            title="Fit sequence timeline to view"
          >
            Fit
          </Button>
        </div>
      </div>

      {/* Main Unified Timeline Body */}
      <div className="flex flex-1 min-h-0 relative overflow-hidden bg-canvas/90">
        {/* Left Track Headers Column */}
        <div className="w-36 sm:w-44 md:w-48 flex-shrink-0 flex flex-col border-r border-border bg-card/95 z-20 select-none shadow-xs">
          {/* Top ruler header */}
          <div className="h-7 flex items-center px-3 border-b border-border bg-card text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">
            <span>Tracks</span>
          </div>

          {/* Left Track Items */}
          <div
            ref={leftHeadersRef}
            onScroll={handleHeadersScroll}
            className="flex-1 overflow-y-auto overflow-x-hidden select-none scrollbar-none divide-y divide-border/60"
          >
            {/* Top Scenes Track Header */}
            <div className="h-10 px-3 flex items-center justify-between text-xs bg-secondary/30 border-b border-border text-foreground font-medium">
              <span className="font-semibold text-foreground text-[11px] truncate">Scenes / Shots</span>
              <Button
                variant="ghost"
                size="icon"
                type="button"
                onClick={() => addScene()}
                className="size-5 rounded hover:bg-secondary/60 text-primary hover:text-foreground flex items-center justify-center transition-colors"
                title="Add new scene"
              >
                <Plus size={12} />
              </Button>
            </div>

            {/* Nested Stack under the Scene timeline (Shown only when assetsVisible is true) */}
            {assetsVisible && (
              <div className="divide-y divide-border/60 animate-fadeIn">
                {/* Camera Lane Header */}
                <div
                  className={`h-9 px-3 flex items-center justify-between text-xs transition-colors cursor-pointer ${
                    isCameraActiveInThisScene
                      ? "bg-camera-zoom/20 border-l-2 border-l-camera-zoom text-camera-zoom font-medium"
                      : "bg-canvas/80 hover:bg-secondary/20 text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => {
                    selectLayers([]);
                    setIsLightSelected(false);
                    setIsCameraSelected(true);
                    setActiveTool("camera");
                  }}
                  title="Camera Track: Shot 3D Pan, Tilt, Dolly & Focus"
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <CameraIcon size={12} className={isCameraActiveInThisScene ? "text-camera-zoom" : "text-camera-zoom/80"} />
                    <span className="text-[11px] font-medium">Camera</span>
                    {activeCameraBlocks.length > 0 && (
                      <span className="px-1 py-0.2 rounded-full bg-camera-zoom/30 text-camera-zoom text-[8px] font-mono">
                        {activeCameraBlocks.length}
                      </span>
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    className="size-4 rounded hover:bg-camera-zoom/40 text-camera-zoom flex items-center justify-center transition-colors"
                    title="Add camera move block"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddCameraBlock(activeScene.id, activeSceneDuration);
                    }}
                  >
                    <Plus size={10} />
                  </Button>
                </div>

                {/* Lighting Header */}
                {activeHasMockup && (
                  <div
                    className={`h-9 px-3 flex items-center justify-between text-xs transition-colors cursor-pointer ${
                      isLightActiveInThisScene
                        ? "bg-light-key/20 border-l-2 border-l-light-key text-light-key font-medium"
                        : "bg-canvas/80 hover:bg-secondary/20 text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => {
                      selectLayers([]);
                      setIsCameraSelected(false);
                      setIsLightSelected(true);
                    }}
                    title="Lighting Track: Studio illumination for 3D device mockups"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <Sun size={12} className="text-light-key" />
                      <span className="text-[11px] font-medium text-light-key">Lighting</span>
                      <span className="px-1 py-0.2 rounded-full bg-light-key/30 text-light-key text-[8px] font-mono">
                        {Math.round((activeScene.lighting?.intensity ?? 0.85) * 100)}%
                      </span>
                    </div>
                  </div>
                )}

                {/* Audio Lane Header */}
                <div
                  className="h-9 px-3 flex items-center justify-between text-xs bg-canvas/80 hover:bg-secondary/20 transition-colors text-muted-foreground"
                  title="Soundtrack audio for this scene"
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <Music size={12} className="text-audio-track" />
                    <span className="text-[11px] font-medium text-foreground truncate max-w-[85px]">
                      {activeScene.audioTrack?.name || "Audio Track"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {activeScene.audioTrack ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        className="size-4 rounded hover:bg-destructive/30 text-destructive flex items-center justify-center"
                        title="Remove audio track"
                        onClick={() => removeAudioTrack(activeScene.id)}
                      >
                        <Trash2 size={9} />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        className="size-4 rounded hover:bg-secondary/60 text-audio-track hover:text-foreground flex items-center justify-center"
                        title="Add audio track"
                        onClick={() => {
                          audioTargetSceneIdRef.current = activeScene.id;
                          audioFileInputRef.current?.click();
                        }}
                      >
                        <Plus size={10} />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Layer Rows for active scene */}
                {activeSceneLayers.map((layer) => {
                  const isSelected = selectedLayerIds.includes(layer.id);
                  const isLayerExpanded = !!expandedLayers[layer.id];
                  const layerBlocks = activeSceneBlocks.filter((b) => b.layerId === layer.id);
                  const keyframeTracks = layerBlocks.filter(isKeyframeTrack);
                  const availableProps = getAnimatablePropertiesForLayer(layer);

                  return (
                    <React.Fragment key={layer.id}>
                      <div
                        className={`group/row h-9 px-3 flex items-center justify-between text-xs transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-input/30 text-foreground font-medium"
                            : "bg-canvas/80 hover:bg-secondary/20 text-muted-foreground group-hover/row:text-foreground"
                        }`}
                        onClick={() => {
                          selectLayers([layer.id]);
                        }}
                      >
                        <div className="flex items-center gap-1.5 truncate min-w-0 pr-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            type="button"
                            className="size-4 flex items-center justify-center text-muted-foreground hover:text-foreground rounded transition-transform"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedLayers((prev) => ({ ...prev, [layer.id]: !prev[layer.id] }));
                            }}
                            title={isLayerExpanded ? "Collapse keyframe curves" : "Expand keyframe curves"}
                          >
                            <ChevronRight
                              size={10}
                              className={`transition-transform duration-150 ${isLayerExpanded ? "rotate-90 text-primary" : ""}`}
                            />
                          </Button>
                          {getLayerIcon(layer.type)}
                          <span className="truncate max-w-[85px] text-[11px]">{layer.name}</span>
                          {keyframeTracks.length > 0 && (
                            <span className="px-1 py-0.2 rounded bg-primary/20 border border-primary/40 text-primary text-[7px] font-mono flex items-center gap-0.5">
                              <Diamond size={6} className="fill-primary" />
                              {keyframeTracks.length}
                            </span>
                          )}
                        </div>

                        {/* Layer Quick Dropdown */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              type="button"
                              className="size-4 rounded hover:bg-secondary/60 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
                              onClick={(e) => e.stopPropagation()}
                              title="Add keyframe track or animation block"
                            >
                              <Plus size={10} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="start"
                            className="w-48 max-h-[320px] overflow-y-auto bg-card border border-border text-foreground text-xs shadow-2xl rounded-md p-1 outline-none z-50"
                          >
                            <DropdownMenuLabel className="text-[9px] uppercase tracking-wider text-primary font-mono px-2 py-1.5 flex items-center justify-between border-b border-border mb-1">
                              <span className="flex items-center gap-1.5">
                                <Diamond size={9} className="fill-primary text-primary" />
                                <span>Add Keyframe Track</span>
                              </span>
                            </DropdownMenuLabel>
                            <div className="space-y-0.5">
                              {availableProps.map((prop) => {
                                const hasTrack = keyframeTracks.some((t) => t.property === prop.id);
                                return (
                                  <DropdownMenuItem
                                    key={prop.id}
                                    className="cursor-pointer hover:bg-secondary/60 hover:text-primary px-2 py-1 rounded flex items-center justify-between text-xs"
                                    onClick={() => handleAddTrack(activeScene.id, layer.id, prop.id)}
                                  >
                                    <span className="flex items-center gap-1.5">
                                      <span className={`size-1.5 rounded-full ${hasTrack ? "bg-primary" : "bg-muted"}`} />
                                      <span>{prop.label}</span>
                                    </span>
                                  </DropdownMenuItem>
                                );
                              })}
                            </div>
                            <DropdownMenuSeparator className="bg-border my-1" />
                            <DropdownMenuLabel className="text-[9px] uppercase tracking-wider text-muted-foreground font-mono px-2 py-1">
                              Animation Presets
                            </DropdownMenuLabel>
                            <div className="space-y-0.5">
                              {BLOCK_PRESETS.filter((p) => p.id !== "camera-move").map((preset) => (
                                <DropdownMenuItem
                                  key={preset.id}
                                  className="cursor-pointer hover:bg-secondary/60 hover:text-foreground px-2 py-1 rounded flex items-center justify-between text-xs"
                                  onClick={() =>
                                    handleAddBlock(
                                      activeScene.id,
                                      layer.id,
                                      preset.id,
                                      activeSceneDuration,
                                    )
                                  }
                                >
                                  <span>{preset.label}</span>
                                </DropdownMenuItem>
                              ))}
                            </div>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      {/* Expanded Keyframe Track Sub-rows */}
                      {isLayerExpanded &&
                        keyframeTracks.map((track) => (
                          <div
                            key={track.id}
                            className="h-7 px-3 pl-8 flex items-center justify-between border-b border-border bg-card/60 text-[10px] text-muted-foreground"
                          >
                            <span className="font-mono truncate">{track.property}</span>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                type="button"
                                className="size-4 rounded hover:bg-secondary/60 text-primary flex items-center justify-center"
                                title="Add keyframe at current frame"
                                onClick={() =>
                                  handleAddKeyframeToTrack(activeScene, track, currentFrame)
                                }
                              >
                                <Diamond size={8} className="fill-primary" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                type="button"
                                className="size-4 rounded hover:bg-destructive/30 text-destructive flex items-center justify-center"
                                title="Remove track"
                                onClick={() => removeAnimationBlock(track.id)}
                              >
                                <Trash2 size={8} />
                              </Button>
                            </div>
                          </div>
                        ))}
                    </React.Fragment>
                  );
                })}

                {/* Add Layer shortcut button */}
                <div className="p-2 flex justify-center border-t border-border">
                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    className="w-full py-1 rounded bg-secondary/30 hover:bg-secondary/60 border border-border text-muted-foreground hover:text-primary text-[10px] font-medium flex items-center justify-center gap-1 transition-colors"
                    onClick={() => {
                      addLayer(activeScene.id, {
                        name: `Layer ${activeSceneLayers.length + 1}`,
                        type: "shape",
                        shape: { kind: "rect", fill: "#38bdf8" },
                      });
                    }}
                  >
                    <Plus size={10} />
                    <span>Add Layer to Shot</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Tracks Container (Ruler & Horizontal Tracks) */}
        <div
          ref={scrollContainerRef}
          onScroll={handleTracksScroll}
          onWheel={handleTracksWheel}
          className="flex-1 overflow-x-auto overflow-y-auto relative bg-canvas/80 select-none min-w-0"
        >
          <div
            className="relative min-h-full"
            style={{ width: `${totalWidth}px` }}
          >
            {/* 2. Scrubber Track Ruler */}
            <div
              className="group/scrub relative flex h-7 w-full cursor-col-resize bg-secondary/10 hover:bg-secondary/30 transition-colors border-b border-border sticky top-0 z-30 select-none"
              onPointerDown={handleRulerPointerDown}
              onPointerMove={(e) => {
                handleRulerPointerMove(e);
                const frame = getFrameFromClientX(e.clientX);
                setHoveredRulerFrame(frame);
              }}
              onPointerLeave={() => setHoveredRulerFrame(null)}
              onPointerUp={handleRulerPointerUp}
              data-testid="timeline-ruler"
            >
              {/* Tick Marks */}
              <div className="absolute inset-0 flex items-end pointer-events-none opacity-40">
                {Array.from({ length: ticksCount + 1 }).map((_, i) => {
                  const frame = i * majorTickStep;
                  if (frame > totalSequenceFrames + 10) return null;
                  const leftPx = frame * pxPerFrame;
                  return (
                    <div
                      key={frame}
                      className="absolute bottom-0 h-3 border-l border-muted-foreground"
                      style={{ left: `${leftPx}px` }}
                    >
                      <span className="absolute bottom-3 left-1 text-[8px] font-mono tabular-nums text-muted-foreground group-hover/scrub:text-foreground">
                        {Math.floor(frame / fps)}s
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Ghost Hover Time Marker */}
              {hoveredRulerFrame !== null && !isScrubbingRef.current && (
                <div
                  className="absolute top-0 bottom-0 pointer-events-none w-px bg-primary/40 z-20"
                  style={{ left: `${hoveredRulerFrame * pxPerFrame}px` }}
                >
                  <span className="absolute top-0.5 left-1 text-[8px] font-mono bg-card/90 px-1 py-0.2 rounded border border-border text-primary shadow-xs">
                    {hoveredRulerFrame}f
                  </span>
                </div>
              )}

              {/* Scrubber Needle & Diamond Head (Top portion) */}
              <div
                className="absolute top-0 bottom-0 z-40 w-[1.75px] bg-primary pointer-events-none"
                style={{ transform: `translateX(${currentFrame * pxPerFrame}px)` }}
              >
                <div className="size-2.5 -ml-[4.5px] -mt-[1px] bg-primary rotate-45 rounded-[1px] shadow-sm pointer-events-auto cursor-ew-resize hover:scale-125 transition-transform" />
              </div>
            </div>

            {/* 1. TOP SCENE / SHOT TRACK (Scenes beside each other in sequence) */}
            <div className="h-10 border-b border-border bg-card/40 relative flex items-center">
              {sceneSequence.map((item) => {
                const { scene, startFrame, duration } = item;
                const isActive = scene.id === activeSceneId;
                const widthPx = duration * pxPerFrame;
                const leftPx = startFrame * pxPerFrame;

                return (
                  <div
                    key={scene.id}
                    className={`group/clip absolute top-1 bottom-1 rounded-sm border transition-all select-none flex items-center justify-between px-2 cursor-grab active:cursor-grabbing shadow-xs ${
                      isActive
                        ? "border-shot/80 bg-shot/20 ring-2 ring-primary/80 text-foreground shadow-md z-20"
                        : "border-shot/50 bg-shot/10 hover:border-shot/80 text-muted-foreground hover:text-foreground z-10"
                    }`}
                    style={{
                      left: `${leftPx}px`,
                      width: `${Math.max(24, widthPx)}px`,
                      '--layer-color': 'var(--color-shot)',
                    } as React.CSSProperties & Record<string, string>}
                    onClick={() => {
                      setActiveScene(scene.id);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setActiveScene(scene.id);
                      setAssetsVisible((prev) => !prev);
                    }}
                    title={`Scene: ${scene.name} (${duration}f / ${(duration / fps).toFixed(1)}s). Double-click to ${assetsVisible ? "hide" : "show"} nested assets.`}
                    data-testid={`scene-block-${scene.id}`}
                  >
                    {/* Left Trim Handle */}
                    <div
                      className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover/clip:opacity-100 bg-primary/30 rounded-l-xs hover:bg-primary/70 transition-opacity z-30"
                      onPointerDown={(e) => handleSceneTrimStart(e, scene, "start")}
                      title="Trim start of shot"
                    />

                    {/* Scene Label & Renaming */}
                    <div className="flex items-center gap-1.5 truncate min-w-0 pr-1 select-none">
                      <Film size={11} className={isActive ? "text-primary" : "text-muted-foreground"} />
                      {editingSceneId === scene.id ? (
                        <Input
                          autoFocus
                          value={editSceneName}
                          onChange={(e) => setEditSceneName(e.target.value)}
                          onBlur={() => {
                            if (editSceneName.trim()) {
                              updateScene(scene.id, { name: editSceneName.trim() });
                            }
                            setEditingSceneId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              if (editSceneName.trim()) {
                                updateScene(scene.id, { name: editSceneName.trim() });
                              }
                              setEditingSceneId(null);
                            } else if (e.key === "Escape") {
                              setEditingSceneId(null);
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="bg-background border border-primary text-foreground text-[10px] px-1 py-0.5 rounded outline-none w-20"
                        />
                      ) : (
                        <span
                          className="truncate text-[10px] font-semibold tracking-wide select-none"
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            setEditingSceneId(scene.id);
                            setEditSceneName(scene.name);
                          }}
                        >
                          {scene.name}
                        </span>
                      )}
                      <span className="text-[8px] opacity-75 font-mono">
                        ({(duration / fps).toFixed(1)}s)
                      </span>
                    </div>

                    {/* Scene Quick Actions Menu */}
                    <div className="flex items-center gap-1 opacity-0 group-hover/clip:opacity-100 transition-opacity">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            type="button"
                            className="size-4 rounded hover:bg-secondary/60 text-foreground flex items-center justify-center"
                            onClick={(e) => e.stopPropagation()}
                            title="Scene options"
                          >
                            <MoreVertical size={10} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="w-44 bg-card border border-border text-foreground text-xs shadow-2xl rounded-md p-1 outline-none z-50"
                        >
                          <DropdownMenuLabel className="text-[9px] uppercase tracking-wider text-primary font-mono px-2 py-1">
                            {scene.name}
                          </DropdownMenuLabel>
                          <DropdownMenuItem
                            className="cursor-pointer hover:bg-secondary/60 px-2 py-1.5 rounded flex items-center gap-1.5 text-xs"
                            onClick={() => {
                              setEditingSceneId(scene.id);
                              setEditSceneName(scene.name);
                            }}
                          >
                            <Edit2 size={11} />
                            <span>Rename Scene</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="cursor-pointer hover:bg-secondary/60 px-2 py-1.5 rounded flex items-center gap-1.5 text-xs"
                            onClick={() => duplicateScene(scene.id)}
                          >
                            <Copy size={11} />
                            <span>Duplicate Scene</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="cursor-pointer hover:bg-secondary/60 px-2 py-1.5 rounded flex items-center gap-1.5 text-xs"
                            onClick={() => {
                              setAssetsVisible(true);
                              handleAddCameraBlock(scene.id, duration);
                            }}
                          >
                            <CameraIcon size={11} className="text-camera-zoom" />
                            <span>Add Camera Move</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="cursor-pointer hover:bg-secondary/60 px-2 py-1.5 rounded flex items-center gap-1.5 text-xs"
                            onClick={() => setAssetsVisible((v) => !v)}
                          >
                            <Layers size={11} className="text-primary" />
                            <span>{assetsVisible ? "Hide Nested Assets" : "Show Nested Assets"}</span>
                          </DropdownMenuItem>
                          {scenes.length > 1 && (
                            <>
                              <DropdownMenuSeparator className="bg-border" />
                              <DropdownMenuItem
                                className="cursor-pointer hover:bg-destructive/30 text-destructive px-2 py-1.5 rounded flex items-center gap-1.5 text-xs"
                                onClick={() => deleteScene(scene.id)}
                              >
                                <Trash2 size={11} />
                                <span>Delete Scene</span>
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Right Trim Handle */}
                    <div
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover/clip:opacity-100 bg-primary/30 rounded-r-xs hover:bg-primary/70 transition-opacity z-30"
                      onPointerDown={(e) => handleSceneTrimStart(e, scene, "end")}
                      title="Drag to increase or reduce scene duration"
                    />
                  </div>
                );
              })}
            </div>

            {/* 2. NESTED ASSET STACK TRACKS (Shown only when assetsVisible is true) */}
            {assetsVisible && (
              <div className="relative divide-y divide-border/60 animate-fadeIn">
                {/* Active Scene Highlight Background Area across all asset tracks */}
                <div
                  className="absolute top-0 bottom-0 pointer-events-none bg-primary/[0.03] border-x border-primary/20 z-0"
                  style={{
                    left: `${activeSceneStartFrame * pxPerFrame}px`,
                    width: `${activeSceneDuration * pxPerFrame}px`,
                  }}
                />

                {/* Dynamic Snap Guidelines during active drag or trim */}
                {activeDragFeedback && (
                  <>
                    {/* Start Edge Guide Line */}
                    <div
                      className="absolute top-0 bottom-0 w-px border-l border-dashed border-primary/80 pointer-events-none z-30 shadow-xs"
                      style={{
                        left: `${(activeSceneStartFrame + activeDragFeedback.startFrame) * pxPerFrame}px`,
                      }}
                    />
                    {/* End Edge Guide Line */}
                    <div
                      className="absolute top-0 bottom-0 w-px border-l border-dashed border-primary/80 pointer-events-none z-30 shadow-xs"
                      style={{
                        left: `${(activeSceneStartFrame + activeDragFeedback.endFrame) * pxPerFrame}px`,
                      }}
                    />
                  </>
                )}

                {/* Nested Camera Lane Track */}
                <div
                  className={`group/row relative h-9 w-full flex items-center transition-colors cursor-pointer ${
                    isCameraActiveInThisScene ? "bg-camera-zoom/10" : "bg-canvas/80 hover:bg-secondary/20"
                  }`}
                  onClick={() => {
                    selectLayers([]);
                    setIsLightSelected(false);
                    setIsCameraSelected(true);
                    setActiveTool("camera");
                  }}
                >
                  {activeCameraBlocks.map((block) => {
                    const leftPx = (activeSceneStartFrame + block.startFrame) * pxPerFrame;
                    const widthPx = (block.endFrame - block.startFrame) * pxPerFrame;

                    return (
                      <div
                        key={block.id}
                        className="group/clip absolute top-1 bottom-1 rounded-sm border border-camera-zoom/60 bg-camera-zoom/15 text-foreground text-[10px] flex items-center justify-between px-2 shadow-xs hover:shadow-md transition-all cursor-grab active:cursor-grabbing z-10"
                        style={{
                          left: `${leftPx}px`,
                          width: `${Math.max(16, widthPx)}px`,
                          '--layer-color': 'var(--color-camera-zoom)',
                        } as React.CSSProperties & Record<string, string>}
                        onPointerDown={(e) =>
                          startBlockDrag(e, activeScene.id, block, "move", activeSceneDuration)
                        }
                      >
                        {/* Left resize handle */}
                        <div
                          className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover/clip:opacity-100 bg-primary/30 rounded-l-xs hover:bg-primary/70 transition-opacity"
                          onPointerDown={(e) =>
                            startBlockDrag(e, activeScene.id, block, "resize-left", activeSceneDuration)
                          }
                        />
                        <span className="truncate font-medium flex items-center gap-1 text-camera-zoom">
                          <CameraIcon size={9} />
                          <span>Camera Move</span>
                        </span>
                        {/* Right resize handle */}
                        <div
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover/clip:opacity-100 bg-primary/30 rounded-r-xs hover:bg-primary/70 transition-opacity"
                          onPointerDown={(e) =>
                            startBlockDrag(e, activeScene.id, block, "resize-right", activeSceneDuration)
                          }
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Nested Lighting Lane Track */}
                {activeHasMockup && (
                  <div
                    className={`group/row relative h-9 w-full flex items-center transition-colors cursor-pointer ${
                      isLightActiveInThisScene ? "bg-light-key/10" : "bg-canvas/80 hover:bg-secondary/20"
                    }`}
                    onClick={() => {
                      selectLayers([]);
                      setIsCameraSelected(false);
                      setIsLightSelected(true);
                    }}
                  >
                    <div
                      className="absolute top-1 bottom-1 rounded-sm border border-light-key/60 bg-light-key/15 text-light-key text-[10px] flex items-center px-2 z-10"
                      style={{
                        left: `${activeSceneStartFrame * pxPerFrame}px`,
                        width: `${activeSceneDuration * pxPerFrame}px`,
                      }}
                    >
                      <Sun size={9} className="mr-1 text-light-key" />
                      <span>Studio 3D Lighting ({Math.round((activeScene.lighting?.intensity ?? 0.85) * 100)}%)</span>
                    </div>
                  </div>
                )}

                {/* Nested Audio Lane Track */}
                <div
                  className="group/row relative h-9 w-full flex items-center bg-canvas/80 hover:bg-secondary/20 transition-colors cursor-pointer overflow-hidden"
                  onClick={() => {
                    if (!activeScene.audioTrack) {
                      audioTargetSceneIdRef.current = activeScene.id;
                      audioFileInputRef.current?.click();
                    }
                  }}
                >
                  {activeScene.audioTrack && (
                    <div
                      className="group/clip absolute top-1 bottom-1 rounded-sm border border-audio-track/60 bg-audio-track/15 text-foreground text-[10px] flex items-center px-2 z-10 cursor-grab active:cursor-grabbing shadow-xs"
                      style={{
                        left: `${(activeSceneStartFrame + (activeScene.audioTrack.offsetFrames || 0)) * pxPerFrame}px`,
                        width: `${(activeScene.audioTrack.duration * fps) * pxPerFrame}px`,
                        '--layer-color': 'var(--color-audio-track)',
                      } as React.CSSProperties & Record<string, string>}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        const startX = e.clientX;
                        const initialOffset = activeScene.audioTrack?.offsetFrames || 0;
                        audioDragRef.current = { startX, initialOffset, sceneId: activeScene.id };

                        const handleMove = (moveEvt: PointerEvent) => {
                          if (!audioDragRef.current) return;
                          const delta = Math.round((moveEvt.clientX - audioDragRef.current.startX) / pxPerFrame);
                          updateAudioTrack(audioDragRef.current.sceneId, {
                            offsetFrames: audioDragRef.current.initialOffset + delta,
                          });
                        };

                        const handleUp = () => {
                          audioDragRef.current = null;
                          window.removeEventListener("pointermove", handleMove);
                          window.removeEventListener("pointerup", handleUp);
                        };

                        window.addEventListener("pointermove", handleMove);
                        window.addEventListener("pointerup", handleUp);
                      }}
                    >
                      <Music size={9} className="mr-1 text-audio-track" />
                      <span className="truncate">{activeScene.audioTrack.name}</span>
                    </div>
                  )}
                </div>

                {/* Nested Layer Rows Track */}
                {activeSceneLayers.map((layer) => {
                  const isSelected = selectedLayerIds.includes(layer.id);
                  const isLayerExpanded = !!expandedLayers[layer.id];
                  const layerBlocks = activeSceneBlocks.filter((b) => b.layerId === layer.id);
                  const presetBlocks = layerBlocks.filter((b): b is PresetAnimationBlock => !isKeyframeTrack(b));
                  const keyframeTracks = layerBlocks.filter(isKeyframeTrack);
                  const isSlotHovered = hoveredEmptySlot?.layerId === layer.id;

                  return (
                    <React.Fragment key={layer.id}>
                      <div
                        className={`group/row relative h-9 w-full flex items-center transition-colors ${
                          isSelected ? "bg-input/20" : "bg-canvas/80 hover:bg-secondary/20"
                        }`}
                        onClick={() => {
                          selectLayers([layer.id]);
                        }}
                        onPointerMove={(e) => handleLayerTrackPointerMove(e, layer)}
                        onPointerLeave={() => {
                          if (hoveredEmptySlot?.layerId === layer.id) {
                            setHoveredEmptySlot(null);
                          }
                        }}
                      >
                        {/* Animation Blocks on this layer */}
                        {presetBlocks.map((block) => {
                          const leftPx = (activeSceneStartFrame + block.startFrame) * pxPerFrame;
                          const widthPx = (block.endFrame - block.startFrame) * pxPerFrame;
                          const clipType = getClipType(block.preset);
                          const config = LAYER_CONFIG[clipType] || LAYER_CONFIG.animation;
                          const isThisDragging = activeDragFeedback?.blockId === block.id;

                          return (
                            <div
                              key={block.id}
                              className={`group/clip absolute top-1 bottom-1 rounded-sm border transition-all cursor-grab active:cursor-grabbing shadow-xs flex items-center justify-between px-2 z-10 ${
                                config.border
                              } ${config.bg} ${
                                isSelected
                                  ? 'ring-2 ring-primary/80 border-primary bg-primary/20 shadow-md'
                                  : 'hover:border-(--layer-color) hover:brightness-105'
                              } ${isThisDragging ? 'scale-[1.01] ring-2 ring-primary shadow-lg z-30 cursor-grabbing' : ''}`}
                              style={{
                                left: `${leftPx}px`,
                                width: `${Math.max(16, widthPx)}px`,
                                '--layer-color': config.varName,
                              } as React.CSSProperties & Record<string, string>}
                              onPointerDown={(e) =>
                                startBlockDrag(e, activeScene.id, block, "move", activeSceneDuration)
                              }
                            >
                              {/* Live Duration Tooltip Badge floating above block during drag */}
                              {isThisDragging && (
                                <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-card/95 border border-border text-primary px-1.5 py-0.5 rounded text-[9px] font-mono shadow-md whitespace-nowrap z-40 animate-in fade-in">
                                  {block.endFrame - block.startFrame}f ({((block.endFrame - block.startFrame) / fps).toFixed(2)}s)
                                </div>
                              )}

                              {/* Left resize handle */}
                              <div
                                className="absolute left-0 top-0 bottom-0 w-2.5 cursor-ew-resize opacity-0 group-hover/clip:opacity-100 bg-primary/30 rounded-l-xs hover:bg-primary/70 transition-opacity flex items-center justify-center z-20"
                                onPointerDown={(e) =>
                                  startBlockDrag(e, activeScene.id, block, "resize-left", activeSceneDuration)
                                }
                                title="Trim start"
                              >
                                <div className="w-[1px] h-3 bg-primary/80 rounded-full" />
                              </div>

                              <span className={`truncate text-[10px] font-medium capitalize ${config.text || 'text-foreground'}`}>
                                {getPresetLabel(block.preset)}
                              </span>

                              {/* Right resize handle */}
                              <div
                                className="absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize opacity-0 group-hover/clip:opacity-100 bg-primary/30 rounded-r-xs hover:bg-primary/70 transition-opacity flex items-center justify-center z-20"
                                onPointerDown={(e) =>
                                  startBlockDrag(e, activeScene.id, block, "resize-right", activeSceneDuration)
                                }
                                title="Trim end"
                              >
                                <div className="w-[1px] h-3 bg-primary/80 rounded-full" />
                              </div>
                            </div>
                          );
                        })}

                        {/* Interactive Dotted Line / Empty Spot Ghost Box on Hover */}
                        {isSlotHovered && hoveredEmptySlot && (
                          <div
                            className="absolute top-1 bottom-1 rounded-sm border-2 border-dashed border-primary bg-primary/15 text-primary flex items-center justify-center gap-1 text-[9px] font-semibold cursor-pointer z-20 shadow-md transition-all animate-pulse"
                            style={{
                              left: `${hoveredEmptySlot.leftPx}px`,
                              width: `${Math.max(36, hoveredEmptySlot.widthPx)}px`,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setEffectPickerSlot({
                                layerId: layer.id,
                                frame: hoveredEmptySlot.frame,
                                leftPx: hoveredEmptySlot.leftPx,
                                topPx: e.currentTarget.getBoundingClientRect().top,
                              });
                            }}
                            title={`Click to add effect at frame ${hoveredEmptySlot.frame}`}
                          >
                            <div className="absolute -left-[1.5px] top-0 bottom-0 w-[2px] bg-primary shadow-sm" />
                            <Plus size={10} strokeWidth={2.5} />
                            <span className="text-[8px] uppercase tracking-wider font-mono">Add Effect</span>
                            <div className="absolute -right-[1.5px] top-0 bottom-0 w-[2px] bg-primary/60" />
                          </div>
                        )}
                      </div>

                      {/* Expanded Keyframe Track sub-tracks */}
                      {isLayerExpanded &&
                        keyframeTracks.map((track) => (
                          <div
                            key={track.id}
                            className="h-7 border-b border-border bg-card/60 relative flex items-center"
                          >
                            {/* Track Keyframes */}
                            {(track.keyframes || []).map((kf, kfIdx) => {
                              const kfLeftPx = (activeSceneStartFrame + kf.frame) * pxPerFrame;
                              return (
                                <div
                                  key={kfIdx}
                                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 size-2.5 bg-primary hover:bg-foreground border border-primary/80 rotate-45 cursor-ew-resize transition-transform hover:scale-125 z-20 shadow-sm"
                                  style={{ left: `${kfLeftPx}px` }}
                                  onPointerDown={(e) =>
                                    startKeyframeDrag(e, activeScene.id, track, kf.frame, activeSceneDuration)
                                  }
                                  title={`Keyframe at frame ${kf.frame} (${(kf.frame / fps).toFixed(2)}s)`}
                                />
                              );
                            })}
                          </div>
                        ))}
                    </React.Fragment>
                  );
                })}
              </div>
            )}

            {/* Quick Effect Selection Popover */}
            {effectPickerSlot && (
              <div
                className="fixed z-50 bg-card border border-border shadow-2xl rounded-lg p-2 text-foreground w-56 animate-in fade-in zoom-in-95 duration-100"
                style={{
                  left: `${Math.min(window.innerWidth - 240, Math.max(20, effectPickerSlot.leftPx - (scrollContainerRef.current?.scrollLeft || 0) + (leftHeadersRef.current?.clientWidth || 180)))}px`,
                  top: `${Math.max(10, effectPickerSlot.topPx - 140)}px`,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-border px-1 text-[10px] font-mono text-primary font-semibold uppercase tracking-wider">
                  <span className="flex items-center gap-1">
                    <Sparkles size={11} />
                    <span>Choose Effect</span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    className="text-muted-foreground hover:text-foreground text-sm leading-none"
                    onClick={() => setEffectPickerSlot(null)}
                  >
                    ×
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {BLOCK_PRESETS.filter((p) => p.id !== "camera-move").slice(0, 6).map((preset) => (
                    <Button
                      variant="secondary"
                      type="button"
                      className="p-1.5 rounded bg-secondary/40 hover:bg-primary hover:text-primary-foreground border border-border hover:border-primary text-[10px] font-medium text-left truncate transition-colors"
                      onClick={() => {
                        handleAddBlock(
                          activeScene.id,
                          effectPickerSlot.layerId,
                          preset.id,
                          activeSceneDuration,
                          effectPickerSlot.frame,
                        );
                        setEffectPickerSlot(null);
                        setHoveredEmptySlot(null);
                      }}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Global Timeline Needle Scrubber spanning full tracks height */}
            <div
              className="absolute top-0 bottom-0 w-[1.75px] bg-primary pointer-events-none z-40 shadow-[0_0_8px_var(--color-primary)] transition-[left] duration-75"
              style={{
                left: `${currentFrame * pxPerFrame}px`,
              }}
            >
              {/* Needle Head */}
              <div className="size-2.5 -ml-[4.5px] -mt-[1px] bg-primary rotate-45 rounded-[1px] shadow-sm pointer-events-auto cursor-ew-resize hover:scale-125 transition-transform" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
