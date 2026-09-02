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
} from "lucide-react";
import {
  useEditorStore,
  type Layer,
  type Transform,
} from "../store/editor-store";
import {
  getSnapCandidates,
  snapTransform,
  type SnapLine,
  type SnapCandidates,
} from "./snapping";

const imageCache = new Map<string, HTMLImageElement>();

function getImage(src: string, onLoaded?: () => void): HTMLImageElement | null {
  if (!src) return null;
  const cached = imageCache.get(src);
  if (cached) {
    if (cached.complete && cached.naturalWidth > 0) return cached;
    return null;
  }
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = src;
  img.onload = () => {
    imageCache.set(src, img);
    onLoaded?.();
  };
  img.onerror = () => {
    imageCache.set(src, img);
  };
  imageCache.set(src, img);
  return null;
}

function drawLayer(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  requestRedraw: () => void,
) {
  if (!layer.visible || layer.opacity <= 0) return;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity));

  const { x, y, width, height, rotation } = layer.transform;
  const centerX = x + width / 2;
  const centerY = y + height / 2;

  // Move origin to center of layer for rotation
  ctx.translate(centerX, centerY);
  if (rotation) {
    ctx.rotate((rotation * Math.PI) / 180);
  }

  if (layer.type === "shape" && layer.shape) {
    const { kind, fill, stroke } = layer.shape;
    const radius = (layer.shape as any).radius || 0;

    ctx.beginPath();
    if (kind === "ellipse") {
      ctx.ellipse(0, 0, width / 2, height / 2, 0, 0, Math.PI * 2);
    } else {
      if (radius > 0 && typeof ctx.roundRect === "function") {
        ctx.roundRect(-width / 2, -height / 2, width, height, radius);
      } else {
        ctx.rect(-width / 2, -height / 2, width, height);
      }
    }

    if (fill && fill !== "transparent") {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke && stroke !== "transparent") {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = (layer.shape as any).strokeWidth || 2;
      ctx.stroke();
    }
  } else if (layer.type === "text" && layer.text) {
    const {
      content = "",
      fontSize = 32,
      fontFamily = "Inter, system-ui, sans-serif",
      color = "#ffffff",
      align = "left",
    } = layer.text;

    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";

    let textX = -width / 2;
    if (align === "center") {
      textX = 0;
    } else if (align === "right") {
      textX = width / 2;
    }
    ctx.fillText(content, textX, 0);
  } else if (layer.type === "image" && layer.image?.src) {
    const img = getImage(layer.image.src, requestRedraw);
    if (img) {
      ctx.drawImage(img, -width / 2, -height / 2, width, height);
    }
  }

  ctx.restore();
}

// Draw snap guides over canvas
function drawGuides(
  ctx: CanvasRenderingContext2D,
  guides: SnapLine[],
  canvasWidth: number,
  canvasHeight: number,
) {
  if (!guides || guides.length === 0) return;

  ctx.save();
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);

  for (const guide of guides) {
    ctx.beginPath();
    if (guide.axis === "x") {
      const y1 = guide.start !== undefined ? guide.start : 0;
      const y2 = guide.end !== undefined ? guide.end : canvasHeight;
      ctx.moveTo(guide.value, y1);
      ctx.lineTo(guide.value, y2);
    } else {
      const x1 = guide.start !== undefined ? guide.start : 0;
      const x2 = guide.end !== undefined ? guide.end : canvasWidth;
      ctx.moveTo(x1, guide.value);
      ctx.lineTo(x2, guide.value);
    }
    ctx.stroke();

    // Small tick marks for spacing guides
    if (guide.label === "spacing") {
      ctx.save();
      ctx.setLineDash([]);
      ctx.fillStyle = "#38bdf8";
      if (guide.axis === "x") {
        ctx.fillRect(guide.value - 3, (guide.start ?? 0) - 3, 6, 6);
        ctx.fillRect(guide.value - 3, (guide.end ?? canvasHeight) - 3, 6, 6);
      } else {
        ctx.fillRect((guide.start ?? 0) - 3, guide.value - 3, 6, 6);
        ctx.fillRect((guide.end ?? canvasWidth) - 3, guide.value - 3, 6, 6);
      }
      ctx.restore();
    }
  }

  ctx.restore();
}

// Hit-test a layer with rotation
function hitTestLayer(layer: Layer, canvasX: number, canvasY: number): boolean {
  if (!layer.visible) return false;
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
  type: "move" | "resize" | "pan";
  startClientX: number;
  startClientY: number;
  layerId?: string;
  initialTransform?: Transform;
  initialTransforms?: Map<string, Transform>;
  initialPan?: { x: number; y: number };
  resizeHandle?: ResizeHandle;
  candidates?: SnapCandidates;
  otherLayers?: Layer[];
}

const ZOOM_PRESETS = [25, 50, 75, 100, 125, 150, 200, 300, 400];

