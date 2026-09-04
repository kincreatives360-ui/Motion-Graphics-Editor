import type {
  Layer,
  Scene,
  Camera,
  SceneLighting,
  MockupType,
  SceneEffect,
  BloomEffect,
  VignetteEffect,
  FilmGrainEffect,
  ChromaticAberrationEffect,
  DepthOfFieldEffect,
  MotionBlurEffect,
  ColorGradeEffect,
  GhostEffect,
  GlitchEffect,
  EdgeFadeEffect,
  LayerEffect,
  DropShadowLayerEffect,
  GlowLayerEffect,
  BackdropBlurLayerEffect,
  LayerBlurLayerEffect,
  LiquidGlassLayerEffect,
} from "../store/editor-store";
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
  applyColorGrade,
  applyGlitch,
  applyGhost,
  applyEdgeFade,
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
    effects: layer.effects,
    effectsOrder: layer.effectsOrder,
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
  } else if (type === "safari") {
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

export function hexToRgba(hex: string, alpha: number): string {
  if (!hex) return `rgba(0, 0, 0, ${alpha})`;
  let clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  }
  if (clean.length >= 6) {
    const r = parseInt(clean.slice(0, 2), 16) || 0;
    const g = parseInt(clean.slice(2, 4), 16) || 0;
    const b = parseInt(clean.slice(4, 6), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
  }
  return hex;
}

export function buildLayerGeometryPath(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  width: number,
  height: number,
) {
  ctx.beginPath();
  if (layer.type === "shape" && layer.shape) {
    const { kind } = layer.shape;
    const radius = (layer.shape as any).radius || 0;
    if (kind === "ellipse") {
      ctx.ellipse(0, 0, width / 2, height / 2, 0, 0, Math.PI * 2);
    } else if (radius > 0 && typeof ctx.roundRect === "function") {
      ctx.roundRect(-width / 2, -height / 2, width, height, radius);
    } else {
      ctx.rect(-width / 2, -height / 2, width, height);
    }
  } else {
    ctx.rect(-width / 2, -height / 2, width, height);
  }
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

  // Active layer effects partitioned by type
  const rawEffects = layer.effects || [];
  const activeEffects = rawEffects.filter((e) => e.enabled && e.visible);

  const dropShadowFx = activeEffects.find(
    (e): e is DropShadowLayerEffect => e.type === "dropShadow",
  );
  const glowFx = activeEffects.find(
    (e): e is GlowLayerEffect => e.type === "glow",
  );
  const layerBlurFx = activeEffects.find(
    (e): e is LayerBlurLayerEffect => e.type === "layerBlur",
  );
  const backdropBlurFx = activeEffects.find(
    (e): e is BackdropBlurLayerEffect => e.type === "backdropBlur",
  );
  const liquidGlassFx = activeEffects.find(
    (e): e is LiquidGlassLayerEffect => e.type === "liquidGlass",
  );

  // Layer Blur: stack with any existing DoF blur on ctx.filter so layer effects inherit DoF
  if (layerBlurFx && layerBlurFx.blur > 0) {
    const currentFilter = ctx.filter && ctx.filter !== "none" ? ctx.filter : "";
    const blurStr = `blur(${layerBlurFx.blur}px)`;
    ctx.filter = currentFilter ? `${currentFilter} ${blurStr}` : blurStr;
  }

  // 1. Backdrop Blur Pass (composited behind layer over lower layers)
  if (backdropBlurFx) {
    ctx.save();
    const frostAlpha = Math.min(0.85, 0.25 + (backdropBlurFx.blur / 32) * 0.35);
    ctx.fillStyle = `rgba(240, 245, 255, ${frostAlpha})`;
    buildLayerGeometryPath(ctx, layer, width, height);
    ctx.fill();
    ctx.restore();
  }

  // 2. Drop Shadow: Layer drop shadow or Studio Lighting soft contact drop shadow
  if (dropShadowFx) {
    ctx.shadowColor = hexToRgba(dropShadowFx.color || "#000000", dropShadowFx.opacity ?? 0.5);
    ctx.shadowBlur = Math.max(0, dropShadowFx.blur ?? 12);
    ctx.shadowOffsetX = dropShadowFx.offsetX ?? 4;
    ctx.shadowOffsetY = dropShadowFx.offsetY ?? 4;
  } else if (lighting && lighting.enabled) {
    ctx.shadowColor = `rgba(0, 0, 0, ${lighting.shadowOpacity || 0.35})`;
    ctx.shadowBlur = lighting.shadowBlur || 24;
    ctx.shadowOffsetX = -(lighting.lightX || -300) * 0.04;
    ctx.shadowOffsetY = -(lighting.lightY || -450) * 0.04;
  }

  // Render device mockup background frame if needed
  if (layer.mockup && layer.mockup !== "none") {
    drawDeviceMockup(ctx, layer.mockup, width, height);
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

  // 3. Glow Pass (composited over/around layer)
  if (glowFx) {
    ctx.save();
    if (glowFx.blend === "add") {
      ctx.globalCompositeOperation = "lighter";
    }
    const glowAlpha = Math.min(1, Math.max(0, 0.6 * (glowFx.intensity ?? 1)));
    ctx.shadowColor = hexToRgba(glowFx.color || "#6e6ef5", glowAlpha);
    ctx.shadowBlur = Math.max(1, (glowFx.blur ?? 16) * (glowFx.intensity ?? 1));
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = hexToRgba(glowFx.color || "#6e6ef5", glowAlpha * 0.5);
    ctx.lineWidth = Math.max(1, (glowFx.thickness ?? 0.3) * 6);
    buildLayerGeometryPath(ctx, layer, width, height);
    ctx.stroke();
    ctx.restore();
  }

  // 4. Liquid Glass Pass (surface highlight sheen & refraction border)
  if (liquidGlassFx) {
    ctx.save();
    const highlightAlpha = Math.min(1, Math.max(0, liquidGlassFx.highlight ?? 0.4));
    const glassGrad = ctx.createLinearGradient(-width / 2, -height / 2, width / 2, height / 2);
    glassGrad.addColorStop(0, `rgba(255, 255, 255, ${highlightAlpha * 0.6})`);
    glassGrad.addColorStop(0.4, "rgba(255, 255, 255, 0.05)");
    glassGrad.addColorStop(1, `rgba(200, 230, 255, ${highlightAlpha * 0.3})`);
    ctx.fillStyle = glassGrad;
    buildLayerGeometryPath(ctx, layer, width, height);
    ctx.fill();

    ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(1, (liquidGlassFx.refraction ?? 0.3) * 0.8)})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  // Directional Specular Sheen on tilted surfaces (inherits across all layer effects)
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
  lighting?: SceneLighting;
  offscreenBloomCanvas?: HTMLCanvasElement | null;
  backgroundColor?: string;
  sourceCanvas?: HTMLCanvasElement | null;
}

// Module-level cached canvases for motion blur sub-frame accumulation
let mbAccumCanvas: HTMLCanvasElement | null = null;
let mbSampleCanvas: HTMLCanvasElement | null = null;

function getMotionBlurCanvases(width: number, height: number) {
  if (typeof document === "undefined") return null;
  if (!mbAccumCanvas) mbAccumCanvas = document.createElement("canvas");
  if (!mbSampleCanvas) mbSampleCanvas = document.createElement("canvas");
  if (mbAccumCanvas.width !== width || mbAccumCanvas.height !== height) {
    mbAccumCanvas.width = width;
    mbAccumCanvas.height = height;
  }
  if (mbSampleCanvas.width !== width || mbSampleCanvas.height !== height) {
    mbSampleCanvas.width = width;
    mbSampleCanvas.height = height;
  }
  const accumCtx = mbAccumCanvas.getContext("2d");
  const sampleCtx = mbSampleCanvas.getContext("2d");
  if (!accumCtx || !sampleCtx) return null;
  return { accumCanvas: mbAccumCanvas, accumCtx, sampleCanvas: mbSampleCanvas, sampleCtx };
}

/**
 * Draws all scene layers at a specific sub-frame index, including camera projection,
 * depth sorting, and per-layer Depth of Field (gated by effect-stack toggle).
 */
export function renderLayersAtFrame(
  targetCtx: CanvasRenderingContext2D,
  scene: Scene,
  frame: number,
  width: number,
  height: number,
  lighting?: SceneLighting,
  dofFx?: DepthOfFieldEffect,
  requestRedraw?: () => void,
) {
  if (!scene || !scene.layers) return;
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
    // Gated by effect-stack toggle rather than always-on
    if (dofFx && dofFx.enabled && dofFx.visible) {
      const layerDepth = layer.transform.depth ?? 0;
      const focusDist = currentCamera.focusDistance ?? 1000;
      const dist = Math.abs(layerDepth - focusDist);
      const outOfFocus = Math.max(0, dist - (dofFx.focusRange ?? 200) / 2);
      const apertureFactor = 2.8 / (dofFx.aperture || 2.8);
      const blurAmount = Math.min(25, (outOfFocus / 40) * apertureFactor * (dofFx.bokehScale ?? 1));
      if (blurAmount > 0.05) {
        targetCtx.filter = `blur(${blurAmount.toFixed(2)}px)`;
      } else {
        targetCtx.filter = "none";
      }
    } else {
      targetCtx.filter = "none";
    }

    drawLayer(targetCtx, effectiveLayer, requestRedraw, lighting);
    targetCtx.filter = "none";
  }
}

