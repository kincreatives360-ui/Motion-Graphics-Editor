import type { Layer, Scene, BloomSettings, Camera, SceneLighting, OpticsSettings, MockupType } from "../store/editor-store";
import {
  computeRenderedLayer,
  projectLayer,
  sampleCamera,
  dofBlurPx,
  type CameraTransform,
  type AnimationBlock,
} from "../store/animation-blocks";
import {
  applyBloom,
  applyFilmGrain,
  applyVignette,
  applyChromaticAberration,
  applySceneEffectsPipeline,
} from "./post-processing";

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
      rotateX: rendered.transform.rotateX,
      rotateY: rendered.transform.rotateY,
    },
    opacity: screenOpacity,
    visible: rendered.visible,
    mockup: layer.mockup,
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
 * Renders realistic device frames (iPhone 16 Pro, MacBook Pro, Safari Browser).
 */
export function drawDeviceMockup(
  ctx: CanvasRenderingContext2D,
  type: MockupType,
  width: number,
  height: number,
) {
  if (!type || type === "none") return;

  ctx.save();

  if (type === "iphone") {
    // iPhone 16 Pro Titanium Bezel Frame
    const bezel = 12;
    const outerW = width + bezel * 2;
    const outerH = height + bezel * 2;
    const radius = Math.min(36, width * 0.12);

    ctx.strokeStyle = "#27272a";
    ctx.lineWidth = bezel;
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(-outerW / 2, -outerH / 2, outerW, outerH, radius);
      ctx.stroke();
    }

    // Dynamic Island Pill
    const pillW = Math.min(88, width * 0.3);
    const pillH = 20;
    ctx.fillStyle = "#000000";
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(-pillW / 2, -height / 2 + 6, pillW, pillH, 10);
      ctx.fill();
    }
  } else if (type === "macbook") {
    // MacBook Display Bezel & Notch
    const bezel = 14;
    ctx.strokeStyle = "#18181b";
    ctx.lineWidth = bezel;
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(-width / 2 - bezel / 2, -height / 2 - bezel / 2, width + bezel, height + bezel, 10);
      ctx.stroke();
    }
    // Camera Notch
    ctx.fillStyle = "#09090b";
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(-24, -height / 2, 48, 12, [0, 0, 4, 4]);
      ctx.fill();
    }
    // Aluminum Base Chin
    const baseW = width * 1.15;
    const baseH = 12;
    ctx.fillStyle = "#27272a";
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(-baseW / 2, height / 2 + bezel / 2, baseW, baseH, [0, 0, 6, 6]);
      ctx.fill();
    }
  } else if ((type as string) === "ipad") {
    // iPad Ultra Thin Uniform Bezel Frame
    const bezel = 10;
    const outerW = width + bezel * 2;
    const outerH = height + bezel * 2;
    const radius = Math.min(24, width * 0.08);

    ctx.strokeStyle = "#18181b";
    ctx.lineWidth = bezel;
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(-outerW / 2, -outerH / 2, outerW, outerH, radius);
      ctx.stroke();
    }
    // Front Camera Lens Dot
    ctx.fillStyle = "#09090b";
    ctx.beginPath();
    ctx.arc(0, -height / 2 - bezel / 2, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if ((type as string) === "safari" || (type as string) === "browser") {
    // Modern Browser Header
    const barH = 34;
    ctx.fillStyle = "#1e2025";
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(-width / 2, -height / 2 - barH, width, barH, [8, 8, 0, 0]);
      ctx.fill();
    }
    // Window control buttons (Red, Yellow, Green)
    const btnY = -height / 2 - barH / 2;
    const startX = -width / 2 + 16;
    const colors = ["#ff5f56", "#ffbd2e", "#27c93f"];
    colors.forEach((col, idx) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(startX + idx * 16, btnY, 5, 0, Math.PI * 2);
      ctx.fill();
    });
    // Address Bar Pill
    const searchW = Math.min(220, width * 0.45);
    ctx.fillStyle = "#121417";
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(-searchW / 2, btnY - 9, searchW, 18, 5);
      ctx.fill();
    }
  }

  ctx.restore();
}

