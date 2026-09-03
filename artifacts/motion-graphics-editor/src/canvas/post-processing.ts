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
 */
export function applyFilmGrain(main: HTMLCanvasElement, intensity = 0.08) {
  if (intensity <= 0.005 || main.width === 0 || main.height === 0) return;
  const ctx = main.getContext("2d");
  if (!ctx) return;

  const pattern = getNoisePattern(ctx);
  if (!pattern) return;

  ctx.save();
  ctx.globalCompositeOperation = "soft-light";
  ctx.globalAlpha = Math.min(1, Math.max(0, intensity * 1.5));
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, main.width, main.height);
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
