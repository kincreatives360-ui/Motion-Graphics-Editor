import type { Layer, Scene, BloomSettings, Camera } from "../store/editor-store";
import {
  computeRenderedLayer,
  projectLayer,
  sampleCamera,
  dofBlurPx,
  type CameraTransform,
  type AnimationBlock,
} from "../store/animation-blocks";
import { applyBloom } from "./post-processing";

export interface ScreenTransformResult {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scale: number;
  opacity: number;
  effectiveLayer: Layer;
  rendered: ReturnType<typeof computeRenderedLayer>;
  projected: ReturnType<typeof projectLayer>;
}

/**
 * Resolves a layer's rendered state, taking into account parent-hierarchy composition
 * (accumulating parent delta position, rotation, scale, depth, and opacity).
 */
export function computeComposedRenderedLayer(
  layer: Layer,
  blocks: AnimationBlock[],
  frame: number,
  allLayers?: Map<string, Layer> | Layer[],
  visited: Set<string> = new Set(),
): ReturnType<typeof computeRenderedLayer> & { visible: boolean } {
  const ownRendered = computeRenderedLayer(layer, blocks, frame);
  const allLayersMap = Array.isArray(allLayers)
    ? new Map<string, Layer>(allLayers.map((l) => [l.id, l]))
    : allLayers;

  if (!layer.parentId || !allLayersMap || visited.has(layer.id)) {
    return {
      ...ownRendered,
      visible: layer.visible,
    };
  }

  const parent = allLayersMap.get(layer.parentId);
  if (!parent) {
    return {
      ...ownRendered,
      visible: layer.visible,
    };
  }

  visited.add(layer.id);
  const parentRendered = computeComposedRenderedLayer(
    parent,
    blocks,
    frame,
    allLayersMap,
    visited,
  );

  // If any parent in chain is hidden, child is also hidden
  const visible = layer.visible && parentRendered.visible;

  // Parent base geometry vs composed rendered geometry
  const pBaseW = Math.max(1, parent.transform.width);
  const pBaseH = Math.max(1, parent.transform.height);
  const pBaseCX = parent.transform.x + pBaseW / 2;
  const pBaseCY = parent.transform.y + pBaseH / 2;

  const pRenW = parentRendered.transform.width;
  const pRenH = parentRendered.transform.height;
  const pRenCX = parentRendered.transform.x + pRenW / 2;
  const pRenCY = parentRendered.transform.y + pRenH / 2;

  const scaleX = pRenW / pBaseW;
  const scaleY = pRenH / pBaseH;

  const dRot = (parentRendered.transform.rotation || 0) - (parent.transform.rotation || 0);
  const dRotRad = (dRot * Math.PI) / 180;

  // Child center relative to parent base center
  const childCX = ownRendered.transform.x + ownRendered.transform.width / 2;
  const childCY = ownRendered.transform.y + ownRendered.transform.height / 2;
  const relX = childCX - pBaseCX;
  const relY = childCY - pBaseCY;

  // Scale relative offset
  const scaledRelX = relX * scaleX;
  const scaledRelY = relY * scaleY;

  // Rotate relative offset by parent rotation delta
  const cosRot = Math.cos(dRotRad);
  const sinRot = Math.sin(dRotRad);
  const rotRelX = scaledRelX * cosRot - scaledRelY * sinRot;
  const rotRelY = scaledRelX * sinRot + scaledRelY * cosRot;

  // Composed child center
  const newChildCX = pRenCX + rotRelX;
  const newChildCY = pRenCY + rotRelY;

  const newChildWidth = Math.max(1, ownRendered.transform.width * Math.abs(scaleX));
  const newChildHeight = Math.max(1, ownRendered.transform.height * Math.abs(scaleY));

  const composedTransform = {
    ...ownRendered.transform,
    x: newChildCX - newChildWidth / 2,
    y: newChildCY - newChildHeight / 2,
    width: newChildWidth,
    height: newChildHeight,
    rotation: (ownRendered.transform.rotation || 0) + dRot,
    depth: (ownRendered.transform.depth || 0) + (parentRendered.transform.depth || 0),
  };

  const composedOpacity = Math.max(
    0,
    Math.min(1, ownRendered.opacity * parentRendered.opacity),
  );

  return {
    ...ownRendered,
    transform: composedTransform,
    opacity: composedOpacity,
    visible,
  };
}

/**
 * Single shared source of truth for mapping a layer to its on-screen position,
 * dimensions, projection, and effective render layer.
 */
export function getScreenTransform(
  layer: Layer,
  blocks: AnimationBlock[],
  frame: number,
  camera: Camera,
  canvasSize: { width: number; height: number },
  allLayers?: Layer[],
): ScreenTransformResult {
  const allLayersMap = allLayers
    ? new Map<string, Layer>(allLayers.map((l) => [l.id, l]))
    : undefined;

  const rendered = computeComposedRenderedLayer(
    layer,
    blocks,
    frame,
    allLayersMap,
  );

  const cameraCtx: CameraTransform = {
    camera,
    canvasWidth: canvasSize.width,
    canvasHeight: canvasSize.height,
  };

  const projected = projectLayer(
    { ...layer, transform: rendered.transform },
    cameraCtx,
  );

  const screenX = projected.x;
  const screenY = projected.y;
  const screenW = rendered.transform.width * projected.scale;
  const screenH = rendered.transform.height * projected.scale;
  const screenRotation = rendered.transform.rotation || 0;
  const screenOpacity = rendered.opacity;

  const effectiveLayer: Layer = {
    ...layer,
    transform: {
      ...rendered.transform,
      x: screenX,
      y: screenY,
      width: screenW,
      height: screenH,
      rotation: screenRotation,
    },
    opacity: screenOpacity,
    visible: rendered.visible,
    shape: layer.shape
      ? {
          ...layer.shape,
          fill: rendered.fill ?? layer.shape.fill,
          stroke: rendered.stroke ?? layer.shape.stroke,
        }
      : undefined,
    text: layer.text
      ? {
          ...layer.text,
          fontSize:
            (rendered.fontSize ?? layer.text.fontSize ?? 32) * projected.scale,
          color: rendered.fill ?? layer.text.color,
        }
      : undefined,
  };

  return {
    x: screenX,
    y: screenY,
    width: screenW,
    height: screenH,
    rotation: screenRotation,
    scale: projected.scale,
    opacity: screenOpacity,
    effectiveLayer,
    rendered,
    projected,
  };
}

