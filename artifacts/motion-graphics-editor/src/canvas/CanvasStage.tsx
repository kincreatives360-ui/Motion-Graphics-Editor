import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import {
  ZoomIn,
  ZoomOut,
  ChevronDown,
  Check,
  RotateCcw,
  Maximize2,
  Crosshair,
  UploadCloud,
} from "lucide-react";
import {
  useEditorStore,
  useEditorUIStore,
  type Layer,
  type Transform,
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
} from "../store/editor-store";
import {
  computeRenderedLayer,
  projectLayer,
  sampleCamera,
  dofBlurPx,
  focalLength,
  type CameraTransform,
} from "../store/animation-blocks";
import {
  applyBloom,
  applyFilmGrain,
  applyVignette,
  applyChromaticAberration,
  applyColorGrade,
  applyGlitch,
  applyGhost,
  applyEdgeFade,
} from "./post-processing";
import {
  renderLayersAtFrame,
} from "./render-frame";
import {
  drawLayer,
  getCachedImage,
  globalImageCache,
  getScreenTransform,
} from "../canvas/render-frame";
import {
  getSnapCandidates,
  snapTransform,
  type SnapLine,
  type SnapCandidates,
} from "./snapping";
import {
  isSvgContent,
  parseSvgToLayers,
  importImageFile,
  addAssetToCanvas,
} from "../lib/svg-importer";
import { decodeAudioFile } from "../lib/audio-manager";
import { SocialSafeZonesOverlay, type SafeZoneMode } from "./SocialSafeZonesOverlay";
import { R3FSceneCanvas, type R3FSceneCanvasRef } from "./r3f/R3FSceneCanvas";
import { R3FSnapGuides } from "./r3f/R3FSnapGuides";

export { drawLayer, getCachedImage, globalImageCache };

// Invert screen coordinate to layer world coordinate accounting for camera
function canvasToWorld(
  canvasX: number,
  canvasY: number,
  camera: { x?: number; y?: number; z?: number; fov?: number },
  canvasWidth: number,
  canvasHeight: number,
  depth = 0,
) {
  const f = focalLength(camera.fov ?? 60, canvasHeight);
  const relDepth = depth - (camera.z || 0);
  const distance = Math.max(f * 0.05, f + relDepth);
  const scale = f / distance;
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;
  const worldX = (canvasX - cx) / scale + cx + (camera.x || 0);
  const worldY = (canvasY - cy) / scale + cy + (camera.y || 0);
  return { worldX, worldY, scale };
}

// Draw snap guides over canvas (projected if camera is active)
function drawGuides(
  ctx: CanvasRenderingContext2D,
  guides: SnapLine[],
  canvasWidth: number,
  canvasHeight: number,
  camera?: { x?: number; y?: number; z?: number; fov?: number },
) {
  if (!guides || guides.length === 0) return;

  ctx.save();
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);

  const f = camera ? focalLength(camera.fov ?? 60, canvasHeight) : canvasHeight;
  const distance = camera ? Math.max(f * 0.05, f - (camera.z || 0)) : f;
  const scale = camera ? f / distance : 1;
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;
  const camX = camera?.x || 0;
  const camY = camera?.y || 0;

  const projX = (x: number) => (camera ? cx + (x - camX - cx) * scale : x);
  const projY = (y: number) => (camera ? cy + (y - camY - cy) * scale : y);

  for (const guide of guides) {
    ctx.beginPath();
    if (guide.axis === "x") {
      const px = projX(guide.value);
      const y1 = projY(guide.start !== undefined ? guide.start : 0);
      const y2 = projY(guide.end !== undefined ? guide.end : canvasHeight);
      ctx.moveTo(px, y1);
      ctx.lineTo(px, y2);
    } else {
      const py = projY(guide.value);
      const x1 = projX(guide.start !== undefined ? guide.start : 0);
      const x2 = projX(guide.end !== undefined ? guide.end : canvasWidth);
      ctx.moveTo(x1, py);
      ctx.lineTo(x2, py);
    }
    ctx.stroke();

    // Small tick marks for spacing guides
    if (guide.label === "spacing") {
      ctx.save();
      ctx.setLineDash([]);
      ctx.fillStyle = "#38bdf8";
      if (guide.axis === "x") {
        const px = projX(guide.value);
        ctx.fillRect(px - 3, projY(guide.start ?? 0) - 3, 6, 6);
        ctx.fillRect(px - 3, projY(guide.end ?? canvasHeight) - 3, 6, 6);
      } else {
        const py = projY(guide.value);
        ctx.fillRect(projX(guide.start ?? 0) - 3, py - 3, 6, 6);
        ctx.fillRect(projX(guide.end ?? canvasWidth) - 3, py - 3, 6, 6);
      }
      ctx.restore();
    }
  }

  ctx.restore();
}

// Hit-test a layer with rotation (groups pass through to children or outline)
function hitTestLayer(layer: Layer, canvasX: number, canvasY: number): boolean {
  if (!layer.visible || layer.locked) return false;
  if (layer.type === "group") return false;
  const { x, y, width, height, rotation } = layer.transform;
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const rad = (-rotation * Math.PI) / 180;
  const dx = canvasX - centerX;
  const dy = canvasY - centerY;
  const unrotX = dx * Math.cos(rad) - dy * Math.sin(rad);
  const unrotY = dx * Math.sin(rad) + dy * Math.cos(rad);
  const margin = 4;
  return (
    unrotX >= -width / 2 - margin &&
    unrotX <= width / 2 + margin &&
    unrotY >= -height / 2 - margin &&
    unrotY <= height / 2 + margin
  );
}

type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

interface DragOperation {
  type: "move" | "resize" | "rotate" | "pan" | "tilt" | "camera";
  cameraDragMode?: "orbit" | "pan" | "dolly";
  startClientX: number;
  startClientY: number;
  layerId?: string;
  initialTransform?: Transform;
  initialTransforms?: Map<string, Transform>;
  initialPan?: { x: number; y: number };
  initialCamera?: {
    x: number;
    y: number;
    z: number;
    pitch?: number;
    yaw?: number;
    roll?: number;
    fov: number;
    focusDistance: number;
  };
  resizeHandle?: ResizeHandle;
  startAngle?: number;
  groupCenter?: { x: number; y: number };
  screenCenter?: { x: number; y: number };
  candidates?: SnapCandidates;
  otherLayers?: Layer[];
  projectedScale?: number;
  pendingSingleSelectId?: string;
  hasMoved?: boolean;
}

const ZOOM_PRESETS = [25, 50, 75, 100, 125, 150, 200, 300, 400];

