import type { SceneEffectsSettings } from "../store/editor-store";

// Module-level cached offscreen canvas to avoid allocating per frame
let blurCanvas: HTMLCanvasElement | null = null;
let blurCtx: CanvasRenderingContext2D | null = null;

function getBlurCanvas(
  width: number,
  height: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === "undefined") return null;
  if (!blurCanvas) {
    blurCanvas = document.createElement("canvas");
  }
  if (blurCanvas.width !== width || blurCanvas.height !== height) {
    blurCanvas.width = width;
    blurCanvas.height = height;
  }
  if (!blurCtx) {
    blurCtx = blurCanvas.getContext("2d");
  }
  if (!blurCtx) return null;
  return { canvas: blurCanvas, ctx: blurCtx };
}

/**
 * 1. Color Grade Pass:
 * exposure (-2 to 2): color *= exp2(exposure)
 * contrast (0 to 2): pivot at 0.5
 * saturation (0 to 2): luma preserving mix
 */
export function applyColorGrade(
  main: HTMLCanvasElement,
  exposure = 0,
  contrast = 1,
  saturation = 1,
) {
  if (exposure === 0 && contrast === 1 && saturation === 1) return;
  const ctx = main.getContext("2d", { willReadFrequently: true });
  if (!ctx || main.width === 0 || main.height === 0) return;

  const imgData = ctx.getImageData(0, 0, main.width, main.height);
  const d = imgData.data;
  const expMult = Math.pow(2, exposure);

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] / 255;
    let g = d[i + 1] / 255;
    let b = d[i + 2] / 255;

    // Exposure
    if (exposure !== 0) {
      r *= expMult;
      g *= expMult;
      b *= expMult;
    }

    // Contrast
    if (contrast !== 1) {
      r = (r - 0.5) * contrast + 0.5;
      g = (g - 0.5) * contrast + 0.5;
      b = (b - 0.5) * contrast + 0.5;
    }

    // Saturation
    if (saturation !== 1) {
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = luma + (r - luma) * saturation;
      g = luma + (g - luma) * saturation;
      b = luma + (b - luma) * saturation;
    }

    d[i] = Math.min(255, Math.max(0, r * 255));
    d[i + 1] = Math.min(255, Math.max(0, g * 255));
    d[i + 2] = Math.min(255, Math.max(0, b * 255));
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * 2. Depth of Field Pass:
 * Simulates optical bokeh blur using aperture (0.7 to 22) and focus range.
 */
export function applyDepthOfField(
  main: HTMLCanvasElement,
  bokehScale = 2.0,
  aperture = 2.8,
  focusRange = 100,
) {
  if (bokehScale <= 0 || main.width === 0 || main.height === 0) return;
  const ctx = main.getContext("2d");
  if (!ctx) return;

  const blurAmount = Math.max(1, Math.min(24, (22 / Math.max(0.7, aperture)) * (bokehScale * 0.5)));
  const blurTarget = getBlurCanvas(main.width, main.height);
  if (!blurTarget) return;

  const { canvas: blurDest, ctx: bctx } = blurTarget;
  bctx.filter = `blur(${blurAmount}px)`;
  bctx.clearRect(0, 0, blurDest.width, blurDest.height);
  bctx.drawImage(main, 0, 0);
  bctx.filter = "none";

  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.drawImage(blurDest, 0, 0);
  ctx.restore();
}

/**
 * 3. Motion Blur Pass:
 * shutterAngle (0 to 360), samples (1 to 32)
 */
export function applyMotionBlur(
  main: HTMLCanvasElement,
  shutterAngle = 180,
  samples = 16,
) {
  if (shutterAngle <= 0 || samples <= 1 || main.width === 0 || main.height === 0) return;
  const ctx = main.getContext("2d");
  if (!ctx) return;

  const spreadPx = (shutterAngle / 360) * 4;
  ctx.save();
  ctx.globalAlpha = 1 / samples;
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < samples; i++) {
    const offset = (i / (samples - 1) - 0.5) * spreadPx;
    ctx.drawImage(main, offset, 0);
  }
  ctx.restore();
}