export interface RenderSceneFrameOptions {
  width: number;
  height: number;
  lighting?: SceneLighting;
  offscreenBloomCanvas?: HTMLCanvasElement | null;
  backgroundColor?: string;
  sourceCanvas?: HTMLCanvasElement | null;
}

/**
 * Pure frame rendering function: draws the entire scene at a specific frame index
 * into the target canvas context, including all animation blocks, camera projection,
 * depth-sorted 3D layers, depth of field blur, motion blur, lighting, and scene effect post-processing.
 *
 * Full ten-effect fixed composite order:
 * Color Grade -> Depth of Field -> Motion Blur -> Bloom -> Vignette -> Chromatic Aberration -> Glitch -> Film Grain -> Ghost -> Edge Fade
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
    lighting = scene.lighting,
    offscreenBloomCanvas,
    backgroundColor = "#000000",
    sourceCanvas,
  } = options;

  // Clear background
  ctx.save();
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);

  if (scene && scene.layers) {
    const activeEffects = scene.effects ? scene.effects.filter((e) => e.enabled && e.visible) : [];

    const dofFx = activeEffects.find((e): e is DepthOfFieldEffect => e.type === "depthOfField");
    const motionBlurFx = activeEffects.find((e): e is MotionBlurEffect => e.type === "motionBlur");

    // Motion Blur must run before the standard layer-draw loop produces the canvas the other nine effects operate on.
    const motionSamples = motionBlurFx && motionBlurFx.samples ? Math.max(1, Math.min(12, Math.round(motionBlurFx.samples))) : 1;
    const shutterAngle = motionBlurFx ? Math.max(0, Math.min(360, motionBlurFx.shutterAngle ?? 180)) : 0;
    const isMotionBlurActive = Boolean(motionBlurFx && motionSamples > 1 && shutterAngle > 0);

    if (isMotionBlurActive) {
      const mb = getMotionBlurCanvases(width, height);
      if (mb) {
        const { accumCanvas, accumCtx, sampleCanvas, sampleCtx } = mb;
        accumCtx.setTransform(1, 0, 0, 1, 0, 0);
        accumCtx.clearRect(0, 0, width, height);

        const shutterFraction = shutterAngle / 360;

        for (let s = 0; s < motionSamples; s++) {
          // Sub-frame sampling centered on current frame
          const subFrame = frame - (shutterFraction * 0.5) + (s / (motionSamples - 1)) * shutterFraction;

          sampleCtx.setTransform(1, 0, 0, 1, 0, 0);
          sampleCtx.clearRect(0, 0, width, height);

          renderLayersAtFrame(sampleCtx, scene, subFrame, width, height, lighting, dofFx);

          accumCtx.save();
          accumCtx.globalCompositeOperation = "source-over";
          accumCtx.globalAlpha = 1 / (s + 1);
          accumCtx.drawImage(sampleCanvas, 0, 0);
          accumCtx.restore();
        }

        ctx.drawImage(accumCanvas, 0, 0);
      } else {
        renderLayersAtFrame(ctx, scene, frame, width, height, lighting, dofFx);
      }
    } else {
      // Standard layer draw (with per-layer Depth of Field if enabled)
      renderLayersAtFrame(ctx, scene, frame, width, height, lighting, dofFx);
    }

    // Unified Scene Effects Post-Processing Pass
    // Fixed composite order:
    // Color Grade -> Depth of Field -> Motion Blur -> Bloom -> Vignette -> Chromatic Aberration -> Glitch -> Film Grain -> Ghost -> Edge Fade
    if (sourceCanvas && activeEffects.length > 0) {
      // 1. Color Grade
      const colorGradeFx = activeEffects.find((e): e is ColorGradeEffect => e.type === "colorGrade");
      if (colorGradeFx) {
        applyColorGrade(sourceCanvas, colorGradeFx.exposure, colorGradeFx.contrast, colorGradeFx.saturation);
      }

      // 2. Depth of Field (applied per-layer during layer loop above)
      // 3. Motion Blur (applied before standard layer-draw loop above)

      // 4. Bloom
      const bloomFx = activeEffects.find((e): e is BloomEffect => e.type === "bloom");
      if (bloomFx && bloomFx.intensity > 0) {
        const bloomCanvas =
          offscreenBloomCanvas ||
          (typeof document !== "undefined" ? document.createElement("canvas") : (null as unknown as HTMLCanvasElement));
        if (bloomCanvas) {
          applyBloom(
            sourceCanvas,
            bloomCanvas,
            bloomFx.threshold * 255,
            16,
            bloomFx.intensity,
          );
        }
      }

      // 5. Vignette
      const vignetteFx = activeEffects.find((e): e is VignetteEffect => e.type === "vignette");
      if (vignetteFx && vignetteFx.intensity > 0) {
        applyVignette(sourceCanvas, vignetteFx.intensity);
      }

      // 6. Chromatic Aberration
      const chromaFx = activeEffects.find((e): e is ChromaticAberrationEffect => e.type === "chromaticAberration");
      if (chromaFx && chromaFx.offset > 0) {
        applyChromaticAberration(sourceCanvas, chromaFx.offset);
      }

      // 7. Glitch
      const glitchFx = activeEffects.find((e): e is GlitchEffect => e.type === "glitch");
      if (glitchFx && glitchFx.intensity > 0) {
        applyGlitch(sourceCanvas, glitchFx.intensity, glitchFx.speed);
      }

      // 8. Film Grain
      const grainFx = activeEffects.find((e): e is FilmGrainEffect => e.type === "filmGrain");
      if (grainFx && grainFx.intensity > 0) {
        applyFilmGrain(sourceCanvas, grainFx.intensity, grainFx.size);
      }

      // 9. Ghost
      const ghostFx = activeEffects.find((e): e is GhostEffect => e.type === "ghost");
      if (ghostFx && ghostFx.opacity > 0) {
        applyGhost(sourceCanvas, ghostFx.opacity, ghostFx.offset, ghostFx.blur);
      }

      // 10. Edge Fade
      const edgeFadeFx = activeEffects.find((e): e is EdgeFadeEffect => e.type === "edgeFade");
      if (
        edgeFadeFx &&
        (edgeFadeFx.top > 0 || edgeFadeFx.right > 0 || edgeFadeFx.bottom > 0 || edgeFadeFx.left > 0)
      ) {
        applyEdgeFade(
          sourceCanvas,
          edgeFadeFx.top,
          edgeFadeFx.right,
          edgeFadeFx.bottom,
          edgeFadeFx.left,
        );
      }
    }
  }

  ctx.restore();
}
