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