export function CanvasStage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const r3fCanvasRef = useRef<R3FSceneCanvasRef>(null);
  const zoomControlRef = useRef<HTMLDivElement>(null);

  const zoom = useEditorUIStore((s) => s.zoom);
  const setZoom = useEditorUIStore((s) => s.setZoom);
  const pan = useEditorUIStore((s) => s.pan);
  const setPan = useEditorUIStore((s) => s.setPan);
  const activeTool = useEditorUIStore((s) => s.activeTool);
  const setActiveTool = useEditorUIStore((s) => s.setActiveTool);
  const isCameraSelected = useEditorUIStore((s) => s.isCameraSelected);
  const isCameraActive = isCameraSelected || activeTool === "camera";
  const playing = useEditorUIStore((s) => s.playing);
  const currentFrame = useEditorUIStore((s) => s.currentFrame);
  const setCurrentFrame = useEditorUIStore((s) => s.setCurrentFrame);
  const selectedLayerIds = useEditorStore((s) => s.selectedLayerIds);
  const selectLayers = useEditorStore((s) => s.selectLayers);
  const addLayer = useEditorStore((s) => s.addLayer);
  const updateLayer = useEditorStore((s) => s.updateLayer);
  const scenes = useEditorStore((s) => s.scenes);
  const activeSceneId = useEditorStore((s) => s.activeSceneId);
  const aspectRatio = useEditorStore((s) => s.aspectRatio) || "16:9";
  const updateCamera = useEditorStore((s) => s.updateCamera);

  const [containerSize, setContainerSize] = useState({ width: 1200, height: 700 });
  const [activeGuides, setActiveGuides] = useState<SnapLine[]>([]);
  const [editingTextLayerId, setEditingTextLayerId] = useState<string | null>(null);
  const [editingTextValue, setEditingTextValue] = useState("");
  const [zoomDropdownOpen, setZoomDropdownOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [safeZoneMode, setSafeZoneMode] = useState<SafeZoneMode>("none");

  // Figma Vector / System Clipboard Paste Listener
  useEffect(() => {
    const handleClipboardPaste = async (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      const clipboardData = e.clipboardData;
      if (!clipboardData) return;

      // 1. Check for SVG markup in clipboard (Figma "Copy as SVG" produces text/html or text/plain)
      const htmlText = clipboardData.getData("text/html");
      const plainText = clipboardData.getData("text/plain");

      let svgText = "";
      if (htmlText && htmlText.includes("<svg")) {
        const match = htmlText.match(/<svg[\s\S]*?<\/svg>/i);
        if (match) svgText = match[0];
      } else if (plainText && isSvgContent(plainText)) {
        svgText = plainText;
      }

      if (svgText) {
        e.preventDefault();
        try {
          const parsed = parseSvgToLayers(svgText);
          if (parsed && parsed.layers.length > 0) {
            useEditorStore.getState().addImportedLayers(parsed.layers, [parsed.groupId]);
            return;
          }
        } catch (err) {
          console.warn("Figma SVG paste error:", err);
        }
      }

      // 2. Check for image files in clipboard
      const items = Array.from(clipboardData.items);
      const imageItem = items.find((it) => it.type.startsWith("image/"));
      if (imageItem) {
        e.preventDefault();
        const file = imageItem.getAsFile();
        if (file) {
          try {
            await importImageFile(file);
            return;
          } catch (err) {
            console.warn("Clipboard image paste error:", err);
          }
        }
      }
    };

    window.addEventListener("paste", handleClipboardPaste);
    return () => window.removeEventListener("paste", handleClipboardPaste);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        setIsSpacePressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setIsSpacePressed(false);
      }
    };

    const handleBlur = () => {
      setIsSpacePressed(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  // Dev-only FPS tracking
  const [fps, setFps] = useState<number>(60);
  const frameTimesRef = useRef<number[]>([]);
  const lastFpsUpdateRef = useRef<number>(0);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const dragOpRef = useRef<DragOperation | null>(null);
  const redrawRef = useRef<() => void>(() => {});
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  const activeScene = useMemo(
    () => scenes.find((s) => s.id === activeSceneId) || scenes[0],
    [scenes, activeSceneId],
  );



  const handleFocusPillPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startFocus = activeScene?.camera?.focusDistance ?? 1000;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newFocus = Math.max(0, Math.round(startFocus + deltaX * 3));
      updateCamera({ focusDistance: newFocus });
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const nativeWidth =
    aspectRatio === "9:16" ? 1080 : aspectRatio === "1:1" ? 1080 : 1920;
  const nativeHeight =
    aspectRatio === "9:16" ? 1920 : aspectRatio === "1:1" ? 1080 : 1080;
  const aspect = nativeWidth / nativeHeight;

  // Measure stage container dimensions
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };

    updateSize();

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setContainerSize({ width, height });
        }
      }
    });

    observer.observe(container);
    window.addEventListener("resize", updateSize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  // Compute display size and scale factor
  const maxW = Math.max(200, containerSize.width - 64);
  const maxH = Math.max(150, containerSize.height - 80);
  let fitW = maxW;
  let fitH = maxH;
  if (maxW / maxH > aspect) {
    fitH = maxH;
    fitW = fitH * aspect;
  } else {
    fitW = maxW;
    fitH = fitW / aspect;
  }

  const currentZoom = zoom || 100;
  const displayW = Math.max(40, fitW * (currentZoom / 100));
  const displayH = Math.max(40, fitH * (currentZoom / 100));
  const scaleFactor = displayW / nativeWidth;

  // Playback timer: advances currentFrame at scene fps looping at durationFrames
  useEffect(() => {
    if (!playing) return;
    const fps = activeScene?.fps || 30;
    const durationFrames = activeScene?.durationFrames || 180;
    const intervalMs = 1000 / fps;
    let lastTime = performance.now();
    let animId: number;

    const tick = (now: number) => {
      const elapsed = now - lastTime;
      if (elapsed >= intervalMs) {
        lastTime = now - (elapsed % intervalMs);
        setCurrentFrame((prev) => (prev + 1) % durationFrames);
      }
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [playing, activeScene?.fps, activeScene?.durationFrames, setCurrentFrame]);

  // Render canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const bufferW = Math.round(displayW * dpr);
    const bufferH = Math.round(displayH * dpr);

    if (canvas.width !== bufferW || canvas.height !== bufferH) {
      canvas.width = bufferW;
      canvas.height = bufferH;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, bufferW, bufferH);

    // Apply scale for DPR and canvas coordinate fitting
    ctx.scale(dpr, dpr);
    ctx.scale(scaleFactor, scaleFactor);

    // Canvas background
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, nativeWidth, nativeHeight);

    // Draw layers in ascending order with animation sampling and camera projection
    if (activeScene && activeScene.layers) {
      const activeEffects = activeScene.effects ? activeScene.effects.filter((e) => e.enabled && e.visible) : [];

      const dofFx = activeEffects.find((e): e is DepthOfFieldEffect => e.type === "depthOfField");
      const motionBlurFx = activeEffects.find((e): e is MotionBlurEffect => e.type === "motionBlur");

      const motionSamples = motionBlurFx && motionBlurFx.samples ? Math.max(1, Math.min(12, Math.round(motionBlurFx.samples))) : 1;
      const shutterAngle = motionBlurFx ? Math.max(0, Math.min(360, motionBlurFx.shutterAngle ?? 180)) : 0;
      const isMotionBlurActive = Boolean(motionBlurFx && motionSamples > 1 && shutterAngle > 0);

      if (isMotionBlurActive) {
        if (!offscreenCanvasRef.current) {
          offscreenCanvasRef.current = document.createElement("canvas");
        }
        const mbCanvas = offscreenCanvasRef.current;
        if (mbCanvas.width !== nativeWidth || mbCanvas.height !== nativeHeight) {
          mbCanvas.width = nativeWidth;
          mbCanvas.height = nativeHeight;
        }
        const mbCtx = mbCanvas.getContext("2d");

        if (mbCtx) {
          mbCtx.setTransform(1, 0, 0, 1, 0, 0);
          mbCtx.clearRect(0, 0, nativeWidth, nativeHeight);

          const shutterFraction = shutterAngle / 360;

          // Temporary canvas for individual sub-frame samples
          const sampleCanvas = document.createElement("canvas");
          sampleCanvas.width = nativeWidth;
          sampleCanvas.height = nativeHeight;
          const sampleCtx = sampleCanvas.getContext("2d");

          if (sampleCtx) {
            for (let s = 0; s < motionSamples; s++) {
              const subFrame = currentFrame - (shutterFraction * 0.5) + (s / (motionSamples - 1)) * shutterFraction;

              sampleCtx.setTransform(1, 0, 0, 1, 0, 0);
              sampleCtx.clearRect(0, 0, nativeWidth, nativeHeight);

              renderLayersAtFrame(sampleCtx, activeScene, subFrame, nativeWidth, nativeHeight, activeScene.lighting, dofFx, () => draw());

              mbCtx.save();
              mbCtx.globalCompositeOperation = "source-over";
              mbCtx.globalAlpha = 1 / (s + 1);
              mbCtx.drawImage(sampleCanvas, 0, 0);
              mbCtx.restore();
            }

            ctx.drawImage(mbCanvas, 0, 0);
          } else {
            renderLayersAtFrame(ctx, activeScene, currentFrame, nativeWidth, nativeHeight, activeScene.lighting, dofFx, () => draw());
          }
        } else {
          renderLayersAtFrame(ctx, activeScene, currentFrame, nativeWidth, nativeHeight, activeScene.lighting, dofFx, () => draw());
        }
      } else {
        renderLayersAtFrame(ctx, activeScene, currentFrame, nativeWidth, nativeHeight, activeScene.lighting, dofFx, () => draw());
      }

      // Unified Scene Effects Post-Processing Pass
      // Fixed composite order:
      // Color Grade -> Depth of Field -> Motion Blur -> Bloom -> Vignette -> Chromatic Aberration -> Glitch -> Film Grain -> Ghost -> Edge Fade
      if (canvas && activeEffects.length > 0) {
        // 1. Color Grade
        const colorGradeFx = activeEffects.find((e): e is ColorGradeEffect => e.type === "colorGrade");
        if (colorGradeFx) {
          applyColorGrade(canvas, colorGradeFx.exposure, colorGradeFx.contrast, colorGradeFx.saturation);
        }

        // 2. Depth of Field (applied during layer loop)
        // 3. Motion Blur (applied before standard layer-draw loop)

        // 4. Bloom
        const bloomFx = activeEffects.find((e): e is BloomEffect => e.type === "bloom");
        if (bloomFx && bloomFx.intensity > 0) {
          if (!offscreenCanvasRef.current) {
            offscreenCanvasRef.current = document.createElement("canvas");
          }
          applyBloom(
            canvas,
            offscreenCanvasRef.current,
            bloomFx.threshold * 255,
            16,
            bloomFx.intensity,
          );
        }

        // 5. Vignette
        const vignetteFx = activeEffects.find((e): e is VignetteEffect => e.type === "vignette");
        if (vignetteFx && vignetteFx.intensity > 0) {
          applyVignette(canvas, vignetteFx.intensity);
        }

        // 6. Chromatic Aberration
        const chromaFx = activeEffects.find((e): e is ChromaticAberrationEffect => e.type === "chromaticAberration");
        if (chromaFx && chromaFx.offset > 0) {
          applyChromaticAberration(canvas, chromaFx.offset);
        }

        // 7. Glitch
        const glitchFx = activeEffects.find((e): e is GlitchEffect => e.type === "glitch");
        if (glitchFx && glitchFx.intensity > 0) {
          applyGlitch(canvas, glitchFx.intensity, glitchFx.speed);
        }

        // 8. Film Grain
        const grainFx = activeEffects.find((e): e is FilmGrainEffect => e.type === "filmGrain");
        if (grainFx && grainFx.intensity > 0) {
          applyFilmGrain(canvas, grainFx.intensity, grainFx.size);
        }

        // 9. Ghost
        const ghostFx = activeEffects.find((e): e is GhostEffect => e.type === "ghost");
        if (ghostFx && ghostFx.opacity > 0) {
          applyGhost(canvas, ghostFx.opacity, ghostFx.offset, ghostFx.blur);
        }

        // 10. Edge Fade
        const edgeFadeFx = activeEffects.find((e): e is EdgeFadeEffect => e.type === "edgeFade");
        if (
          edgeFadeFx &&
          (edgeFadeFx.top > 0 || edgeFadeFx.right > 0 || edgeFadeFx.bottom > 0 || edgeFadeFx.left > 0)
        ) {
          applyEdgeFade(
            canvas,
            edgeFadeFx.top,
            edgeFadeFx.right,
            edgeFadeFx.bottom,
            edgeFadeFx.left,
          );
        }
      }
    }

    // Draw active snap guides
    if (activeGuides.length > 0) {
      const activeCamera = activeScene
        ? sampleCamera(
            activeScene.camera,
            activeScene.animationBlocks || [],
            currentFrame,
          )
        : undefined;
      drawGuides(ctx, activeGuides, nativeWidth, nativeHeight, activeCamera);
    }

    // Rolling FPS measurement for dev overlay
    const now = performance.now();
    const times = frameTimesRef.current;
    times.push(now);
    while (times.length > 0 && times[0] <= now - 1000) {
      times.shift();
    }
    if (now - lastFpsUpdateRef.current > 250) {
      lastFpsUpdateRef.current = now;
      setFps(times.length);
    }
  }, [
    displayW,
    displayH,
    scaleFactor,
    nativeWidth,
    nativeHeight,
    activeScene,
    activeGuides,
    currentFrame,
  ]);

  redrawRef.current = draw;

  // Reactive redraw on changes
  useEffect(() => {
    draw();

    let rafId: number | null = null;
    if (playing) {
      const loop = () => {
        draw();
        rafId = requestAnimationFrame(loop);
      };
      rafId = requestAnimationFrame(loop);
    }

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [playing, draw]);

  // Subscribe to store updates when not playing
  useEffect(() => {
    const unsubDoc = useEditorStore.subscribe(() => {
      const isPlaying = useEditorUIStore.getState().playing;
      if (!isPlaying) {
        redrawRef.current();
      }
    });
    const unsubUI = useEditorUIStore.subscribe(() => {
      const isPlaying = useEditorUIStore.getState().playing;
      if (!isPlaying) {
        redrawRef.current();
      }
    });
    return () => {
      unsubDoc();
      unsubUI();
    };
  }, []);

  // Close zoom dropdown on click outside
  useEffect(() => {
    if (!zoomDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        zoomControlRef.current &&
        !zoomControlRef.current.contains(e.target as Node)
      ) {
        setZoomDropdownOpen(false);
      }
    };
    window.addEventListener("pointerdown", handleClickOutside);
    return () => window.removeEventListener("pointerdown", handleClickOutside);
  }, [zoomDropdownOpen]);

  // Scroll to zoom in / out & trackpad / hand pan
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      // Camera tool wheel: Dolly in/out (camera.z) or adjust FOV with Ctrl/Cmd
      if (activeTool === "camera" || isCameraSelected) {
        if (e.ctrlKey || e.metaKey) {
          const deltaFov = e.deltaY * 0.05;
          const currentFov = activeScene?.camera?.fov ?? 60;
          updateCamera(
            { fov: Math.max(10, Math.min(150, Math.round(currentFov + deltaFov))) },
            activeScene?.id,
          );
        } else {
          const deltaZ = -e.deltaY * 2.5;
          const currentZ = activeScene?.camera?.z ?? 0;
          updateCamera(
            { z: Math.round(currentZ + deltaZ) },
            activeScene?.id,
          );
        }
        return;
      }

      // Pan canvas if hand tool active, or Shift / Alt pressed
      if (activeTool === "hand" || e.shiftKey || e.altKey) {
        setPan((prev) => ({
          x: Math.round(prev.x - e.deltaX),
          y: Math.round(prev.y - e.deltaY),
        }));
        return;
      }

      // Scroll to zoom in or out
      const zoomSensitivity = e.ctrlKey || e.metaKey ? 0.22 : 0.12;
      const delta = -e.deltaY * zoomSensitivity;

      setZoom((prev) => {
        const next = Math.round(prev + delta);
        return Math.min(500, Math.max(10, next));
      });
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, [setZoom, setPan, activeTool, isCameraSelected, activeScene, updateCamera]);

  // Auto-focus inline text editing overlay
  useEffect(() => {
    if (editingTextLayerId && textInputRef.current) {
      textInputRef.current.focus();
      textInputRef.current.select();
    }
  }, [editingTextLayerId]);

  // Convert client coordinates to canvas space
  const getCanvasCoords = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / scaleFactor,
      y: (clientY - rect.top) / scaleFactor,
    };
  };

  // Drag and drop asset / image handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    // 1. Check if an existing asset from the Assets tab was dropped
    const assetJson = e.dataTransfer.getData("application/x-editor-asset");
    if (assetJson) {
      try {
        const asset = JSON.parse(assetJson);
        addAssetToCanvas(asset);
        return;
      } catch {
        // Continue to check files
      }
    }

    // 2. Check if external files were dropped
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      for (const file of files) {
        if (
          file.type.startsWith("image/") ||
          /\.(png|jpe?g|svg|webp|gif|avif)$/i.test(file.name)
        ) {
          // If SVG file, check if it can be parsed into vector layers
          if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
            try {
              const text = await file.text();
              if (isSvgContent(text)) {
                const parsed = parseSvgToLayers(text);
                if (parsed && parsed.layers.length > 0) {
                  useEditorStore
                    .getState()
                    .addImportedLayers(parsed.layers, [parsed.groupId]);

                  // Also save to assets library
                  const reader = new FileReader();
                  reader.onload = () => {
                    if (reader.result) {
                      useEditorStore.getState().addAsset({
                        name: file.name.replace(/\.[^/.]+$/, ""),
                        dataUrl: reader.result as string,
                        width: 800,
                        height: 600,
                      });
                    }
                  };
                  reader.readAsDataURL(file);
                  continue;
                }
              }
            } catch {
              // Fallback to raster image import
            }
          }

          // Import raster image (or non-parsed SVG)
          await importImageFile(file);
        } else if (
          file.type.startsWith("audio/") ||
          /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(file.name)
        ) {
          // Import soundtrack file with waveform decoding
          try {
            const decoded = await decodeAudioFile(file);
            useEditorStore.getState().setAudioTrack(activeScene.id, {
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
            console.warn("Failed to decode dropped audio file:", err);
          }
        }
      }
    }
  };

  // Handle stage pointer down
  const handleStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // If text editing is active, commit it on outside click
    if (editingTextLayerId) {
      commitTextEdit();
    }

    // Pan tool or middle click or space key
    if (activeTool === "hand" || e.button === 1 || isSpacePressed) {
      dragOpRef.current = {
        type: "pan",
        startClientX: e.clientX,
        startClientY: e.clientY,
        initialPan: { ...pan },
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    // Camera Tool (3D Orbit, Pan, Dolly)
    if (activeTool === "camera") {
      const mode = (e.shiftKey || e.button === 2) ? "pan" : e.altKey ? "dolly" : "orbit";
      dragOpRef.current = {
        type: "camera",
        cameraDragMode: mode,
        startClientX: e.clientX,
        startClientY: e.clientY,
        initialCamera: {
          x: activeScene.camera?.x ?? 0,
          y: activeScene.camera?.y ?? 0,
          z: activeScene.camera?.z ?? 0,
          pitch: activeScene.camera?.pitch ?? 0,
          yaw: activeScene.camera?.yaw ?? 0,
          roll: activeScene.camera?.roll ?? 0,
          fov: activeScene.camera?.fov ?? 60,
          focusDistance: activeScene.camera?.focusDistance ?? 1000,
        },
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    // Tilt (3D Camera orbit) tool
    if (activeTool === "tilt") {
      dragOpRef.current = {
        type: "tilt",
        startClientX: e.clientX,
        startClientY: e.clientY,
        initialCamera: {
          x: activeScene.camera?.x ?? 0,
          y: activeScene.camera?.y ?? 0,
          z: activeScene.camera?.z ?? 0,
          pitch: activeScene.camera?.pitch ?? 0,
          yaw: activeScene.camera?.yaw ?? 0,
          roll: activeScene.camera?.roll ?? 0,
          fov: activeScene.camera?.fov ?? 60,
          focusDistance: activeScene.camera?.focusDistance ?? 1000,
        },
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    const { x: canvasX, y: canvasY } = getCanvasCoords(e.clientX, e.clientY);
    const layers = activeScene.layers || [];
    const animationBlocks = activeScene.animationBlocks || [];
    const currentCamera = sampleCamera(
      activeScene.camera,
      animationBlocks,
      currentFrame,
    );

    // Shape Tool: Click canvas to place default rectangle
    if (activeTool === "shape") {
      const width = 200;
      const height = 200;
      const { worldX, worldY } = canvasToWorld(
        canvasX,
        canvasY,
        currentCamera,
        nativeWidth,
        nativeHeight,
        0,
      );
      const newId = addLayer(activeScene.id, {
        type: "shape",
        name: `Rectangle ${(activeScene.layers.length || 0) + 1}`,
        transform: {
          x: Math.round(Math.max(0, worldX - width / 2)),
          y: Math.round(Math.max(0, worldY - height / 2)),
          width,
          height,
          rotation: 0,
          depth: 0,
        },
        shape: {
          kind: "rect",
          fill: "#38bdf8",
          stroke: "#0284c7",
        },
      });
      selectLayers([newId]);
      setActiveTool("scene");
      return;
    }

    // Text Tool: Click canvas to place editable text layer
    if (activeTool === "text") {
      const { worldX, worldY } = canvasToWorld(
        canvasX,
        canvasY,
        currentCamera,
        nativeWidth,
        nativeHeight,
        0,
      );
      const newId = addLayer(activeScene.id, {
        type: "text",
        name: `Text ${(activeScene.layers.length || 0) + 1}`,
        transform: {
          x: Math.round(Math.max(0, worldX)),
          y: Math.round(Math.max(0, worldY - 24)),
          width: 260,
          height: 52,
          rotation: 0,
          depth: 0,
        },
        text: {
          content: "Heading Text",
          fontSize: 32,
          fontFamily: "Inter",
          color: "#ffffff",
          align: "left",
        },
      });
      selectLayers([newId]);
      setEditingTextLayerId(newId);
      setEditingTextValue("Heading Text");
      setActiveTool("scene");
      return;
    }

    // Scene (Select) / Move / Scissors Tool
    if (activeTool === "scene" || activeTool === "move" || activeTool === "scissors") {
      // Hit-test layers top-down using projected camera coordinates
      let hitLayer: Layer | null = null;
      for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i];
        const { effectiveLayer } = getScreenTransform(
          layer,
          animationBlocks,
          currentFrame,
          currentCamera,
          { width: nativeWidth, height: nativeHeight },
          layers,
        );
        if (hitTestLayer(effectiveLayer, canvasX, canvasY)) {
          hitLayer = layer;
          break;
        }
      }

      if (hitLayer) {
        // Resolve group hierarchy if user isn't holding cmd/ctrl to deep-select
        let targetLayer = hitLayer;
        if (!e.metaKey && !e.ctrlKey) {
          let curr = hitLayer;
          while (curr.parentId) {
            const parent = layers.find((l) => l.id === curr.parentId);
            if (parent && parent.type === "group") {
              if (selectedLayerIds.includes(parent.id)) {
                break;
              }
              targetLayer = parent;
              curr = parent;
            } else {
              break;
            }
          }
        }

        let newSelection = selectedLayerIds;
        let pendingSingleSelectId: string | undefined = undefined;

        if (e.metaKey || e.ctrlKey) {
          if (selectedLayerIds.includes(targetLayer.id)) {
            newSelection = selectedLayerIds.filter((id) => id !== targetLayer.id);
          } else {
            newSelection = [...selectedLayerIds, targetLayer.id];
          }
          selectLayers(newSelection);
        } else if (e.shiftKey) {
          if (!selectedLayerIds.includes(targetLayer.id)) {
            newSelection = [...selectedLayerIds, targetLayer.id];
            selectLayers(newSelection);
          }
        } else {
          // If clicking an already selected item in a multi-selection, preserve selection for drag
          if (selectedLayerIds.includes(targetLayer.id) && selectedLayerIds.length > 1) {
            pendingSingleSelectId = targetLayer.id;
          } else if (!selectedLayerIds.includes(targetLayer.id)) {
            newSelection = [targetLayer.id];
            selectLayers(newSelection);
          }
        }

        // Map initial transforms for all selected layers and children of any selected groups
        const initialTransforms = new Map<string, Transform>();
        const allSelectedAndChildren = new Set(newSelection);
        let expanded = true;
        while (expanded) {
          expanded = false;
          for (const l of layers) {
            if (l.parentId && allSelectedAndChildren.has(l.parentId) && !allSelectedAndChildren.has(l.id)) {
              allSelectedAndChildren.add(l.id);
              expanded = true;
            }
          }
        }
        for (const layer of layers) {
          if (allSelectedAndChildren.has(layer.id)) {
            initialTransforms.set(layer.id, { ...layer.transform });
          }
        }

        // Start drag move operation
        const otherLayers = activeScene.layers.filter((l) => !newSelection.includes(l.id));
        const candidates = getSnapCandidates(
          targetLayer,
          otherLayers,
          nativeWidth,
          nativeHeight,
        );

        const screen = getScreenTransform(
          targetLayer,
          animationBlocks,
          currentFrame,
          currentCamera,
          { width: nativeWidth, height: nativeHeight },
          layers,
        );

        dragOpRef.current = {
          type: "move",
          startClientX: e.clientX,
          startClientY: e.clientY,
          layerId: targetLayer.id,
          initialTransform: { ...targetLayer.transform },
          initialTransforms,
          candidates,
          otherLayers,
          projectedScale: screen.scale,
          pendingSingleSelectId,
          hasMoved: false,
        };

        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } else {
        // Clicked empty canvas space
        selectLayers([]);
      }
    }
  };

  // Start resize handle drag
  const startResize = (
    e: React.PointerEvent<HTMLDivElement>,
    handle: ResizeHandle,
    layer: Layer,
  ) => {
    e.stopPropagation();
    e.preventDefault();

    const otherLayers = activeScene.layers.filter((l) => l.id !== layer.id);
    const candidates = getSnapCandidates(
      layer,
      otherLayers,
      nativeWidth,
      nativeHeight,
    );

    // Collect child transforms if layer is a group or has children
    const initialTransforms = new Map<string, Transform>();
    const childIds = new Set<string>();
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const l of activeScene.layers) {
        if (
          l.parentId &&
          (l.parentId === layer.id || childIds.has(l.parentId)) &&
          !childIds.has(l.id)
        ) {
          childIds.add(l.id);
          expanded = true;
        }
      }
    }
    for (const l of activeScene.layers) {
      if (childIds.has(l.id)) {
        initialTransforms.set(l.id, { ...l.transform });
      }
    }

    const currentCamera = sampleCamera(
      activeScene?.camera || { x: 0, y: 0, z: 0, fov: 60, focusDistance: 1000 },
      activeScene?.animationBlocks || [],
      currentFrame,
    );
    const screen = getScreenTransform(
      layer,
      activeScene?.animationBlocks || [],
      currentFrame,
      currentCamera,
      { width: nativeWidth, height: nativeHeight },
      activeScene?.layers || [],
    );

    dragOpRef.current = {
      type: "resize",
      startClientX: e.clientX,
      startClientY: e.clientY,
      layerId: layer.id,
      initialTransform: { ...layer.transform },
      initialTransforms,
      resizeHandle: handle,
      candidates,
      otherLayers,
      projectedScale: screen.scale,
    };

    if (containerRef.current) {
      containerRef.current.setPointerCapture(e.pointerId);
    }
  };

  // Start rotate handle drag
  const startRotate = (
    e: React.PointerEvent<HTMLDivElement>,
    layer: Layer,
  ) => {
    e.stopPropagation();
    e.preventDefault();

    const currentCamera = sampleCamera(
      activeScene?.camera || { x: 0, y: 0, z: 0, fov: 60, focusDistance: 1000 },
      activeScene?.animationBlocks || [],
      currentFrame,
    );
    const screen = getScreenTransform(
      layer,
      activeScene?.animationBlocks || [],
      currentFrame,
      currentCamera,
      { width: nativeWidth, height: nativeHeight },
      activeScene?.layers || [],
    );

    const screenCenterX = screen.x + screen.width / 2;
    const screenCenterY = screen.y + screen.height / 2;
    const worldCenterX = layer.transform.x + layer.transform.width / 2;
    const worldCenterY = layer.transform.y + layer.transform.height / 2;

    const { x: pointerCanvasX, y: pointerCanvasY } = getCanvasCoords(
      e.clientX,
      e.clientY,
    );

    const startAngle =
      (Math.atan2(pointerCanvasY - screenCenterY, pointerCanvasX - screenCenterX) * 180) /
      Math.PI;

    const initialTransforms = new Map<string, Transform>();
    const childIds = new Set<string>();
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const l of activeScene.layers) {
        if (
          l.parentId &&
          (l.parentId === layer.id || childIds.has(l.parentId)) &&
          !childIds.has(l.id)
        ) {
          childIds.add(l.id);
          expanded = true;
        }
      }
    }
    for (const l of activeScene.layers) {
      if (childIds.has(l.id)) {
        initialTransforms.set(l.id, { ...l.transform });
      }
    }

    dragOpRef.current = {
      type: "rotate",
      startClientX: e.clientX,
      startClientY: e.clientY,
      layerId: layer.id,
      initialTransform: { ...layer.transform },
      initialTransforms,
      startAngle,
      groupCenter: { x: worldCenterX, y: worldCenterY },
      screenCenter: { x: screenCenterX, y: screenCenterY },
    };

    if (containerRef.current) {
      containerRef.current.setPointerCapture(e.pointerId);
    }
  };

  // Pointer Move (Dragging, Resizing, Panning)
  const handleStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const op = dragOpRef.current;
    if (!op) return;

    if (op.type === "pan" && op.initialPan) {
      const dx = e.clientX - op.startClientX;
      const dy = e.clientY - op.startClientY;
      setPan({
        x: Math.round(op.initialPan.x + dx),
        y: Math.round(op.initialPan.y + dy),
      });
      return;
    }

    if (op.type === "camera" && op.initialCamera) {
      const dx = e.clientX - op.startClientX;
      const dy = e.clientY - op.startClientY;

      if (op.cameraDragMode === "pan") {
        // Pan camera position X and Y
        const panSensitivity = 1.0;
        updateCamera(
          {
            x: Math.round(op.initialCamera.x - dx * panSensitivity),
            y: Math.round(op.initialCamera.y - dy * panSensitivity),
          },
          activeScene.id,
        );
      } else if (op.cameraDragMode === "dolly") {
        // Dolly camera depth Z
        const dollySensitivity = 2.5;
        updateCamera(
          {
            z: Math.round(op.initialCamera.z - dy * dollySensitivity),
          },
          activeScene.id,
        );
      } else {
        // 3D Orbit: Yaw (horizontal pan angle) and Pitch (vertical tilt angle)
        const orbitSensitivity = 0.35;
        const newYaw = (op.initialCamera.yaw ?? 0) + dx * orbitSensitivity;
        const newPitch = Math.max(
          -85,
          Math.min(85, (op.initialCamera.pitch ?? 0) - dy * orbitSensitivity),
        );
        updateCamera(
          {
            yaw: Math.round(newYaw * 10) / 10,
            pitch: Math.round(newPitch * 10) / 10,
          },
          activeScene.id,
        );
      }
      return;
    }

    if (op.type === "tilt" && op.initialCamera) {
      const dx = e.clientX - op.startClientX;
      const dy = e.clientY - op.startClientY;
      const orbitSensitivity = 0.35;
      const newYaw = (op.initialCamera.yaw ?? 0) + dx * orbitSensitivity;
      const newPitch = Math.max(
        -85,
        Math.min(85, (op.initialCamera.pitch ?? 0) - dy * orbitSensitivity),
      );
      updateCamera(
        {
          yaw: Math.round(newYaw * 10) / 10,
          pitch: Math.round(newPitch * 10) / 10,
        },
        activeScene.id,
      );
      return;
    }

    if (op.type === "move" && op.layerId && op.initialTransform) {
      const dist = Math.hypot(e.clientX - op.startClientX, e.clientY - op.startClientY);
      if (dist > 3) {
        op.hasMoved = true;
      }

      const moveScale = op.projectedScale && op.projectedScale > 0 ? op.projectedScale : 1.0;
      const deltaCanvasX = (e.clientX - op.startClientX) / scaleFactor;
      const deltaCanvasY = (e.clientY - op.startClientY) / scaleFactor;
      const deltaWorldX = deltaCanvasX / moveScale;
      const deltaWorldY = deltaCanvasY / moveScale;

      const tentative: Transform = {
        ...op.initialTransform,
        x: Math.round(op.initialTransform.x + deltaWorldX),
        y: Math.round(op.initialTransform.y + deltaWorldY),
      };

      // Snapping threshold scaled by zoom
      const snapThreshold = Math.max(4, 6 / (currentZoom / 100));
      const snapped = snapTransform(
        tentative,
        op.candidates || { x: [], y: [] },
        op.otherLayers || [],
        snapThreshold,
      );

      setActiveGuides(snapped.guides);

      const finalDx = snapped.x - op.initialTransform.x;
      const finalDy = snapped.y - op.initialTransform.y;

      if (op.initialTransforms && op.initialTransforms.size > 1) {
        op.initialTransforms.forEach((initT, lId) => {
          updateLayer(lId, {
            transform: {
              ...initT,
              x: Math.round(initT.x + finalDx),
              y: Math.round(initT.y + finalDy),
            },
          });
        });
      } else {
        updateLayer(op.layerId, {
          transform: {
            ...op.initialTransform,
            x: Math.round(snapped.x),
            y: Math.round(snapped.y),
          },
        });
      }
      return;
    }

    if (
      op.type === "rotate" &&
      op.layerId &&
      op.initialTransform &&
      op.groupCenter &&
      typeof op.startAngle === "number"
    ) {
      const { x: pointerCanvasX, y: pointerCanvasY } = getCanvasCoords(
        e.clientX,
        e.clientY,
      );
      const center = op.screenCenter || op.groupCenter;
      const currentAngle =
        (Math.atan2(
          pointerCanvasY - center.y,
          pointerCanvasX - center.x,
        ) *
          180) /
        Math.PI;
      let deltaAngle = currentAngle - op.startAngle;

      let newRotation = op.initialTransform.rotation + deltaAngle;
      if (e.shiftKey) {
        newRotation = Math.round(newRotation / 15) * 15;
        deltaAngle = newRotation - op.initialTransform.rotation;
      }

      updateLayer(op.layerId, {
        transform: {
          ...op.initialTransform,
          rotation: Math.round(newRotation),
        },
      });

      // If group has children, rotate each around group center
      if (op.initialTransforms && op.initialTransforms.size > 0) {
        const rad = (deltaAngle * Math.PI) / 180;
        const cosRad = Math.cos(rad);
        const sinRad = Math.sin(rad);

        op.initialTransforms.forEach((childInit, childId) => {
          const childCX = childInit.x + childInit.width / 2;
          const childCY = childInit.y + childInit.height / 2;
          const relX = childCX - op.groupCenter!.x;
          const relY = childCY - op.groupCenter!.y;

          const rotRelX = relX * cosRad - relY * sinRad;
          const rotRelY = relX * sinRad + relY * cosRad;

          const newChildCX = op.groupCenter!.x + rotRelX;
          const newChildCY = op.groupCenter!.y + rotRelY;

          updateLayer(childId, {
            transform: {
              ...childInit,
              x: Math.round(newChildCX - childInit.width / 2),
              y: Math.round(newChildCY - childInit.height / 2),
              rotation: Math.round((childInit.rotation + deltaAngle) % 360),
            },
          });
        });
      }
      return;
    }

    if (
      op.type === "resize" &&
      op.layerId &&
      op.initialTransform &&
      op.resizeHandle
    ) {
      const handle = op.resizeHandle;
      const init = op.initialTransform;
      const moveScale = op.projectedScale && op.projectedScale > 0 ? op.projectedScale : 1.0;
      const deltaScreenX = (e.clientX - op.startClientX) / (scaleFactor * moveScale);
      const deltaScreenY = (e.clientY - op.startClientY) / (scaleFactor * moveScale);

      // Project screen delta into layer's rotated local coordinate space
      const rad = (-init.rotation * Math.PI) / 180;
      const localDx = deltaScreenX * Math.cos(rad) - deltaScreenY * Math.sin(rad);
      const localDy = deltaScreenX * Math.sin(rad) + deltaScreenY * Math.cos(rad);

      let newWidth = init.width;
      let newHeight = init.height;
      let localOffsetX = 0;
      let localOffsetY = 0;

      // Calculate width/height changes and local origin shifts based on handle
      if (handle.includes("e")) newWidth = init.width + localDx;
      if (handle.includes("w")) {
        newWidth = init.width - localDx;
        localOffsetX = localDx;
      }
      if (handle.includes("s")) newHeight = init.height + localDy;
      if (handle.includes("n")) {
        newHeight = init.height - localDy;
        localOffsetY = localDy;
      }

      // Aspect ratio lock with Shift key
      if (e.shiftKey && init.height > 0) {
        const aspect = init.width / init.height;
        if (Math.abs(localDx) > Math.abs(localDy)) {
          newHeight = newWidth / aspect;
        } else {
          newWidth = newHeight * aspect;
        }
      }

      // Enforce minimum dimensions
      const minSize = 12;
      if (newWidth < minSize) {
        newWidth = minSize;
        if (handle.includes("w")) localOffsetX = init.width - minSize;
      }
      if (newHeight < minSize) {
        newHeight = minSize;
        if (handle.includes("n")) localOffsetY = init.height - minSize;
      }

      // Rotate local offset back to canvas space to compute top-left x, y
      const unrad = (init.rotation * Math.PI) / 180;
      const canvasOffsetX =
        localOffsetX * Math.cos(unrad) - localOffsetY * Math.sin(unrad);
      const canvasOffsetY =
        localOffsetX * Math.sin(unrad) + localOffsetY * Math.cos(unrad);

      const nextGroupTransform = {
        ...init,
        x: Math.round(init.x + canvasOffsetX),
        y: Math.round(init.y + canvasOffsetY),
        width: Math.round(newWidth),
        height: Math.round(newHeight),
      };

      updateLayer(op.layerId, {
        transform: nextGroupTransform,
      });

      // Redistribute proportionally to group children
      if (op.initialTransforms && op.initialTransforms.size > 0) {
        const initW = Math.max(1, init.width);
        const initH = Math.max(1, init.height);
        op.initialTransforms.forEach((childInit, childId) => {
          const uX = (childInit.x - init.x) / initW;
          const uY = (childInit.y - init.y) / initH;
          const uW = childInit.width / initW;
          const uH = childInit.height / initH;

          const newChildX = Math.round(nextGroupTransform.x + uX * nextGroupTransform.width);
          const newChildY = Math.round(nextGroupTransform.y + uY * nextGroupTransform.height);
          const newChildW = Math.max(1, Math.round(uW * nextGroupTransform.width));
          const newChildH = Math.max(1, Math.round(uH * nextGroupTransform.height));

          updateLayer(childId, {
            transform: {
              ...childInit,
              x: newChildX,
              y: newChildY,
              width: newChildW,
              height: newChildH,
            },
          });
        });
      }
    }
  };

  // Pointer Up (End gesture)
  const handleStagePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragOpRef.current) {
      const op = dragOpRef.current;
      if (!op.hasMoved && op.pendingSingleSelectId) {
        selectLayers([op.pendingSingleSelectId]);
      }
      dragOpRef.current = null;
      setActiveGuides([]);
      try {
        if (containerRef.current) {
          containerRef.current.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Capture release safety
      }
    }
  };

  // Double click text layer to edit inline
  const handleStageDoubleClick = (e: React.PointerEvent<HTMLDivElement>) => {
    const { x: canvasX, y: canvasY } = getCanvasCoords(e.clientX, e.clientY);
    const layers = activeScene.layers || [];
    const animationBlocks = activeScene.animationBlocks || [];
    const currentCamera = sampleCamera(
      activeScene.camera,
      animationBlocks,
      currentFrame,
    );

    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      if (layer.type !== "text" || !layer.visible || layer.locked) continue;
      const { effectiveLayer } = getScreenTransform(
        layer,
        animationBlocks,
        currentFrame,
        currentCamera,
        { width: nativeWidth, height: nativeHeight },
        layers,
      );
      if (hitTestLayer(effectiveLayer, canvasX, canvasY)) {
        selectLayers([layer.id]);
        setEditingTextLayerId(layer.id);
        setEditingTextValue(layer.text?.content || "");
        break;
      }
    }
  };

  // Commit inline text editing
  const commitTextEdit = () => {
    if (editingTextLayerId) {
      const layer = activeScene.layers.find((l) => l.id === editingTextLayerId);
      if (layer && layer.text) {
        updateLayer(editingTextLayerId, {
          text: {
            ...layer.text,
            content: editingTextValue,
          },
        });
      }
      setEditingTextLayerId(null);
    }
  };

  const handleZoomSelect = (preset: number) => {
    setZoom(preset);
    setZoomDropdownOpen(false);
  };

  const handleZoomFit = () => {
    setZoom(100);
    setPan({ x: 0, y: 0 });
    setZoomDropdownOpen(false);
  };

  const handleResetPan = () => {
    setPan({ x: 0, y: 0 });
    setZoomDropdownOpen(false);
  };

  const handleStepZoom = (delta: number) => {
    setZoom((prev) => Math.min(500, Math.max(10, Math.round(prev + delta))));
  };

  // Single selected layer for bounding box and resize handles
  const selectedLayer =
    selectedLayerIds.length === 1
      ? activeScene.layers.find((l) => l.id === selectedLayerIds[0])
      : null;

  // Multi-selected layers for outlines
  const multiSelectedLayers =
    selectedLayerIds.length > 1
      ? activeScene.layers.filter((l) => selectedLayerIds.includes(l.id))
      : [];

  return (
    <div
      ref={containerRef}
      className="stage-wrap"
      style={{
        cursor:
          isSpacePressed
            ? dragOpRef.current?.type === "pan" ? "grabbing" : "grab"
            : activeTool === "hand"
            ? dragOpRef.current?.type === "pan" ? "grabbing" : "grab"
            : activeTool === "tilt"
            ? dragOpRef.current?.type === "tilt" ? "grabbing" : "grab"
            : activeTool === "move"
            ? "move"
            : activeTool === "scissors"
            ? "crosshair"
            : activeTool === "camera"
            ? dragOpRef.current?.type === "camera" ? "grabbing" : "grab"
            : activeTool === "text"
            ? "text"
            : activeTool === "shape"
            ? "crosshair"
            : "default",
        userSelect: "none",
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
      }}
      onPointerDown={handleStagePointerDown}
      onPointerMove={handleStagePointerMove}
      onPointerUp={handleStagePointerUp}
      onPointerCancel={handleStagePointerUp}
      onDoubleClick={handleStageDoubleClick}
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Canvas Viewport Node */}
      <div
        style={{
          position: "relative",
          width: `${Math.round(displayW)}px`,
          height: `${Math.round(displayH)}px`,
          transform: `translate(${pan.x}px, ${pan.y}px)`,
          transition: dragOpRef.current ? "none" : "transform 0.05s ease-out",
          flexShrink: 0,
        }}
      >
        {/* R3F WebGL Canvas Viewport */}
        <div
          className="canvas-container absolute inset-0 overflow-hidden"
          style={{ width: "100%", height: "100%" }}
          data-testid="r3f-canvas-container"
        >
          <R3FSceneCanvas
            ref={r3fCanvasRef}
            scene={activeScene}
            nativeWidth={nativeWidth}
            nativeHeight={nativeHeight}
            frame={currentFrame}
            onCanvasReady={(c) => {
              (canvasRef as any).current = c;
            }}
          />
        </div>

        {/* Snap Guides SVG overlay */}
        <R3FSnapGuides
          guides={activeGuides}
          canvasWidth={nativeWidth}
          canvasHeight={nativeHeight}
          scaleFactor={scaleFactor}
          camera={activeScene?.camera}
        />

        {/* Social Safe Zones Overlay (TikTok / Reels 9:16 & YouTube 16:9) */}
        <SocialSafeZonesOverlay
          aspectRatio={aspectRatio}
          mode={safeZoneMode}
          width={nativeWidth}
          height={nativeHeight}
        />

        {/* Drag & Drop Canvas Visual Indicator Overlay */}
        {isDragOver && (
          <div
            className="absolute inset-0 z-30 pointer-events-none rounded border-2 border-dashed border-[#38bdf8] bg-[#0284c7]/20 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2 shadow-2xl animate-in fade-in duration-150"
            data-testid="canvas-drop-overlay"
          >
            <div className="w-12 h-12 rounded-full bg-[#0284c7]/40 border border-[#38bdf8] flex items-center justify-center text-[#38bdf8] shadow-lg">
              <UploadCloud size={24} className="animate-bounce" />
            </div>
            <span className="text-[11px] font-semibold text-[#f0f9ff] tracking-wide bg-[#0b0f14]/90 px-3 py-1 rounded-full border border-[#38bdf8]/40 shadow-sm">
              Drop image or SVG to add to canvas
            </span>
          </div>
        )}

        {/* Multi-selection outlines */}
        {multiSelectedLayers.map((layer) => {
          const currentCamera = sampleCamera(
            activeScene?.camera || { x: 0, y: 0, z: 0, fov: 60, focusDistance: 1000 },
            activeScene?.animationBlocks || [],
            currentFrame,
          );
          const screen = getScreenTransform(
            layer,
            activeScene?.animationBlocks || [],
            currentFrame,
            currentCamera,
            { width: nativeWidth, height: nativeHeight },
            activeScene?.layers || [],
          );
          return (
            <div
              key={layer.id}
              className="selection-bounding-box"
              style={{
                position: "absolute",
                left: `${screen.x * scaleFactor}px`,
                top: `${screen.y * scaleFactor}px`,
                width: `${screen.width * scaleFactor}px`,
                height: `${screen.height * scaleFactor}px`,
                transform: `perspective(800px) rotate(${screen.rotation}deg) rotateX(${layer.transform.rotateX || 0}deg) rotateY(${layer.transform.rotateY || 0}deg)`,
                transformStyle: "preserve-3d",
                transformOrigin: "center center",
                border: "1px dashed #38bdf8",
                borderRadius: "0px",
                background: "transparent",
                backgroundColor: "transparent",
                backdropFilter: "none",
                boxShadow: "none",
                pointerEvents: "none",
                boxSizing: "border-box",
              }}
            />
          );
        })}

        {/* Single Selection Bounding Box and Resize/Rotate Handles */}
        {selectedLayer && selectedLayer.visible && !editingTextLayerId && (() => {
          const currentCamera = sampleCamera(
            activeScene?.camera || { x: 0, y: 0, z: 0, fov: 60, focusDistance: 1000 },
            activeScene?.animationBlocks || [],
            currentFrame,
          );
          const screen = getScreenTransform(
            selectedLayer,
            activeScene?.animationBlocks || [],
            currentFrame,
            currentCamera,
            { width: nativeWidth, height: nativeHeight },
            activeScene?.layers || [],
          );
          return (
            <div
              id="selection-bounding-box"
              className="selection-bounding-box"
              style={{
                position: "absolute",
                left: `${screen.x * scaleFactor}px`,
                top: `${screen.y * scaleFactor}px`,
                width: `${screen.width * scaleFactor}px`,
                height: `${screen.height * scaleFactor}px`,
                transform: `perspective(800px) rotate(${screen.rotation}deg) rotateX(${selectedLayer.transform.rotateX || 0}deg) rotateY(${selectedLayer.transform.rotateY || 0}deg)`,
                transformStyle: "preserve-3d",
                transformOrigin: "center center",
                border: "1.5px solid #38bdf8",
                borderRadius: "0px",
                background: "transparent",
                backgroundColor: "transparent",
                backdropFilter: "none",
                boxShadow: "none",
                pointerEvents: "none",
                boxSizing: "border-box",
              }}
            >
              {/* 3D Orientation Indicator Badge */}
              {((selectedLayer.transform.rotateX ?? 0) !== 0 || (selectedLayer.transform.rotateY ?? 0) !== 0) && (
                <div
                  className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-[#0c1319]/90 border border-[#38bdf8]/60 text-[#38bdf8] text-[8px] font-mono px-1.5 py-0.5 rounded shadow-md pointer-events-none whitespace-nowrap"
                  title="3D Tilt active on layer"
                >
                  3D: X {Math.round(selectedLayer.transform.rotateX || 0)}° · Y {Math.round(selectedLayer.transform.rotateY || 0)}°
                </div>
              )}
              {/* Rotation Handle Stalk and Knob */}
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "-22px",
                  width: "1px",
                  height: "22px",
                  background: "#38bdf8",
                  pointerEvents: "none",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "-22px",
                  transform: "translate(-50%, -50%)",
                  width: "8px",
                  height: "8px",
                  background: "#ffffff",
                  border: "1.5px solid #0284c7",
                  borderRadius: "50%",
                  cursor: "grab",
                  pointerEvents: "auto",
                }}
                onPointerDown={(e) => startRotate(e, selectedLayer)}
                title="Rotate layer (drag to rotate, Shift to snap 15°)"
              />

              {/* 8 Resize Handles */}
              {(
                [
                  { handle: "nw", x: 0, y: 0, cursor: "nwse-resize" },
                  { handle: "n", x: 50, y: 0, cursor: "ns-resize" },
                  { handle: "ne", x: 100, y: 0, cursor: "nesw-resize" },
                  { handle: "e", x: 100, y: 50, cursor: "ew-resize" },
                  { handle: "se", x: 100, y: 100, cursor: "nwse-resize" },
                  { handle: "s", x: 50, y: 100, cursor: "ns-resize" },
                  { handle: "sw", x: 0, y: 100, cursor: "nesw-resize" },
                  { handle: "w", x: 0, y: 50, cursor: "ew-resize" },
                ] as const
              ).map(({ handle, x, y, cursor }) => (
                <div
                  key={handle}
                  style={{
                    position: "absolute",
                    left: `${x}%`,
                    top: `${y}%`,
                    transform: "translate(-50%, -50%)",
                    width: "7px",
                    height: "7px",
                    background: "#ffffff",
                    border: "1.5px solid #0284c7",
                    borderRadius: "1px",
                    cursor,
                    pointerEvents: "auto",
                  }}
                  onPointerDown={(e) => startResize(e, handle, selectedLayer)}
                />
              ))}
            </div>
          );
        })()}

        {/* Inline Text Editor Overlay */}
        {editingTextLayerId && selectedLayer && selectedLayer.text && (() => {
          const currentCamera = sampleCamera(
            activeScene?.camera || { x: 0, y: 0, z: 0, fov: 60, focusDistance: 1000 },
            activeScene?.animationBlocks || [],
            currentFrame,
          );
          const screen = getScreenTransform(
            selectedLayer,
            activeScene?.animationBlocks || [],
            currentFrame,
            currentCamera,
            { width: nativeWidth, height: nativeHeight },
            activeScene?.layers || [],
          );
          return (
            <div
              style={{
                position: "absolute",
                left: `${screen.x * scaleFactor}px`,
                top: `${screen.y * scaleFactor}px`,
                width: `${Math.max(100, screen.width * scaleFactor)}px`,
                minHeight: `${screen.height * scaleFactor}px`,
                transform: `rotate(${screen.rotation}deg)`,
                transformOrigin: "center center",
                zIndex: 10,
              }}
            >
              <textarea
                ref={textInputRef}
                value={editingTextValue}
                onChange={(e) => setEditingTextValue(e.target.value)}
                onBlur={commitTextEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    commitTextEdit();
                  } else if (e.key === "Escape") {
                    setEditingTextLayerId(null);
                  }
                }}
                style={{
                  width: "100%",
                  height: "100%",
                  background: "rgba(0, 0, 0, 0.8)",
                  color: selectedLayer.text.color || "#ffffff",
                  fontFamily: selectedLayer.text.fontFamily || "Inter, sans-serif",
                  fontSize: `${(selectedLayer.text.fontSize || 32) * screen.scale * scaleFactor}px`,
                  textAlign: selectedLayer.text.align || "left",
                  border: "1.5px solid #38bdf8",
                  borderRadius: "2px",
                  outline: "none",
                  padding: "2px 4px",
                  resize: "none",
                  overflow: "hidden",
                  lineHeight: "1.2",
                }}
              />
            </div>
          );
        })()}

        {/* Interactive Canvas Focus Pill - ONLY appears when Camera is clicked/active */}
        {isCameraActive && (
          <div
            className="canvas-focus-pill absolute bottom-3 left-1/2 -translate-x-1/2 z-15 flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0d1217]/95 border border-[#10b981]/70 shadow-[0_4px_20px_rgba(0,0,0,0.6)] text-[9px] font-mono select-none backdrop-blur-xs cursor-ew-resize hover:bg-[#131d24] hover:border-[#34d399] transition-all group animate-in fade-in zoom-in-95 duration-150"
            title="Click and drag horizontally to shift Camera Focus Distance"
            data-testid="canvas-focus-pill"
            onPointerDown={handleFocusPillPointerDown}
          >
            <Crosshair size={11} className="text-[#34d399] group-hover:rotate-90 transition-transform duration-300 flex-shrink-0" />
            <span className="text-[#94a3b8] font-sans font-medium">Camera Focus:</span>
            <span className="text-[#34d399] font-bold">{Math.round(activeScene?.camera?.focusDistance ?? 1000)}px</span>
            <span className="text-[7.5px] text-[#6ee7b7]/70 hidden sm:inline">(drag ↔)</span>
          </div>
        )}
      </div>

      {/* Dev-Only FPS and Pipeline Performance Counter */}
      {import.meta.env.DEV && (
        <div
          className="absolute top-2.5 left-2.5 z-20 px-2.5 py-1 rounded bg-[#0b0f14]/90 border border-[#222834] text-[9.5px] font-mono flex items-center gap-2 shadow-md pointer-events-none select-none backdrop-blur-xs"
          data-testid="dev-fps-counter"
        >
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              fps >= 45 ? "bg-emerald-400 animate-pulse" : fps >= 25 ? "bg-amber-400" : "bg-rose-500"
            }`}
          />
          <span className="text-[#64748b]">FPS:</span>
          <span
            className={`font-semibold ${
              fps >= 45 ? "text-emerald-400" : fps >= 25 ? "text-amber-400" : "text-rose-400"
            }`}
          >
            {fps}
          </span>
          {activeScene?.effects?.some((e) => e.type === "bloom" && e.enabled && e.visible) && (
            <span className="px-1 py-0.2 rounded bg-[#581c87]/70 text-[#d8b4fe] text-[7.5px] font-sans border border-[#9333ea]/40">
              Bloom ON
            </span>
          )}
        </div>
      )}

      {/* Floating Zoom Control Dropdown */}
      <div ref={zoomControlRef} className="zoom-control-wrapper">
        <button
          className="zoom-pill"
          type="button"
          data-testid="button-canvas-zoom"
          aria-expanded={zoomDropdownOpen}
          aria-haspopup="true"
          title="Canvas Zoom (Click for dropdown, Scroll canvas to zoom in/out)"
          onClick={() => setZoomDropdownOpen((prev) => !prev)}
        >
          <ZoomIn size={11} strokeWidth={1.7} />
          <span>{Math.round(currentZoom)}%</span>
          <ChevronDown
            size={10}
            strokeWidth={1.8}
            style={{
              transform: zoomDropdownOpen ? "rotate(180deg)" : "none",
              transition: "transform 0.15s ease",
            }}
          />
        </button>

        {zoomDropdownOpen && (
          <div
            className="zoom-dropdown-menu"
            data-testid="zoom-dropdown"
            role="menu"
            aria-label="Canvas zoom levels"
          >
            <div className="zoom-dropdown-header">Zoom Levels</div>

            <button
              className="zoom-dropdown-item"
              type="button"
              role="menuitem"
              data-testid="zoom-option-fit"
              onClick={handleZoomFit}
            >
              <span className="flex items-center gap-1.5">
                <Maximize2 size={11} />
                <span>Fit Screen</span>
              </span>
              <span className="text-[8px] text-[#71747c]">100%</span>
            </button>

            <div className="zoom-dropdown-divider" />

            {ZOOM_PRESETS.map((preset) => {
              const isSelected = Math.round(currentZoom) === preset;
              return (
                <button
                  key={preset}
                  className={`zoom-dropdown-item ${isSelected ? "active" : ""}`}
                  type="button"
                  role="menuitem"
                  data-testid={`zoom-option-${preset}`}
                  onClick={() => handleZoomSelect(preset)}
                >
                  <span>{preset}%</span>
                  {isSelected && <Check size={11} strokeWidth={2.2} />}
                </button>
              );
            })}

            <div className="zoom-dropdown-divider" />

            <div className="flex items-center justify-between px-2 py-1 gap-1">
              <button
                type="button"
                className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-[#202327] hover:bg-[#2a2d33] text-[#cfd1d6] text-[9px] transition-colors"
                title="Zoom in (+25%)"
                data-testid="button-zoom-in"
                onClick={() => handleStepZoom(25)}
              >
                <ZoomIn size={10} />
                <span>In</span>
              </button>
              <button
                type="button"
                className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-[#202327] hover:bg-[#2a2d33] text-[#cfd1d6] text-[9px] transition-colors"
                title="Zoom out (-25%)"
                data-testid="button-zoom-out"
                onClick={() => handleStepZoom(-25)}
              >
                <ZoomOut size={10} />
                <span>Out</span>
              </button>
            </div>

            <button
              className="zoom-dropdown-item"
              type="button"
              role="menuitem"
              data-testid="button-reset-pan"
              onClick={handleResetPan}
            >
              <span className="flex items-center gap-1.5 text-[#9a9ca1]">
                <RotateCcw size={10} />
                <span>Reset Pan</span>
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Social Safe-Zones Quick Toggle */}
      <div className="absolute bottom-2.5 left-2.5 z-20 flex items-center gap-1">
        <button
          type="button"
          data-testid="button-toggle-safe-zones"
          onClick={() =>
            setSafeZoneMode((prev) =>
              prev === "none"
                ? "auto"
                : prev === "auto"
                ? aspectRatio === "9:16"
                  ? "tiktok-9:16"
                  : "youtube-16:9"
                : "none",
            )
          }
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-medium border shadow-md transition-colors backdrop-blur-xs ${
            safeZoneMode !== "none"
              ? "bg-[#082f49]/90 text-[#38bdf8] border-[#0284c7]/70"
              : "bg-[#111317]/90 text-[#9ca3af] hover:text-[#d1d5db] border-[#22252c]"
          }`}
          title="Toggle Social Media Safe-Zone Guides (TikTok / Reels / YouTube UI overlays)"
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              safeZoneMode !== "none" ? "bg-[#38bdf8] animate-pulse" : "bg-[#4b5563]"
            }`}
          />
          <span>
            Safe Zones: {safeZoneMode === "none" ? "Off" : safeZoneMode === "auto" ? "Auto" : safeZoneMode}
          </span>
        </button>
      </div>
    </div>
  );
}