export function CanvasStage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zoomControlRef = useRef<HTMLDivElement>(null);

  const zoom = useEditorStore((s) => s.zoom);
  const setZoom = useEditorStore((s) => s.setZoom);
  const pan = useEditorStore((s) => s.pan);
  const setPan = useEditorStore((s) => s.setPan);
  const activeTool = useEditorStore((s) => s.activeTool);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const playing = useEditorStore((s) => s.playing);
  const selectedLayerIds = useEditorStore((s) => s.selectedLayerIds);
  const selectLayers = useEditorStore((s) => s.selectLayers);
  const addLayer = useEditorStore((s) => s.addLayer);
  const updateLayer = useEditorStore((s) => s.updateLayer);
  const scenes = useEditorStore((s) => s.scenes);
  const activeSceneId = useEditorStore((s) => s.activeSceneId);
  const aspectRatio = useEditorStore((s) => s.aspectRatio) || "16:9";

  const [containerSize, setContainerSize] = useState({ width: 600, height: 400 });
  const [activeGuides, setActiveGuides] = useState<SnapLine[]>([]);
  const [editingTextLayerId, setEditingTextLayerId] = useState<string | null>(null);
  const [editingTextValue, setEditingTextValue] = useState("");
  const [zoomDropdownOpen, setZoomDropdownOpen] = useState(false);

  const dragOpRef = useRef<DragOperation | null>(null);
  const redrawRef = useRef<() => void>(() => {});
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  const activeScene = useMemo(
    () => scenes.find((s) => s.id === activeSceneId) || scenes[0],
    [scenes, activeSceneId],
  );

  const nativeWidth =
    aspectRatio === "9:16" ? 1080 : aspectRatio === "1:1" ? 1080 : 1920;
  const nativeHeight =
    aspectRatio === "9:16" ? 1920 : aspectRatio === "1:1" ? 1080 : 1080;
  const aspect = nativeWidth / nativeHeight;

  // Measure stage container dimensions
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setContainerSize({ width, height });
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Compute display size and scale factor
  const maxW = Math.max(80, containerSize.width - 64);
  const maxH = Math.max(80, containerSize.height - 80);
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

    // Draw layers in ascending order
    if (activeScene && activeScene.layers) {
      for (const layer of activeScene.layers) {
        drawLayer(ctx, layer, () => draw());
      }
    }

    // Draw active snap guides
    if (activeGuides.length > 0) {
      drawGuides(ctx, activeGuides, nativeWidth, nativeHeight);
    }
  }, [displayW, displayH, scaleFactor, nativeWidth, nativeHeight, activeScene, activeGuides]);

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
    const unsubscribe = useEditorStore.subscribe(() => {
      const isPlaying = useEditorStore.getState().playing;
      if (!isPlaying) {
        redrawRef.current();
      }
    });
    return unsubscribe;
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
  }, [setZoom, setPan, activeTool]);

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

  // Handle stage pointer down
  const handleStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // If text editing is active, commit it on outside click
    if (editingTextLayerId) {
      commitTextEdit();
    }

    // Pan tool or middle click or space key
    if (activeTool === "hand" || e.button === 1 || e.spaceKey) {
      dragOpRef.current = {
        type: "pan",
        startClientX: e.clientX,
        startClientY: e.clientY,
        initialPan: { ...pan },
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    const { x: canvasX, y: canvasY } = getCanvasCoords(e.clientX, e.clientY);

    // Shape Tool: Click canvas to place default rectangle
    if (activeTool === "shape") {
      const width = 200;
      const height = 200;
      const newId = addLayer(activeScene.id, {
        type: "shape",
        name: `Rectangle ${(activeScene.layers.length || 0) + 1}`,
        transform: {
          x: Math.round(Math.max(0, canvasX - width / 2)),
          y: Math.round(Math.max(0, canvasY - height / 2)),
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
      const newId = addLayer(activeScene.id, {
        type: "text",
        name: `Text ${(activeScene.layers.length || 0) + 1}`,
        transform: {
          x: Math.round(Math.max(0, canvasX)),
          y: Math.round(Math.max(0, canvasY - 24)),
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

    // Scene (Select) Tool
    if (activeTool === "scene") {
      // Hit-test layers top-down
      const layers = activeScene.layers || [];
      let hitLayer: Layer | null = null;
      for (let i = layers.length - 1; i >= 0; i--) {
        if (hitTestLayer(layers[i], canvasX, canvasY)) {
          hitLayer = layers[i];
          break;
        }
      }

      if (hitLayer) {
        let newSelection = selectedLayerIds;
        if (e.metaKey || e.ctrlKey) {
          if (selectedLayerIds.includes(hitLayer.id)) {
            newSelection = selectedLayerIds.filter((id) => id !== hitLayer!.id);
          } else {
            newSelection = [...selectedLayerIds, hitLayer.id];
          }
          selectLayers(newSelection);
        } else if (e.shiftKey) {
          if (!selectedLayerIds.includes(hitLayer.id)) {
            newSelection = [...selectedLayerIds, hitLayer.id];
            selectLayers(newSelection);
          }
        } else {
          if (!selectedLayerIds.includes(hitLayer.id)) {
            newSelection = [hitLayer.id];
            selectLayers(newSelection);
          }
        }

        // Map initial transforms for all selected layers
        const initialTransforms = new Map<string, Transform>();
        for (const layer of layers) {
          if (newSelection.includes(layer.id)) {
            initialTransforms.set(layer.id, { ...layer.transform });
          }
        }

        // Start drag move operation
        const otherLayers = activeScene.layers.filter((l) => !newSelection.includes(l.id));
        const candidates = getSnapCandidates(
          hitLayer,
          otherLayers,
          nativeWidth,
          nativeHeight,
        );

        dragOpRef.current = {
          type: "move",
          startClientX: e.clientX,
          startClientY: e.clientY,
          layerId: hitLayer.id,
          initialTransform: { ...hitLayer.transform },
          initialTransforms,
          candidates,
          otherLayers,
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

    dragOpRef.current = {
      type: "resize",
      startClientX: e.clientX,
      startClientY: e.clientY,
      layerId: layer.id,
      initialTransform: { ...layer.transform },
      resizeHandle: handle,
      candidates,
      otherLayers,
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

    if (op.type === "move" && op.layerId && op.initialTransform) {
      const deltaCanvasX = (e.clientX - op.startClientX) / scaleFactor;
      const deltaCanvasY = (e.clientY - op.startClientY) / scaleFactor;

      const tentative: Transform = {
        ...op.initialTransform,
        x: Math.round(op.initialTransform.x + deltaCanvasX),
        y: Math.round(op.initialTransform.y + deltaCanvasY),
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
      op.type === "resize" &&
      op.layerId &&
      op.initialTransform &&
      op.resizeHandle
    ) {
      const handle = op.resizeHandle;
      const init = op.initialTransform;
      const deltaScreenX = (e.clientX - op.startClientX) / scaleFactor;
      const deltaScreenY = (e.clientY - op.startClientY) / scaleFactor;

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

      updateLayer(op.layerId, {
        transform: {
          ...init,
          x: Math.round(init.x + canvasOffsetX),
          y: Math.round(init.y + canvasOffsetY),
          width: Math.round(newWidth),
          height: Math.round(newHeight),
        },
      });
    }
  };

  // Pointer Up (End gesture)
  const handleStagePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragOpRef.current) {
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
          activeTool === "hand"
            ? "grab"
            : activeTool === "text"
            ? "text"
            : activeTool === "shape"
            ? "crosshair"
            : "default",
        userSelect: "none",
        position: "relative",
      }}
      onPointerDown={handleStagePointerDown}
      onPointerMove={handleStagePointerMove}
      onPointerUp={handleStagePointerUp}
      onPointerCancel={handleStagePointerUp}
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
        <canvas
          ref={canvasRef}
          className="canvas"
          data-testid="canvas-preview"
          aria-label="Composition stage preview"
          style={{
            width: "100%",
            height: "100%",
            display: "block",
          }}
        />

        {/* Multi-selection outlines */}
        {multiSelectedLayers.map((layer) => (
          <div
            key={layer.id}
            style={{
              position: "absolute",
              left: `${layer.transform.x * scaleFactor}px`,
              top: `${layer.transform.y * scaleFactor}px`,
              width: `${layer.transform.width * scaleFactor}px`,
              height: `${layer.transform.height * scaleFactor}px`,
              transform: `rotate(${layer.transform.rotation}deg)`,
              transformOrigin: "center center",
              border: "1px dashed #38bdf8",
              pointerEvents: "none",
              boxSizing: "border-box",
            }}
          />
        ))}

        {/* Single Selection Bounding Box and Resize Handles */}
        {selectedLayer && selectedLayer.visible && !editingTextLayerId && (
          <div
            style={{
              position: "absolute",
              left: `${selectedLayer.transform.x * scaleFactor}px`,
              top: `${selectedLayer.transform.y * scaleFactor}px`,
              width: `${selectedLayer.transform.width * scaleFactor}px`,
              height: `${selectedLayer.transform.height * scaleFactor}px`,
              transform: `rotate(${selectedLayer.transform.rotation}deg)`,
              transformOrigin: "center center",
              border: "1.5px solid #38bdf8",
              pointerEvents: "none",
              boxSizing: "border-box",
            }}
          >
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
        )}

        {/* Inline Text Editor Overlay */}
        {editingTextLayerId && selectedLayer && selectedLayer.text && (
          <div
            style={{
              position: "absolute",
              left: `${selectedLayer.transform.x * scaleFactor}px`,
              top: `${selectedLayer.transform.y * scaleFactor}px`,
              width: `${Math.max(100, selectedLayer.transform.width * scaleFactor)}px`,
              minHeight: `${selectedLayer.transform.height * scaleFactor}px`,
              transform: `rotate(${selectedLayer.transform.rotation}deg)`,
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
                fontSize: `${(selectedLayer.text.fontSize || 32) * scaleFactor}px`,
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
        )}
      </div>

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
    </div>
  );
}