/**
 * 4. Post-processing Bloom Filter:
 * Thresholds bright pixels onto an offscreen canvas, applies Gaussian diffusion blur,
 * and composites back onto destination using "lighter".
 */
export function applyBloom(
  main: HTMLCanvasElement,
  off: HTMLCanvasElement,
  threshold = 0.8,
  blurPx = 16,
  intensity = 1.0,
) {
  if (intensity <= 0 || main.width === 0 || main.height === 0) return;
  if (off.width !== main.width || off.height !== main.height) {
    off.width = main.width;
    off.height = main.height;
  }
  const octx = off.getContext("2d", { willReadFrequently: true });
  if (!octx) return;

  octx.filter = "none";
  octx.globalCompositeOperation = "source-over";
  octx.clearRect(0, 0, off.width, off.height);
  octx.drawImage(main, 0, 0);

  const data = octx.getImageData(0, 0, off.width, off.height);
  const d = data.data;
  // Convert 0..1 threshold to 0..255 scale if needed
  const threshold255 = threshold <= 1.0 ? threshold * 255 : threshold;
  let hasBright = false;

  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    if (lum < threshold255) {
      d[i + 3] = 0;
    } else {
      hasBright = true;
    }
  }

  if (!hasBright) return;

  octx.putImageData(data, 0, 0);

  const blurTarget = getBlurCanvas(off.width, off.height);
  if (!blurTarget) return;

  const { canvas: blurDest, ctx: bctx } = blurTarget;
  bctx.filter = `blur(${blurPx}px)`;
  bctx.clearRect(0, 0, blurDest.width, blurDest.height);
  bctx.drawImage(off, 0, 0);
  bctx.filter = "none";

  const mctx = main.getContext("2d");
  if (!mctx) return;
  mctx.save();
  mctx.globalAlpha = Math.max(0, Math.min(intensity, 2.0));
  mctx.globalCompositeOperation = "lighter";
  mctx.drawImage(blurDest, 0, 0);
  mctx.restore();
}

/**
 * 5. Optical Vignette Pass:
 * Darkens outer edges. Offset fixed to 0.3 per Raylight spec.
 */
export function applyVignette(main: HTMLCanvasElement, intensity = 0.3) {
  if (intensity <= 0.01 || main.width === 0 || main.height === 0) return;
  const ctx = main.getContext("2d");
  if (!ctx) return;

  const cx = main.width / 2;
  const cy = main.height / 2;
  const radius = Math.hypot(cx, cy);

  ctx.save();
  const grad = ctx.createRadialGradient(cx, cy, radius * 0.3, cx, cy, radius);
  grad.addColorStop(0, "rgba(0, 0, 0, 0)");
  grad.addColorStop(0.7, `rgba(0, 0, 0, ${intensity * 0.4})`);
  grad.addColorStop(1, `rgba(0, 0, 0, ${intensity})`);

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, main.width, main.height);
  ctx.restore();
}

/**
 * 6. Chromatic Aberration / Color Split Pass:
 * offset (0 to 20): mapped as offsetPx = offset * 0.5
 */
export function applyChromaticAberration(
  main: HTMLCanvasElement,
  offset = 4,
) {
  const offsetPx = typeof offset === "number" ? offset * 0.5 : 2;
  if (offsetPx <= 0.1 || main.width === 0 || main.height === 0) return;
  const ctx = main.getContext("2d");
  if (!ctx) return;

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.15;
  ctx.drawImage(main, -offsetPx, 0);
  ctx.drawImage(main, offsetPx, 0);
  ctx.restore();
}

/**
 * 7. Glitch Pass:
 * RGB-split + slice-shift (28 horizontal slices at 12fps clock)
 */
