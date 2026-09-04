let blurCanvas: HTMLCanvasElement | null = null;
let blurCtx: CanvasRenderingContext2D | null = null;

export function resetCachedPostProcessingCanvases() {
  blurCanvas = null;
  blurCtx = null;
}

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
 * Post-processing bloom filter:
 * Thresholds bright pixels onto an offscreen canvas, applies Gaussian diffusion blur
 * to a second separate offscreen canvas (avoiding canvas self-draw overlap bug),
 * and composites back onto the destination canvas using globalCompositeOperation = "lighter".
 */
export function applyBloom(
  main: HTMLCanvasElement,
  off: HTMLCanvasElement,
  threshold = 200,
  blurPx = 16,
  intensity = 1.0,
) {
  if (main.width === 0 || main.height === 0) return;
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
  const len = d.length;
  let hasBright = false;

  for (let i = 0; i < len; i += 4) {
    const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    if (lum < threshold) {
      d[i + 3] = 0; // drop dim pixels, keep bright ones
    } else {
      hasBright = true;
    }
  }

  // Skip diffusion blur if no pixels meet the luminance threshold
  if (!hasBright) return;

  octx.putImageData(data, 0, 0);

  // Use a second separate offscreen canvas for the blur pass so source and destination
  // canvases never overlap (Canvas2D spec does not guarantee consistent behavior for self-draw)
  const blurTarget = getBlurCanvas(off.width, off.height);
  if (!blurTarget) return;

  const { canvas: blurDest, ctx: bctx } = blurTarget;
  bctx.filter = "none";
  bctx.globalCompositeOperation = "source-over";
  bctx.clearRect(0, 0, blurDest.width, blurDest.height);
  bctx.filter = `blur(${blurPx}px)`;
  bctx.drawImage(off, 0, 0);
  bctx.filter = "none";

  const mctx = main.getContext("2d");
  if (!mctx) return;
  mctx.save();
  mctx.setTransform(1, 0, 0, 1, 0, 0);
  mctx.globalAlpha = Math.max(0, Math.min(intensity, 2.0));
  mctx.globalCompositeOperation = "lighter";
  mctx.drawImage(blurDest, 0, 0);
  mctx.restore();
}

// Cached noise pattern canvas for 60fps film grain without per-frame memory allocation
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
        data[i + 3] = 40; // subtle alpha
      }
      nctx.putImageData(imgData, 0, 0);
      noisePattern = ctx.createPattern(noisePatternCanvas, "repeat");
    }
  }
  return noisePattern;
}

/**
 * Optical Film Grain pass:
 * Simulates analog silver-halide film grain to eliminate digital color banding
 * on gradients and give product motion videos a photographic texture.
 * Supports intensity (0-1) and size (0.5-3.0) parameters.
 */
export function applyFilmGrain(main: HTMLCanvasElement, intensity = 0.08, size = 1.0) {
  if (intensity <= 0.005 || main.width === 0 || main.height === 0) return;
  const ctx = main.getContext("2d");
  if (!ctx) return;

  const pattern = getNoisePattern(ctx);
  if (!pattern) return;

  const clampedSize = Math.max(0.5, Math.min(size || 1.0, 3.0));

  ctx.save();
  ctx.globalCompositeOperation = "soft-light";
  ctx.globalAlpha = Math.min(1, Math.max(0, intensity * 1.5));

  // If setTransform on CanvasPattern is available (supported in modern DOMMatrix), scale the pattern directly.
  if (typeof (pattern as any).setTransform === "function" && typeof DOMMatrix !== "undefined") {
    (pattern as any).setTransform(new DOMMatrix().scale(clampedSize, clampedSize));
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, main.width, main.height);
  } else if (Math.abs(clampedSize - 1.0) > 0.01) {
    // Fallback scaling for environments without pattern.setTransform
    ctx.scale(clampedSize, clampedSize);
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, main.width / clampedSize, main.height / clampedSize);
  } else {
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, main.width, main.height);
  }
  ctx.restore();
}

