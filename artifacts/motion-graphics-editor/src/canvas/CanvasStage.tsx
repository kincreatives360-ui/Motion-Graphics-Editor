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
  Maximize2,
  UploadCloud,
} from "lucide-react";
import {
  useEditorStore,
  useEditorUIStore,
  type Layer,
  type Transform,
  type ToolId,
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
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { R3FSnapGuides } from "./r3f/R3FSnapGuides";
import {
  useCanvasPointerHandlers,
  type ResizeHandle,
} from "./useCanvasPointerHandlers";

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

function generateArrowPath(w: number, h: number): string {
  const shaftT = Math.max(2, Math.min(10, h * 0.28));
  const headLen = Math.min(w * 0.4, Math.max(12, h));
  const headW = Math.max(10, h);
  const cy = h / 2;
  const shaftEnd = Math.max(0, w - headLen);

  return `M 0 ${cy - shaftT / 2} L ${shaftEnd} ${cy - shaftT / 2} L ${shaftEnd} ${cy - headW / 2} L ${w} ${cy} L ${shaftEnd} ${cy + headW / 2} L ${shaftEnd} ${cy + shaftT / 2} L 0 ${cy + shaftT / 2} Z`;
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
  const animateMode = useEditorUIStore((s) => s.animateMode);
  const selectedLayerIds = useEditorStore((s) => s.selectedLayerIds);
  const selectLayers = useEditorStore((s) => s.selectLayers);
  const addLayer = useEditorStore((s) => s.addLayer);
  const updateLayer = useEditorStore((s) => s.updateLayer);
  const recordKeyframe = useEditorStore((s) => s.recordKeyframe);
  const scenes = useEditorStore((s) => s.scenes);
  const activeSceneId = useEditorStore((s) => s.activeSceneId);
  const aspectRatio = useEditorStore((s) => s.aspectRatio) || "16:9";
  const updateCamera = useEditorStore((s) => s.updateCamera);

  const [containerSize, setContainerSize] = useState({ width: 1200, height: 700 });
  const [editingTextLayerId, setEditingTextLayerId] = useState<string | null>(null);
  const [editingTextValue, setEditingTextValue] = useState("");
  const [zoomDropdownOpen, setZoomDropdownOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const spaceDidPanRef = useRef(false);
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
        spaceDidPanRef.current = false;
        setIsSpacePressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        const target = e.target as HTMLElement | null;
        if (
          !target ||
          (target.tagName !== "INPUT" &&
            target.tagName !== "TEXTAREA" &&
            !target.isContentEditable)
        ) {
          if (!spaceDidPanRef.current) {
            // Space was tapped without panning: toggle play/pause
            useEditorUIStore.getState().setPlaying((p) => !p);
          }
        }
        spaceDidPanRef.current = false;
        setIsSpacePressed(false);
      }
    };

    const handleBlur = () => {
      spaceDidPanRef.current = false;
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
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const scaleFactor = useEditorUIStore((s) => s.zoom) || 100;
  const nativeWidth =
    aspectRatio === "9:16" ? 1080 : aspectRatio === "1:1" ? 1080 : 1920;
  const nativeHeight =
    aspectRatio === "9:16" ? 1920 : aspectRatio === "1:1" ? 1080 : 1080;
  const aspect = nativeWidth / nativeHeight;

  const activeScene = useMemo(
    () => scenes.find((s) => s.id === activeSceneId) || scenes[0],
    [scenes, activeSceneId],
  );

  const {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    activeGuides,
    createDragPreview,
    startResize,
    startRotate,
    dragOpRef,
  } = useCanvasPointerHandlers({
    containerRef,
    canvasRef,
    spaceDidPanRef,
    isSpacePressed,
    setIsSpacePressed,
    scaleFactor,
    nativeWidth,
    nativeHeight,
    aspect,
    currentZoom: zoom || 100,
    activeScene,
    editingTextLayerId,
    setEditingTextLayerId,
    editingTextValue,
    setEditingTextValue,
  });

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
            : activeTool === "shape" ||
              activeTool === "rectangle" ||
              activeTool === "ellipse" ||
              activeTool === "line" ||
              activeTool === "arrow"
            ? "crosshair"
            : "default",
        userSelect: "none",
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
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

        {/* Interactive Drag-to-Create Bounding Box Preview */}
        {createDragPreview && (() => {
          const previewLeft = Math.min(createDragPreview.startX, createDragPreview.currentX) * scaleFactor;
          const previewTop = Math.min(createDragPreview.startY, createDragPreview.currentY) * scaleFactor;
          const previewW = Math.abs(createDragPreview.currentX - createDragPreview.startX) * scaleFactor;
          const previewH = Math.abs(createDragPreview.currentY - createDragPreview.startY) * scaleFactor;
          const nativeW = Math.round(Math.abs(createDragPreview.currentX - createDragPreview.startX));
          const nativeH = Math.round(Math.abs(createDragPreview.currentY - createDragPreview.startY));
          const isEllipse = createDragPreview.tool === "ellipse";

          return (
            <div
              style={{
                position: "absolute",
                left: `${previewLeft}px`,
                top: `${previewTop}px`,
                width: `${Math.max(2, previewW)}px`,
                height: `${Math.max(2, previewH)}px`,
                border: "1.5px dashed #38bdf8",
                borderRadius: isEllipse ? "50%" : "2px",
                backgroundColor: "rgba(56, 189, 248, 0.12)",
                boxShadow: "0 0 10px rgba(56, 189, 248, 0.2)",
                pointerEvents: "none",
                zIndex: 25,
                boxSizing: "border-box",
              }}
            >
              {(nativeW > 5 || nativeH > 5) && (
                <div
                  style={{
                    position: "absolute",
                    bottom: "-24px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    backgroundColor: "rgba(11, 15, 20, 0.92)",
                    border: "1px solid rgba(56, 189, 248, 0.5)",
                    fontSize: "9px",
                    fontFamily: "monospace",
                    color: "#38bdf8",
                    whiteSpace: "nowrap",
                    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.5)",
                    pointerEvents: "none",
                    userSelect: "none",
                  }}
                >
                  {nativeW} × {nativeH}px
                </div>
              )}
            </div>
          );
        })()}

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
              <Textarea
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
        <Button
          variant="ghost"
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
        </Button>

        {zoomDropdownOpen && (
          <div
            className="zoom-dropdown-menu"
            data-testid="zoom-dropdown"
            role="menu"
            aria-label="Canvas zoom levels"
          >
            <div className="zoom-dropdown-header">Zoom Levels</div>

            <Button
              variant="ghost"
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
            </Button>

            <div className="zoom-dropdown-divider" />

            {ZOOM_PRESETS.map((preset) => {
              const isSelected = Math.round(currentZoom) === preset;
              return (
                <Button
                  key={preset}
                  variant="ghost"
                  className={`zoom-dropdown-item ${isSelected ? "active" : ""}`}
                  type="button"
                  role="menuitem"
                  data-testid={`zoom-option-${preset}`}
                  onClick={() => handleZoomSelect(preset)}
                >
                  <span>{preset}%</span>
                  {isSelected && <Check size={11} strokeWidth={2.2} />}
                </Button>
              );
            })}

            <div className="zoom-dropdown-divider" />

            <div className="flex items-center justify-between px-2 py-1 gap-1">
              <Button
                variant="ghost"
                size="sm"
                type="button"
                className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-[#202327] hover:bg-[#2a2d33] text-[#cfd1d6] text-[9px] transition-colors"
                title="Zoom in (+25%)"
                data-testid="button-zoom-in"
                onClick={() => handleStepZoom(25)}
              >
                <ZoomIn size={10} />
                <span>In</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-[#202327] hover:bg-[#2a2d33] text-[#cfd1d6] text-[9px] transition-colors"
                title="Zoom out (-25%)"
                data-testid="button-zoom-out"
                onClick={() => handleStepZoom(-25)}
              >
                <ZoomOut size={10} />
                <span>Out</span>
              </Button>
            </div>

          </div>
        )}
      </div>

      {/* Social Safe-Zones Quick Toggle */}
      <div className="absolute bottom-2.5 left-2.5 z-20 flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
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
        </Button>
      </div>
    </div>
  );
}