export const globalImageCache = new Map<string, HTMLImageElement>();

export function getCachedImage(
  src: string,
  onLoaded?: () => void,
): HTMLImageElement | null {
  if (!src) return null;
  const cached = globalImageCache.get(src);
  if (cached) {
    if (cached.complete && cached.naturalWidth > 0) return cached;
    return null;
  }
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = src;
  img.onload = () => {
    globalImageCache.set(src, img);
    onLoaded?.();
  };
  img.onerror = () => {
    globalImageCache.set(src, img);
  };
  globalImageCache.set(src, img);
  return null;
}

/**
 * Preload all images referenced by scene layers so they render without popping during export.
 */
export async function preloadSceneImages(scene: Scene): Promise<void> {
  const imageSources = scene.layers
    .filter((l) => l.type === "image" && l.image?.src)
    .map((l) => l.image!.src);

  if (imageSources.length === 0) return;

  await Promise.all(
    imageSources.map((src) => {
      const existing = globalImageCache.get(src);
      if (existing && existing.complete && existing.naturalWidth > 0) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          globalImageCache.set(src, img);
          resolve();
        };
        img.onerror = () => {
          globalImageCache.set(src, img);
          resolve();
        };
        img.src = src;
      });
    }),
  );
}

/**
 * Render a single Layer entity to a 2D canvas context.
 */
export function drawLayer(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  requestRedraw?: () => void,
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
    const pathData = layer.shape.path;

    if (pathData) {
      try {
        const path2d = new Path2D(pathData);
        const ox = (layer.shape as any).pathOriginX ?? 0;
        const oy = (layer.shape as any).pathOriginY ?? 0;

        ctx.save();
        ctx.translate(-width / 2 - ox, -height / 2 - oy);

        if (fill && fill !== "transparent") {
          ctx.fillStyle = fill;
          ctx.fill(path2d);
        }
        if (stroke && stroke !== "transparent") {
          ctx.strokeStyle = stroke;
          ctx.lineWidth = (layer.shape as any).strokeWidth || 2;
          ctx.stroke(path2d);
        }
        ctx.restore();
      } catch {
        // Path2D fallback
      }
    } else {
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
    const img = getCachedImage(layer.image.src, requestRedraw);
    if (img) {
      ctx.drawImage(img, -width / 2, -height / 2, width, height);
    }
  }

  ctx.restore();
}

export interface RenderSceneFrameOptions {
  width: number;
  height: number;
  bloom?: BloomSettings;
  offscreenBloomCanvas?: HTMLCanvasElement | null;
  backgroundColor?: string;
  sourceCanvas?: HTMLCanvasElement | null;
}

/**
 * Pure frame rendering function: draws the entire scene at a specific frame index
 * into the target canvas context, including all animation blocks, camera projection,
 * depth of field blur, and bloom post-processing.
 */
export function renderSceneFrame(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  frame: number,
  options: RenderSceneFrameOptions,
) {
  const {
    width,
    height,
    bloom,
    offscreenBloomCanvas,
    backgroundColor = "#000000",
    sourceCanvas,
  } = options;

  // Clear background
  ctx.save();
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);

  if (scene && scene.layers) {
    const animationBlocks = scene.animationBlocks || [];
    const currentCamera = sampleCamera(scene.camera, animationBlocks, frame);
    const cameraCtx: CameraTransform = {
      camera: currentCamera,
      canvasWidth: width,
      canvasHeight: height,
    };

    for (const layer of scene.layers) {
      const { effectiveLayer } = getScreenTransform(
        layer,
        animationBlocks,
        frame,
        currentCamera,
        { width, height },
        scene.layers,
      );

      if (!effectiveLayer.visible || effectiveLayer.opacity <= 0) continue;

      // Depth of field: blur each layer proportionally to distance from camera.focusDistance
      const blurAmount = dofBlurPx(layer, currentCamera);
      if (blurAmount > 0.05) {
        ctx.filter = `blur(${blurAmount.toFixed(2)}px)`;
      } else {
        ctx.filter = "none";
      }

      drawLayer(ctx, effectiveLayer);
      ctx.filter = "none";
    }

    // Bloom post-processing pass over full canvas
    if (bloom?.enabled && sourceCanvas) {
      const bloomCanvas =
        offscreenBloomCanvas || document.createElement("canvas");
      applyBloom(
        sourceCanvas,
        bloomCanvas,
        bloom.threshold ?? 200,
        bloom.blurPx ?? 16,
        bloom.intensity ?? 1.0,
      );
    }
  }

  ctx.restore();
}