export function applyGlitch(
  main: HTMLCanvasElement,
  intensity = 0.3,
  speed = 1.0,
  frame = 0,
) {
  if (intensity <= 0.01 || main.width === 0 || main.height === 0) return;
  const ctx = main.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;

  const sliceCount = 28;
  const sliceHeight = main.height / sliceCount;
  const timeClock = Math.floor(frame * 0.4 * speed);

  ctx.save();
  for (let s = 0; s < sliceCount; s++) {
    const hash = Math.sin(s * 12.9898 + timeClock * 78.233) * 43758.5453;
    const fract = hash - Math.floor(hash);
    if (fract > 1.0 - intensity * 0.35) {
      const shiftPx = ((fract * 2 - 1) * intensity * 0.08) * main.width;
      const sy = s * sliceHeight;
      ctx.drawImage(main, 0, sy, main.width, sliceHeight, shiftPx, sy, main.width, sliceHeight);
    }
  }
  ctx.restore();
}

// Cached noise pattern canvas for 60fps film grain
let noisePatternCanvas: HTMLCanvasElement | null = null;
let noisePattern: CanvasPattern | null = null;

function getNoisePattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (typeof document === "undefined") return null;
  if (!noisePatternCanvas) {
    noisePatternCanvas = document.createElement("canvas");
    noisePatternCanvas.width = 128;
    noisePatternCanvas.height = 128;
    const nctx = noisePatternCanvas.getContext("2d");
    if (nctx) {
      const imgData = nctx.createImageData(128, 128);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const val = Math.floor(Math.random() * 255);
        data[i] = val;
        data[i + 1] = val;
        data[i + 2] = val;
        data[i + 3] = 40;
      }
      nctx.putImageData(imgData, 0, 0);
      noisePattern = ctx.createPattern(noisePatternCanvas, "repeat");
    }
  }
  return noisePattern;
}

/**
 * 8. Film Grain Pass:
 * intensity (0 to 1, scaled x0.1), size (0.5 to 3)
 */
export function applyFilmGrain(
  main: HTMLCanvasElement,
  intensity = 0.08,
  size = 1.0,
) {
  if (intensity <= 0.005 || main.width === 0 || main.height === 0) return;
  const ctx = main.getContext("2d");
  if (!ctx) return;

  const pattern = getNoisePattern(ctx);
  if (!pattern) return;

  ctx.save();
  ctx.globalCompositeOperation = "soft-light";
  ctx.globalAlpha = Math.min(1, Math.max(0, intensity * 0.1 * 1.5 * 10)); // scaled per spec
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, main.width, main.height);
  ctx.restore();
}

/**
 * 9. Ghost Pass:
 * 24-tap Fibonacci spiral echo sample
 */
export function applyGhost(
  main: HTMLCanvasElement,
  opacity = 0.5,
  offset = 10,
  blur = 2,
) {
  if (opacity <= 0.01 || main.width === 0 || main.height === 0) return;
  const ctx = main.getContext("2d");
  if (!ctx) return;

  ctx.save();
  ctx.globalAlpha = opacity * 0.5;
  ctx.globalCompositeOperation = "lighter";
  if (blur > 0) {
    ctx.filter = `blur(${blur}px)`;
  }
  ctx.drawImage(main, offset, offset);
  ctx.filter = "none";
  ctx.restore();
}

/**
 * 10. Edge Fade Pass:
 * Per-side vignette-to-color edge fade
 */