/**
 * Optical Vignette pass:
 * Gently darkens the outer edges and corners of the frame to direct the viewer's
 * focal attention toward the central content.
 */
export function applyVignette(main: HTMLCanvasElement, strength = 0.2) {
  if (strength <= 0.01 || main.width === 0 || main.height === 0) return;
  const ctx = main.getContext("2d");
  if (!ctx) return;

  const cx = main.width / 2;
  const cy = main.height / 2;
  const radius = Math.hypot(cx, cy);

  ctx.save();
  const grad = ctx.createRadialGradient(cx, cy, radius * 0.45, cx, cy, radius);
  grad.addColorStop(0, "rgba(0, 0, 0, 0)");
  grad.addColorStop(0.7, `rgba(0, 0, 0, ${strength * 0.4})`);
  grad.addColorStop(1, `rgba(0, 0, 0, ${strength})`);

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, main.width, main.height);
  ctx.restore();
}

/**
 * Optical Chromatic Aberration:
 * Subtly splits the red and cyan/blue color channels toward frame edges.
 */
export function applyChromaticAberration(
  main: HTMLCanvasElement,
  offsetPx = 2,
) {
  if (offsetPx <= 0.2 || main.width === 0 || main.height === 0) return;
  const ctx = main.getContext("2d");
  if (!ctx) return;

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.15;
  // Offset red channel slightly left, cyan slightly right
  ctx.drawImage(main, -offsetPx, 0);
  ctx.drawImage(main, offsetPx, 0);
  ctx.restore();
}

/**
 * Color Grade post-processing pass:
 * Adjusts EV exposure (-2 to +2), contrast (0 to 2), and saturation (0 to 2).
 */
export function applyColorGrade(
  main: HTMLCanvasElement,
  exposure = 0,
  contrast = 1,
  saturation = 1,
) {
  if (
    main.width === 0 ||
    main.height === 0 ||
    (Math.abs(exposure) < 0.001 &&
      Math.abs(contrast - 1) < 0.001 &&
      Math.abs(saturation - 1) < 0.001)
  ) {
    return;
  }

  const target = getBlurCanvas(main.width, main.height);
  if (!target) return;
  const { canvas: tempCanvas, ctx: tempCtx } = target;

  tempCtx.filter = "none";
  tempCtx.globalCompositeOperation = "source-over";
  tempCtx.globalAlpha = 1.0;
  tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
  tempCtx.drawImage(main, 0, 0);

  const mctx = main.getContext("2d");
  if (!mctx) return;

  const brightnessFactor = Math.pow(2, exposure);
  mctx.save();
  mctx.setTransform(1, 0, 0, 1, 0, 0);
  mctx.filter = `brightness(${brightnessFactor.toFixed(3)}) contrast(${contrast.toFixed(3)}) saturate(${saturation.toFixed(3)})`;
  mctx.clearRect(0, 0, main.width, main.height);
  mctx.drawImage(tempCanvas, 0, 0);
  mctx.filter = "none";
  mctx.restore();
}

/**
 * Glitch post-processing pass:
 * Simulates digital glitch with horizontal slice displacements and chromatic channel offsets.
 */