/**
 * Render a single Layer entity to a 2D canvas context.
 */
export function drawLayer(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  requestRedraw?: () => void,
  lighting?: SceneLighting,
) {
  if (!layer.visible || layer.opacity <= 0) return;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity));

  const { x, y, width, height, rotation } = layer.transform;
  const rotateX = layer.transform.rotateX ?? 0;
  const rotateY = layer.transform.rotateY ?? 0;
  const centerX = x + width / 2;
  const centerY = y + height / 2;

  // Move origin to center of layer for rotation
  ctx.translate(centerX, centerY);

  // Directional Mask Sweep Reveal Wipe
  if ((layer as any).maskSweep) {
    const sweep = (layer as any).maskSweep;
    const progress = sweep.progress ?? 1.0;
    const dir = sweep.direction || "left";
    ctx.beginPath();
    if (dir === "left") {
      ctx.rect(-width / 2, -height / 2, width * progress, height);
    } else if (dir === "right") {
      ctx.rect(width / 2 - width * progress, -height / 2, width * progress, height);
    } else if (dir === "up") {
      ctx.rect(-width / 2, -height / 2, width, height * progress);
    } else {
      ctx.rect(-width / 2, height / 2 - height * progress, width, height * progress);
    }
    ctx.clip();
  }
  if (rotation) {
    ctx.rotate((rotation * Math.PI) / 180);
  }

  // 3D Perspective Tilt & Swivel Matrix
  if (rotateX !== 0 || rotateY !== 0) {
    const radX = (rotateX * Math.PI) / 180;
    const radY = (rotateY * Math.PI) / 180;
    const cosX = Math.cos(radX);
    const cosY = Math.cos(radY);
    const skewX = -Math.sin(radY) * 0.16;
    const skewY = Math.sin(radX) * 0.16;
    ctx.transform(cosY, skewY, skewX, cosX, 0, 0);
  }

  // Studio Lighting: Soft contact drop shadow
  if (lighting && lighting.enabled) {
    ctx.shadowColor = `rgba(0, 0, 0, ${lighting.shadowOpacity || 0.35})`;
    ctx.shadowBlur = lighting.shadowBlur || 24;
    ctx.shadowOffsetX = -(lighting.lightX || -300) * 0.04;
    ctx.shadowOffsetY = -(lighting.lightY || -450) * 0.04;
  }

  // 3D Extrusion Depth side walls
  if ((layer.depth ?? 0) > 0) {
    const depthPx = Math.min(60, (layer.depth ?? 0) * 0.5);
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    for (let d = depthPx; d > 0; d--) {
      ctx.fillRect(-width / 2 + d * 0.3, -height / 2 + d * 0.3, width, height);
    }
    ctx.restore();
  }

  if (layer.type === "shape" && layer.shape) {
    const { kind, fill, stroke } = layer.shape;
    const radius = (layer.shape as any).radius || 0;
    const pathData = layer.shape.path;
    const strokeAlign = (layer as any).strokeAlign || (layer.shape as any).align || "inside";
    const strokeWidth = (layer.shape as any).strokeWidth || layer.shape.strokeWidth || 2;
    const isDashed = (layer as any).strokeStyle === "dashed" || (layer.shape as any).style === "dashed";
    const dashVal = (layer as any).dash || (layer.shape as any).dash || 8;
    const flowVal = (layer as any).flow || (layer.shape as any).flow || 0;

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
          ctx.lineWidth = strokeAlign === "center" ? strokeWidth : strokeWidth * 2;
          if (isDashed) {
            ctx.setLineDash([dashVal, dashVal]);
            ctx.lineDashOffset = -flowVal;
          }
          ctx.stroke(path2d);
          ctx.setLineDash([]);
        }
        ctx.restore();
      } catch {
        // Path2D fallback
      }
    } else {
      ctx.save();
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
        ctx.lineWidth = strokeAlign === "center" ? strokeWidth : strokeWidth * 2;
        if (isDashed) {
          ctx.setLineDash([dashVal, dashVal]);
          ctx.lineDashOffset = -flowVal;
        }
        if (strokeAlign === "inside") {
          ctx.save();
          ctx.clip();
          ctx.stroke();
          ctx.restore();
        } else {
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
      ctx.restore();
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

  // 3D Material Surface Finish Overlay (Metal, Glossy, Clay, Matte)
  if (layer.material && layer.material !== "matte") {
    ctx.save();
    const strength = layer.materialStrength ?? 1.0;
    if (layer.material === "metal") {
      ctx.globalCompositeOperation = "color-dodge";
      ctx.globalAlpha = 0.35 * strength;
      const metalGrad = ctx.createLinearGradient(-width / 2, -height / 2, width / 2, height / 2);
      metalGrad.addColorStop(0, "rgba(255,255,255,0.8)");
      metalGrad.addColorStop(0.5, "rgba(100,100,100,0.2)");
      metalGrad.addColorStop(1, "rgba(255,255,255,0.6)");
      ctx.fillStyle = metalGrad;
      ctx.fillRect(-width / 2, -height / 2, width, height);
    } else if (layer.material === "glossy") {
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.25 * strength;
      const glossGrad = ctx.createLinearGradient(0, -height / 2, 0, 0);
      glossGrad.addColorStop(0, "rgba(255,255,255,0.7)");
      glossGrad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = glossGrad;
      ctx.fillRect(-width / 2, -height / 2, width, height / 2);
    }
    ctx.restore();
  }

  // Directional Specular Sheen on tilted surfaces
  if (lighting && lighting.enabled && (lighting.intensity || 0) > 0.1 && (rotateX !== 0 || rotateY !== 0)) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = (lighting.intensity || 0.6) * 0.22;
    const sheen = ctx.createLinearGradient(-width / 2, -height / 2, width / 2, height / 2);
    sheen.addColorStop(0, "rgba(255, 255, 255, 0.4)");
    sheen.addColorStop(0.5, "rgba(255, 255, 255, 0)");
    sheen.addColorStop(1, "rgba(255, 255, 255, 0.1)");
    ctx.fillStyle = sheen;
    ctx.fillRect(-width / 2, -height / 2, width, height);
    ctx.restore();
  }

  ctx.restore();
}

