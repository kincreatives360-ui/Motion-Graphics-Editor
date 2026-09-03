/**
 * WebM export implementation using canvas.captureStream with manual requestFrame calls
 * driven frame-by-frame, matching the exact CanvasStage rendered output.
 */

export interface ExportWebmOptions {
  onProgress?: (progress: number, currentFrame: number, totalFrames: number) => void;
  signal?: AbortSignal;
}

/**
 * Determine supported WebM mime type for MediaRecorder.
 */
function getSupportedWebmMimeType(): string {
  if (typeof MediaRecorder === "undefined") {
    return "video/webm";
  }
  const candidateTypes = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm;codecs=h264",
    "video/webm",
  ];
  for (const type of candidateTypes) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "video/webm";
}

/**
 * Exports scene frames to a WebM video Blob via MediaRecorder captureStream.
 *
 * @param renderFrame Function that synchronously renders frame number into canvas
 * @param canvas Offscreen or capture canvas element
 * @param totalFrames Total frames to render and record
 * @param fps Target frame rate (e.g. 30 or 60)
 * @param options Progress callback and abort signal
 */
export async function exportSceneToWebm(
  renderFrame: (frame: number) => void,
  canvas: HTMLCanvasElement,
  totalFrames: number,
  fps: number,
  options?: ExportWebmOptions,
): Promise<Blob> {
  const { onProgress, signal } = options || {};

  if (typeof MediaRecorder === "undefined") {
    throw new Error(
      "MediaRecorder is not supported in this browser. Please try another browser or use GIF export.",
    );
  }

  // Stream with manual frame pushing (frameRate = 0)
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as any;
  const mimeType = getSupportedWebmMimeType();

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8_000_000, // 8 Mbps high quality
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: "video/webm" }));
    };
    recorder.onerror = (e: any) => {
      reject(new Error(e?.error?.message || "MediaRecorder error during WebM export"));
    };
  });

  recorder.start();

  const frameIntervalMs = 1000 / fps;

  try {
    for (let frame = 0; frame < totalFrames; frame++) {
      if (signal?.aborted) {
        recorder.stop();
        throw new DOMException("WebM export was cancelled", "AbortError");
      }

      // 1. Draw one frame to the canvas
      renderFrame(frame);

      // 2. Push this drawn frame into the stream
      if (track && typeof track.requestFrame === "function") {
        track.requestFrame();
      }

      // 3. Notify progress
      onProgress?.((frame + 1) / totalFrames, frame + 1, totalFrames);

      // 4. Wait frame interval for MediaRecorder internal clocking
      await new Promise((r) => setTimeout(r, frameIntervalMs));
    }
  } catch (err) {
    if (recorder.state !== "inactive") {
      recorder.stop();
    }
    throw err;
  }

  recorder.stop();
  return done;
}
