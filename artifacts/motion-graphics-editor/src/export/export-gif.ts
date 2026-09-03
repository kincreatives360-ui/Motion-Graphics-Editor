/**
 * GIF export implementation using gif.js with workers running off the main thread.
 * Captures each frame as ImageData from the rendered canvas.
 */

import GIF from "gif.js";

export interface ExportGifOptions {
  onProgress?: (
    progress: number,
    currentFrame: number,
    totalFrames: number,
    stage: "capturing" | "encoding",
  ) => void;
  signal?: AbortSignal;
  quality?: number; // 1-30, lower is better quality (default: 10)
  workerScript?: string;
}

/**
 * Exports scene frames to an animated GIF Blob using gif.js web workers.
 *
 * @param renderFrame Function that synchronously renders frame number into canvas
 * @param canvas Offscreen or capture canvas element
 * @param totalFrames Total frames to render and record
 * @param fps Target frame rate (e.g. 15, 24, 30)
 * @param options Progress callback, abort signal, and quality settings
 */
export async function exportSceneToGif(
  renderFrame: (frame: number) => void,
  canvas: HTMLCanvasElement,
  totalFrames: number,
  fps: number,
  options?: ExportGifOptions,
): Promise<Blob> {
  const {
    onProgress,
    signal,
    quality = 10,
    workerScript = "/gif.worker.js",
  } = options || {};

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("Failed to get 2D canvas rendering context for GIF export.");
  }

  // GIF constructor with background worker script
  const gif = new GIF({
    workers: 2,
    quality,
    workerScript,
    width: canvas.width,
    height: canvas.height,
  });

  const delayMs = Math.round(1000 / fps);

  // Phase 1: Capture frames as ImageData
  for (let frame = 0; frame < totalFrames; frame++) {
    if (signal?.aborted) {
      gif.abort();
      throw new DOMException("GIF export was cancelled", "AbortError");
    }

    renderFrame(frame);

    // Capture as ImageData
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    gif.addFrame(imageData, { delay: delayMs });

    // Progress 0% to 50% for capturing phase
    const captureProgress = ((frame + 1) / totalFrames) * 0.5;
    onProgress?.(captureProgress, frame + 1, totalFrames, "capturing");

    // Yield to the event loop so the UI remains responsive
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  if (signal?.aborted) {
    gif.abort();
    throw new DOMException("GIF export was cancelled", "AbortError");
  }

  // Phase 2: Encoding in web worker (50% to 100%)
  return new Promise<Blob>((resolve, reject) => {
    const handleAbort = () => {
      gif.abort();
      reject(new DOMException("GIF export was cancelled", "AbortError"));
    };

    if (signal) {
      signal.addEventListener("abort", handleAbort);
    }

    gif.on("progress", (percent: number) => {
      // Scale worker encoding from 50% to 100%
      const overall = 0.5 + percent * 0.5;
      onProgress?.(overall, totalFrames, totalFrames, "encoding");
    });

    gif.on("finished", (blob: Blob) => {
      if (signal) {
        signal.removeEventListener("abort", handleAbort);
      }
      resolve(blob);
    });

    gif.on("abort", () => {
      if (signal) {
        signal.removeEventListener("abort", handleAbort);
      }
      reject(new DOMException("GIF export was cancelled", "AbortError"));
    });

    try {
      gif.render();
    } catch (err) {
      reject(err);
    }
  });
}