export interface RenderSceneFrameOptions {
  width: number;
  height: number;
  bloom?: BloomSettings;
  lighting?: SceneLighting;
  optics?: OpticsSettings;
  offscreenBloomCanvas?: HTMLCanvasElement | null;
  backgroundColor?: string;
  sourceCanvas?: HTMLCanvasElement | null;
}

/**
 * Pure frame rendering function: draws the entire scene at a specific frame index
 * into the target canvas context, including all animation blocks, camera projection,
 * depth-sorted 3D layers, depth of field blur, lighting, and optics post-processing.
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
    lighting = scene.lighting,
    optics,
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

    // 3D Depth sorting: back-to-front painter's algorithm
    const sortedLayers = [...scene.layers].sort(
      (a, b) => (b.transform.depth ?? 0) - (a.transform.depth ?? 0),
    );

    for (const layer of sortedLayers) {
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

      drawLayer(ctx, effectiveLayer, undefined, lighting);
      ctx.filter = "none";
    }

    // Scene Post-Processing Pipeline
    if (scene.sceneEffects && sourceCanvas) {
      const bloomCanvas = offscreenBloomCanvas || document.createElement("canvas");
      applySceneEffectsPipeline(sourceCanvas, bloomCanvas, scene.sceneEffects, frame);
    } else {
      // Legacy Fallback: Bloom post-processing pass over full canvas
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

      // Film-grade optics post-processing passes
      if (optics && sourceCanvas) {
        if ((optics.chromaticAberration ?? 0) > 0) {
          applyChromaticAberration(sourceCanvas, optics.chromaticAberration * 4);
        }
        if ((optics.vignette ?? 0) > 0) {
          applyVignette(sourceCanvas, optics.vignette);
        }
        if ((optics.filmGrain ?? 0) > 0) {
          applyFilmGrain(sourceCanvas, optics.filmGrain);
        }
      }
    }
  }

  ctx.restore();
}