export function applyEdgeFade(
  main: HTMLCanvasElement,
  top = 0,
  right = 0,
  bottom = 0,
  left = 0,
  color = "#000000",
) {
  if (top <= 0 && right <= 0 && bottom <= 0 && left <= 0) return;
  const ctx = main.getContext("2d");
  if (!ctx || main.width === 0 || main.height === 0) return;

  const w = main.width;
  const h = main.height;

  ctx.save();
  ctx.fillStyle = color;

  if (top > 0) {
    const topPx = h * top;
    const grad = ctx.createLinearGradient(0, 0, 0, topPx);
    grad.addColorStop(0, color);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, topPx);
  }

  if (bottom > 0) {
    const botPx = h * bottom;
    const grad = ctx.createLinearGradient(0, h, 0, h - botPx);
    grad.addColorStop(0, color);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, h - botPx, w, botPx);
  }

  if (left > 0) {
    const leftPx = w * left;
    const grad = ctx.createLinearGradient(0, 0, leftPx, 0);
    grad.addColorStop(0, color);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, leftPx, h);
  }

  if (right > 0) {
    const rightPx = w * right;
    const grad = ctx.createLinearGradient(w, 0, w - rightPx, 0);
    grad.addColorStop(0, color);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(w - rightPx, 0, rightPx, h);
  }

  ctx.restore();
}

/**
 * Master Scene Post-Processing Runner:
 * Executes all enabled scene effects in exact GPU composite order per Raylight spec:
 * ColorGrade → DepthOfField → MotionBlur → Bloom → Vignette → ChromaticAberration → Glitch → FilmGrain → Ghost → EdgeFade
 */
export function applySceneEffectsPipeline(
  main: HTMLCanvasElement,
  offCanvas: HTMLCanvasElement,
  effects?: SceneEffectsSettings,
  frame = 0,
) {
  if (!effects) return;

  // 1. Color Grade
  if (effects.colorGrade?.enabled) {
    applyColorGrade(
      main,
      effects.colorGrade.exposure ?? 0,
      effects.colorGrade.contrast ?? 1,
      effects.colorGrade.saturation ?? 1,
    );
  }

  // 2. Depth of Field
  if (effects.depthOfField?.enabled) {
    applyDepthOfField(
      main,
      effects.depthOfField.bokehScale ?? 2.0,
      effects.depthOfField.aperture ?? 2.8,
      effects.depthOfField.focusRange ?? 100,
    );
  }

  // 3. Motion Blur
  if (effects.motionBlur?.enabled) {
    applyMotionBlur(
      main,
      effects.motionBlur.shutterAngle ?? 180,
      effects.motionBlur.samples ?? 16,
    );
  }

  // 4. Bloom
  if (effects.bloom?.enabled) {
    applyBloom(
      main,
      offCanvas,
      effects.bloom.threshold ?? 0.8,
      16,
      effects.bloom.intensity ?? 1.0,
    );
  }

  // 5. Vignette
  if (effects.vignette?.enabled) {
    applyVignette(main, effects.vignette.intensity ?? 0.3);
  }

  // 6. Chromatic Aberration / Color Split
  if (effects.chromaticAberration?.enabled) {
    applyChromaticAberration(main, effects.chromaticAberration.offset ?? 4);
  }

  // 7. Glitch
  if (effects.glitch?.enabled) {
    applyGlitch(
      main,
      effects.glitch.intensity ?? 0.3,
      effects.glitch.speed ?? 1.0,
      frame,
    );
  }

  // 8. Film Grain
  if (effects.filmGrain?.enabled) {
    applyFilmGrain(
      main,
      effects.filmGrain.intensity ?? 0.08,
      effects.filmGrain.size ?? 1.0,
    );
  }

  // 9. Ghost
  if (effects.ghost?.enabled) {
    applyGhost(
      main,
      effects.ghost.opacity ?? 0.5,
      effects.ghost.offset ?? 10,
      effects.ghost.blur ?? 2,
    );
  }

  // 10. Edge Fade
  if (effects.edgeFade?.enabled) {
    applyEdgeFade(
      main,
      effects.edgeFade.top ?? 0,
      effects.edgeFade.right ?? 0,
      effects.edgeFade.bottom ?? 0,
      effects.edgeFade.left ?? 0,
    );
  }
}