export function applyGlitch(
  main: HTMLCanvasElement,
  intensity = 0.3,
  speed = 1,
) {
  if (intensity <= 0.01 || main.width === 0 || main.height === 0) return;

  const target = getBlurCanvas(main.width, main.height);
  if (!target) return;
  const { canvas: tempCanvas, ctx: tempCtx } = target;

  tempCtx.filter = "none";
  tempCtx.globalCompositeOperation = "source-over";
  tempCtx.globalAlpha = 1.0;
  tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
  tempCtx.drawImage(main, 0, 0);

  const mctx = main.getContext("2d");
  if (!mctx) return;

  mctx.save();
  mctx.setTransform(1, 0, 0, 1, 0, 0);

  const numSlices = Math.max(2, Math.round(intensity * 10));
  const maxShift = intensity * 30 * Math.max(0.5, Math.min(3, speed));

  for (let i = 0; i < numSlices; i++) {
    const sliceY = (((i * 37 + speed * 13) % 100) / 100) * main.height;
    const sliceH = Math.max(4, (((i * 19) % 25) / 100) * main.height * intensity);
    const shiftX = (((i * 29) % 31) / 15 - 1) * maxShift;

    mctx.save();
    mctx.beginPath();
    mctx.rect(0, sliceY, main.width, sliceH);
    mctx.clip();
    mctx.drawImage(tempCanvas, shiftX, 0);

    if (intensity > 0.35) {
      mctx.globalCompositeOperation = "screen";
      mctx.globalAlpha = intensity * 0.35;
      mctx.drawImage(tempCanvas, shiftX * 1.5, 0);
    }
    mctx.restore();
  }

  mctx.restore();
}

/**
 * Ghost post-processing pass:
 * Draws an offset, blurred, semi-transparent trailing duplicate.
 */
export function applyGhost(
  main: HTMLCanvasElement,
  opacity = 0.4,
  offset = 8,
  blur = 2,
) {
  if (opacity <= 0.01 || main.width === 0 || main.height === 0) return;

  const target = getBlurCanvas(main.width, main.height);
  if (!target) return;
  const { canvas: tempCanvas, ctx: tempCtx } = target;

  tempCtx.filter = "none";
  tempCtx.globalCompositeOperation = "source-over";
  tempCtx.globalAlpha = 1.0;
  tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
  tempCtx.drawImage(main, 0, 0);

  const mctx = main.getContext("2d");
  if (!mctx) return;

  mctx.save();
  mctx.setTransform(1, 0, 0, 1, 0, 0);
  mctx.globalAlpha = Math.max(0, Math.min(1, opacity));
  mctx.globalCompositeOperation = "screen";
  if (blur > 0.05) {
    mctx.filter = `blur(${blur.toFixed(1)}px)`;
  }
  mctx.drawImage(tempCanvas, -offset, -offset * 0.5);
  mctx.filter = "none";
  mctx.restore();
}

/**
 * Edge Fade post-processing pass:
 * Softly darkens the canvas edges according to top, right, bottom, and left fractions (0 to 1).
 */
export function applyEdgeFade(
  main: HTMLCanvasElement,
  top = 0,
  right = 0,
  bottom = 0,
  left = 0,
) {
  if (
    main.width === 0 ||
    main.height === 0 ||
    (top <= 0.001 && right <= 0.001 && bottom <= 0.001 && left <= 0.001)
  ) {
    return;
  }

  const ctx = main.getContext("2d");
  if (!ctx) return;

  const w = main.width;
  const h = main.height;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // Top edge fade
  if (top > 0.001) {
    const fadeH = Math.min(h, h * top);
    const grad = ctx.createLinearGradient(0, 0, 0, fadeH);
    grad.addColorStop(0, "rgba(0, 0, 0, 1)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, fadeH);
  }

  // Bottom edge fade
  if (bottom > 0.001) {
    const fadeH = Math.min(h, h * bottom);
    const grad = ctx.createLinearGradient(0, h, 0, h - fadeH);
    grad.addColorStop(0, "rgba(0, 0, 0, 1)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, h - fadeH, w, fadeH);
  }

  // Left edge fade
  if (left > 0.001) {
    const fadeW = Math.min(w, w * left);
    const grad = ctx.createLinearGradient(0, 0, fadeW, 0);
    grad.addColorStop(0, "rgba(0, 0, 0, 1)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, fadeW, h);
  }

  // Right edge fade
  if (right > 0.001) {
    const fadeW = Math.min(w, w * right);
    const grad = ctx.createLinearGradient(w, 0, w - fadeW, 0);
    grad.addColorStop(0, "rgba(0, 0, 0, 1)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(w - fadeW, 0, fadeW, h);
  }

  ctx.restore();
}

