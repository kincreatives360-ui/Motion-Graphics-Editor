import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import { exportSceneToWebm } from "./export-webm";

export interface ExportMp4Options {
  onProgress?: (
    progress: number,
    currentFrame: number,
    totalFrames: number,
    stage?: "rendering" | "encoding",
  ) => void;
  signal?: AbortSignal;
}

/**
 * High-performance hardware-accelerated H.264 MP4 export using browser WebCodecs
 * and mp4-muxer. Directly passes Canvas VideoFrames into GPU encoder with zero
 * CPU transcode overhead.
 */
export async function exportSceneToWebCodecsMp4(
  renderFrame: (frame: number) => void,
  canvas: HTMLCanvasElement,
  totalFrames: number,
  fps: number,
  options?: ExportMp4Options,
): Promise<Blob> {
  const { onProgress, signal } = options || {};

  if (typeof window === "undefined" || !(window as any).VideoEncoder) {
    throw new Error("WebCodecs VideoEncoder is not available in this browser");
  }

  // Dimensions must be even integers for H.264
  const width = canvas.width % 2 === 0 ? canvas.width : canvas.width - 1;
  const height = canvas.height % 2 === 0 ? canvas.height : canvas.height - 1;

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: {
      codec: "avc",
      width,
      height,
    },
    fastStart: "in-memory",
    firstTimestampBehavior: "offset",
  });

  let encoderError: any = null;
  const encoder = new (window as any).VideoEncoder({
    output: (chunk: any, meta: any) => {
      muxer.addVideoChunk(chunk, meta);
    },
    error: (e: any) => {
      encoderError = e;
    },
  });

  // Calculate target bitrate based on resolution and frame rate
  const bitrate = Math.max(3_000_000, Math.round(width * height * fps * 0.18));

  // Configure H.264 baseline/high profile
  await encoder.configure({
    codec: "avc1.640028", // H.264 High Profile Level 4.0
    width,
    height,
    bitrate,
    framerate: fps,
  });

  const frameDurationUs = Math.round(1_000_000 / fps);

  for (let f = 0; f < totalFrames; f++) {
    if (signal?.aborted) {
      encoder.close();
      throw new DOMException("MP4 export was cancelled", "AbortError");
    }
    if (encoderError) {
      throw encoderError;
    }

    renderFrame(f);

    const videoFrame = new (window as any).VideoFrame(canvas, {
      timestamp: f * frameDurationUs,
      duration: frameDurationUs,
    });

    const isKeyframe = f % (fps * 2) === 0;
    encoder.encode(videoFrame, { keyFrame: isKeyframe });
    videoFrame.close();

    onProgress?.((f + 1) / totalFrames, f + 1, totalFrames, "encoding");

    // Breathe event loop so UI stays responsive
    if (f % 6 === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  await encoder.flush();
  encoder.close();
  muxer.finalize();

  return new Blob([target.buffer], { type: "video/mp4" });
}

/**
 * Initializes and loads an FFmpeg instance using single-threaded ffmpeg-core.
 * Loads WASM binaries from local application assets with automatic CDN fallback.
 */
async function loadFFmpeg(signal?: AbortSignal): Promise<FFmpeg> {
  if (signal?.aborted) {
    throw new DOMException("MP4 export was cancelled", "AbortError");
  }

  const ffmpeg = new FFmpeg();

  const abortHandler = () => {
    try {
      ffmpeg.terminate();
    } catch {
      // Ignore cleanup error on abort
    }
  };

  signal?.addEventListener("abort", abortHandler, { once: true });

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const basePath = (import.meta as any).env?.BASE_URL || "/";
  const normalizedBase = `${origin}${basePath.endsWith("/") ? basePath : `${basePath}/`}`.replace(/\/+$/, "");

  try {
    // Attempt local asset load first
    const coreURL = await toBlobURL(`${normalizedBase}/ffmpeg/ffmpeg-core.js`, "text/javascript");
    const wasmURL = await toBlobURL(`${normalizedBase}/ffmpeg/ffmpeg-core.wasm`, "application/wasm");
    const classWorkerURL = `${normalizedBase}/ffmpeg/worker.js`;

    if (signal?.aborted) {
      throw new DOMException("MP4 export was cancelled", "AbortError");
    }

    await ffmpeg.load({
      coreURL,
      wasmURL,
      classWorkerURL,
    });

    return ffmpeg;
  } catch (localErr) {
    if (signal?.aborted) {
      throw new DOMException("MP4 export was cancelled", "AbortError");
    }

    console.warn("Local ffmpeg.wasm loading encountered an issue, falling back to CDN:", localErr);

    // Reliable fallback to official unpkg CDN
    const cdnBase = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";
    const coreURL = await toBlobURL(`${cdnBase}/ffmpeg-core.js`, "text/javascript");
    const wasmURL = await toBlobURL(`${cdnBase}/ffmpeg-core.wasm`, "application/wasm");

    await ffmpeg.load({
      coreURL,
      wasmURL,
    });

    return ffmpeg;
  } finally {
    signal?.removeEventListener("abort", abortHandler);
  }
}

/**
 * Transcodes an existing WebM Blob to H.264/AAC MP4 using ffmpeg.wasm running in a Web Worker.
 *
 * @param webmBlob The WebM video blob produced by MediaRecorder capture
 * @param totalFrames Total frames in the animation
 * @param fps Target frames per second
 * @param options Progress callback and abort signal
 */
export async function transcodeWebmToMp4(
  webmBlob: Blob,
  totalFrames: number,
  fps: number,
  options?: ExportMp4Options,
): Promise<Blob> {
  const { onProgress, signal } = options || {};

  if (signal?.aborted) {
    throw new DOMException("MP4 export was cancelled", "AbortError");
  }

  const ffmpeg = await loadFFmpeg(signal);

  const abortHandler = () => {
    try {
      ffmpeg.terminate();
    } catch {
      // Ignore
    }
  };
  signal?.addEventListener("abort", abortHandler, { once: true });

  try {
    let lastReportedFrame = 0;

    // Track ffmpeg progress events
    ffmpeg.on("progress", ({ progress }) => {
      if (signal?.aborted) return;
      const ratio = Math.min(Math.max(progress, 0), 1);
      const estFrame = Math.round(ratio * totalFrames);
      lastReportedFrame = Math.max(lastReportedFrame, estFrame);
      onProgress?.(ratio, lastReportedFrame, totalFrames, "encoding");
    });

    // Parse FFmpeg stderr logs to extract frame counter when available
    ffmpeg.on("log", ({ message }) => {
      if (signal?.aborted) return;
      const frameMatch = message.match(/frame=\s*(\d+)/);
      if (frameMatch && frameMatch[1]) {
        const parsedFrame = parseInt(frameMatch[1], 10);
        if (!isNaN(parsedFrame) && parsedFrame > lastReportedFrame) {
          lastReportedFrame = Math.min(parsedFrame, totalFrames);
          const ratio = Math.min(lastReportedFrame / totalFrames, 1);
          onProgress?.(ratio, lastReportedFrame, totalFrames, "encoding");
        }
      }
    });

    // 1. Write input WebM to virtual FS
    const webmData = await fetchFile(webmBlob);
    if (signal?.aborted) {
      throw new DOMException("MP4 export was cancelled", "AbortError");
    }
    await ffmpeg.writeFile("input.webm", webmData);

    // 2. Transcode to universally compatible H.264 (yuv420p) with faststart
    await ffmpeg.exec([
      "-i",
      "input.webm",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "22",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "output.mp4",
    ]);

    if (signal?.aborted) {
      throw new DOMException("MP4 export was cancelled", "AbortError");
    }

    // 3. Read output MP4 from virtual FS
    const outputData = await ffmpeg.readFile("output.mp4");
    const outputBytes =
      outputData instanceof Uint8Array
        ? outputData
        : new Uint8Array(outputData as any);

    // Clean up virtual files
    try {
      await ffmpeg.deleteFile("input.webm");
      await ffmpeg.deleteFile("output.mp4");
    } catch {
      // Ignore cleanup error
    }

    onProgress?.(1, totalFrames, totalFrames, "encoding");

    return new Blob([outputBytes.buffer as ArrayBuffer], { type: "video/mp4" });
  } catch (err: any) {
    if (signal?.aborted) {
      throw new DOMException("MP4 export was cancelled", "AbortError");
    }
    throw err;
  } finally {
    signal?.removeEventListener("abort", abortHandler);
    try {
      ffmpeg.terminate();
    } catch {
      // Ignore
    }
  }
}

/**
 * Exports scene frames to an H.264 MP4 video Blob via two-phase export:
 * 1. Frame capture to WebM using exportSceneToWebm
 * 2. Client-side transcoding to MP4 via ffmpeg.wasm in a Web Worker
 *
 * @param renderFrame Function that synchronously renders frame number into canvas
 * @param canvas Offscreen or capture canvas element
 * @param totalFrames Total frames to render and record
 * @param fps Target frame rate
 * @param options Progress callback and abort signal
 */
export async function exportSceneToMp4(
  renderFrame: (frame: number) => void,
  canvas: HTMLCanvasElement,
  totalFrames: number,
  fps: number,
  options?: ExportMp4Options,
): Promise<Blob> {
  const { onProgress, signal } = options || {};

  // 1. Fast Path: Hardware-accelerated GPU WebCodecs + mp4-muxer
  if (typeof window !== "undefined" && (window as any).VideoEncoder) {
    try {
      return await exportSceneToWebCodecsMp4(
        renderFrame,
        canvas,
        totalFrames,
        fps,
        options,
      );
    } catch (err: any) {
      if (err.name === "AbortError") throw err;
      console.warn("WebCodecs export failed, falling back to FFmpeg WASM:", err);
    }
  }

  // 2. High-fidelity Fallback: WebM render + ffmpeg.wasm transcode
  // Phase 1: Render frames to WebM (0% - 50% overall progress)
  const webmBlob = await exportSceneToWebm(
    renderFrame,
    canvas,
    totalFrames,
    fps,
    {
      onProgress: (ratio, currentFrame, total) => {
        onProgress?.(ratio * 0.5, currentFrame, total, "rendering");
      },
      signal,
    },
  );

  if (signal?.aborted) {
    throw new DOMException("MP4 export was cancelled", "AbortError");
  }

  // Phase 2: Transcode WebM to H.264 MP4 (50% - 100% overall progress)
  const mp4Blob = await transcodeWebmToMp4(
    webmBlob,
    totalFrames,
    fps,
    {
      onProgress: (ratio, currentFrame, total) => {
        onProgress?.(0.5 + ratio * 0.5, currentFrame, total, "encoding");
      },
      signal,
    },
  );

  return mp4Blob;
}
