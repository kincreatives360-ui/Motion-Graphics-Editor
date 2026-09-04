import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  Film,
  Image as ImageIcon,
  Download,
  AlertCircle,
  CheckCircle2,
  Loader2,
  StopCircle,
  Sparkles,
  Layers,
  Settings2,
  Info,
} from "lucide-react";
import { useEditorStore } from "../store/editor-store";
import { renderSceneFrame, preloadSceneImages } from "../canvas/render-frame";
import { exportSceneToWebm } from "../export/export-webm";
import { exportSceneToGif } from "../export/export-gif";
import { exportSceneToMp4 } from "../export/export-mp4";
import { downloadBlob } from "../export/download";

export type ExportFormat = "webm" | "gif" | "mp4";

interface ExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExportModal({ open, onOpenChange }: ExportModalProps) {
  const scenes = useEditorStore((s) => s.scenes);
  const activeSceneId = useEditorStore((s) => s.activeSceneId);
  const projectName = useEditorStore((s) => s.projectName) || "motion_scene";
  const aspectRatio = useEditorStore((s) => s.aspectRatio) || "16:9";
  const activeScene = useMemo(
    () => scenes.find((s) => s.id === activeSceneId) || scenes[0],
    [scenes, activeSceneId],
  );



  // Resolution calculations based on aspect ratio
  const nativeWidth =
    aspectRatio === "9:16" ? 1080 : aspectRatio === "1:1" ? 1080 : 1920;
  const nativeHeight =
    aspectRatio === "9:16" ? 1920 : aspectRatio === "1:1" ? 1080 : 1080;

  // Export settings
  const [format, setFormat] = useState<ExportFormat>("webm");
  const [resolutionScale, setResolutionScale] = useState<number>(1); // 1 = native, 0.67 = 720p approx, 0.5 = 540p
  const [targetFps, setTargetFps] = useState<number>(activeScene?.fps || 30);
  const [gifQuality, setGifQuality] = useState<number>(10); // 1-30

  // Export execution state
  const [status, setStatus] = useState<"idle" | "exporting" | "completed" | "error">(
    "idle",
  );
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [currentRenderFrame, setCurrentRenderFrame] = useState<number>(0);
  const [statusText, setStatusText] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [exportedBlob, setExportedBlob] = useState<Blob | null>(null);
  const [exportedFilename, setExportedFilename] = useState<string>("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bloomCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Sync default FPS with active scene
  useEffect(() => {
    if (activeScene?.fps) {
      setTargetFps(activeScene.fps);
    }
  }, [activeScene?.fps]);

  // Reset state on modal open
  useEffect(() => {
    if (open) {
      setStatus("idle");
      setProgressPercent(0);
      setCurrentRenderFrame(0);
      setStatusText("");
      setErrorMessage(null);
      setExportedBlob(null);
    } else {
      // Abort if closing while running
      if (status === "exporting" && abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    }
  }, [open]);

  const rawWidth = Math.round(nativeWidth * resolutionScale);
  const rawHeight = Math.round(nativeHeight * resolutionScale);
  const outputWidth = rawWidth % 2 === 0 ? rawWidth : rawWidth - 1;
  const outputHeight = rawHeight % 2 === 0 ? rawHeight : rawHeight - 1;
  const totalFrames = activeScene?.durationFrames || 180;
  const durationSec = (totalFrames / targetFps).toFixed(1);

  const handleStartExport = async () => {
    if (!activeScene) return;

    setStatus("exporting");
    setProgressPercent(0);
    setCurrentRenderFrame(0);
    setErrorMessage(null);
    setStatusText("Preparing assets & fonts...");

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // 1. Preload any images used in the scene
      await preloadSceneImages(activeScene);

      if (abortController.signal.aborted) return;

      // 2. Setup rendering canvas
      let canvas = canvasRef.current;
      if (!canvas) {
        canvas = document.createElement("canvas");
        canvasRef.current = canvas;
      }
      canvas.width = outputWidth;
      canvas.height = outputHeight;

      const ctx = canvas.getContext("2d", { willReadFrequently: format === "gif" });
      if (!ctx) {
        throw new Error("Unable to create canvas 2D rendering context");
      }

      // Offscreen bloom canvas
      let bloomCanvas = bloomCanvasRef.current;
      if (!bloomCanvas) {
        bloomCanvas = document.createElement("canvas");
        bloomCanvasRef.current = bloomCanvas;
      }
      bloomCanvas.width = outputWidth;
      bloomCanvas.height = outputHeight;

      // 3. Define frame renderer function matching CanvasStage output
      const renderFrame = (frame: number) => {
        if (!canvas) return;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, outputWidth, outputHeight);

        // Apply scale factor for resolution choice
        ctx.scale(resolutionScale, resolutionScale);

        renderSceneFrame(ctx, activeScene, frame, {
          width: nativeWidth,
          height: nativeHeight,
          lighting: activeScene.lighting,
          offscreenBloomCanvas: bloomCanvas,
          backgroundColor: "#000000",
          sourceCanvas: canvas,
        });

        ctx.restore();
        setCurrentRenderFrame(frame + 1);
      };

      const safeProjectName = projectName.trim().replace(/[^a-zA-Z0-9_-]/g, "_") || "motion_scene";
      let blob: Blob;
      let filename = "";

      if (format === "webm") {
        setStatusText("Recording WebM stream...");
        filename = `${safeProjectName}_${outputWidth}x${outputHeight}.webm`;

        blob = await exportSceneToWebm(
          renderFrame,
          canvas,
          totalFrames,
          targetFps,
          {
            onProgress: (ratio, frame, total) => {
              const pct = Math.round(ratio * 100);
              setProgressPercent(pct);
              setStatusText(`Rendering frame ${frame} of ${total} (${pct}%)...`);
            },
            signal: abortController.signal,
          },
        );
      } else if (format === "gif") {
        setStatusText("Capturing GIF frames...");
        filename = `${safeProjectName}_${outputWidth}x${outputHeight}.gif`;

        blob = await exportSceneToGif(
          renderFrame,
          canvas,
          totalFrames,
          targetFps,
          {
            quality: gifQuality,
            onProgress: (ratio, frame, total, stage) => {
              const pct = Math.round(ratio * 100);
              setProgressPercent(pct);
              if (stage === "capturing") {
                setStatusText(`Capturing frame ${frame} of ${total} (${Math.round(ratio * 100)}%)...`);
              } else {
                setStatusText(`Encoding GIF in web worker thread (${pct}%)...`);
              }
            },
            signal: abortController.signal,
          },
        );
      } else if (format === "mp4") {
        setStatusText("Encoding H.264 MP4 with hardware acceleration...");
        filename = `${safeProjectName}_${outputWidth}x${outputHeight}.mp4`;

        blob = await exportSceneToMp4(
          renderFrame,
          canvas,
          totalFrames,
          targetFps,
          {
            onProgress: (ratio, frame, total, stage) => {
              const pct = Math.round(ratio * 100);
              setProgressPercent(pct);
              if (stage === "rendering") {
                setStatusText(`Rendering frame ${frame} of ${total} (${pct}%)...`);
              } else {
                setStatusText(`Encoding H.264 MP4 (${pct}%)...`);
              }
            },
            signal: abortController.signal,
          },
        );
      } else {
        throw new Error("Format not supported directly");
      }

      setExportedBlob(blob);
      setExportedFilename(filename);
      setStatus("completed");
      setProgressPercent(100);
      setStatusText("Export complete! Starting download...");

      // Automatically trigger browser download
      downloadBlob(blob, filename);
    } catch (err: any) {
      if (err.name === "AbortError") {
        setStatus("idle");
        setStatusText("Export cancelled.");
      } else {
        console.error("Export error:", err);
        setStatus("error");
        setErrorMessage(err?.message || "An unexpected error occurred during export.");
      }
    }
  };

  const handleCancelExport = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setStatus("idle");
  };

  const handleDownloadAgain = () => {
    if (exportedBlob && exportedFilename) {
      downloadBlob(exportedBlob, exportedFilename);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="export-dialog"
        className="bg-[#14161a] border-[#252830] text-[#cfd3dc] sm:max-w-[480px] p-5 shadow-2xl rounded-lg"
      >
        <DialogHeader className="space-y-1 text-left pb-3 border-b border-[#20232a]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-[#38bdf8]/15 text-[#38bdf8] flex items-center justify-center">
              <Download size={13} strokeWidth={2} />
            </div>
            <DialogTitle className="text-[14px] font-semibold text-white tracking-tight">
              Export Scene
            </DialogTitle>
          </div>
          <DialogDescription className="text-[11px] text-[#8e95a3]">
            Export <span className="text-[#cfd3dc] font-medium">{activeScene?.name}</span> as video or animation.
          </DialogDescription>
        </DialogHeader>

        {/* Format Selector */}
        {status !== "exporting" && status !== "completed" && (
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <label id="export-format-label" className="text-[10px] uppercase font-semibold tracking-wider text-[#788190] block">
                Export Format
              </label>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="export-format-label">
                {/* WebM Option */}
                <button
                  type="button"
                  role="radio"
                  aria-checked={format === "webm"}
                  aria-label="WebM format, transparent alpha support"
                  data-testid="format-webm"
                  onClick={() => setFormat("webm")}
                  className={`p-2.5 rounded border text-left flex flex-col gap-1 transition-all ${
                    format === "webm"
                      ? "bg-[#0284c7]/20 border-[#38bdf8] text-white shadow-sm"
                      : "bg-[#181a20] border-[#272a33] text-[#9ca3af] hover:bg-[#1e2128] hover:text-[#d1d5db]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Film size={14} className={format === "webm" ? "text-[#38bdf8]" : "text-[#6b7280]"} />
                    <span className="text-[8px] font-mono uppercase px-1 py-0.5 rounded bg-[#101216] text-[#38bdf8] border border-[#38bdf8]/30">
                      VP9/VP8
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold leading-none mt-1">WebM</span>
                  <span className="text-[9px] text-[#6b7280] leading-tight">
                    Smooth frame capture
                  </span>
                </button>

                {/* GIF Option */}
                <button
                  type="button"
                  role="radio"
                  aria-checked={format === "gif"}
                  aria-label="GIF format, universal image loop"
                  data-testid="format-gif"
                  onClick={() => setFormat("gif")}
                  className={`p-2.5 rounded border text-left flex flex-col gap-1 transition-all ${
                    format === "gif"
                      ? "bg-[#8b5cf6]/20 border-[#a78bfa] text-white shadow-sm"
                      : "bg-[#181a20] border-[#272a33] text-[#9ca3af] hover:bg-[#1e2128] hover:text-[#d1d5db]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <ImageIcon size={14} className={format === "gif" ? "text-[#c4b5fd]" : "text-[#6b7280]"} />
                    <span className="text-[8px] font-mono uppercase px-1 py-0.5 rounded bg-[#101216] text-[#c4b5fd] border border-[#c4b5fd]/30">
                      Worker
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold leading-none mt-1">GIF</span>
                  <span className="text-[9px] text-[#6b7280] leading-tight">
                    Universal image loop
                  </span>
                </button>

                {/* MP4 Option */}
                <button
                  type="button"
                  role="radio"
                  aria-checked={format === "mp4"}
                  aria-label="MP4 format, H.264 video"
                  data-testid="format-mp4"
                  onClick={() => setFormat("mp4")}
                  className={`p-2.5 rounded border text-left flex flex-col gap-1 transition-all ${
                    format === "mp4"
                      ? "bg-[#10b981]/20 border-[#34d399] text-white shadow-sm"
                      : "bg-[#181a20] border-[#272a33] text-[#9ca3af] hover:bg-[#1e2128] hover:text-[#d1d5db]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Film size={14} className={format === "mp4" ? "text-[#34d399]" : "text-[#6b7280]"} />
                    <span className="text-[8px] font-mono uppercase px-1 py-0.5 rounded bg-[#101216] text-[#34d399] border border-[#34d399]/30">
                      GPU Fast
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold leading-none mt-1">MP4</span>
                  <span className="text-[9px] text-[#6b7280] leading-tight">
                    H.264 WebCodecs
                  </span>
                </button>
              </div>
            </div>

            {/* MP4 Choice Callout */}
            {format === "mp4" && (
              <div
                className="bg-[#12201b] border border-[#10b981]/40 rounded p-3 text-[10px] space-y-1.5"
                data-testid="mp4-decision-note"
              >
                <div className="flex items-center gap-1.5 text-[#34d399] font-medium">
                  <Film size={12} />
                  <span>Hardware-Accelerated WebCodecs (H.264 + mp4-muxer)</span>
                </div>
                <p className="text-[#a1a1aa] leading-relaxed">
                  Encodes directly on your GPU using native browser <strong className="text-[#34d399]">WebCodecs VideoEncoder</strong> and <strong className="text-[#34d399]">mp4-muxer</strong> with automatic FFmpeg WASM fallback. Artifact-free 1080p and 4K exports.
                </p>
              </div>
            )}

            {/* Render Settings Grid */}
            <div className="bg-[#17191f] border border-[#23262e] rounded p-3 space-y-2.5">
              <div className="flex items-center justify-between text-[9.5px]">
                <span id="resolution-label" className="text-[#788190] flex items-center gap-1">
                  <Settings2 size={11} /> Resolution:
                </span>
                <div className="flex items-center gap-1" role="radiogroup" aria-labelledby="resolution-label">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={resolutionScale === 2}
                    aria-label={`4K Ultra HD resolution, ${nativeWidth * 2} by ${nativeHeight * 2}`}
                    onClick={() => setResolutionScale(2)}
                    className={`px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${
                      resolutionScale === 2
                        ? "bg-[#38bdf8] text-black font-semibold"
                        : "bg-[#21242c] text-[#9ca3af] hover:text-white"
                    }`}
                  >
                    4K UHD ({nativeWidth * 2}×{nativeHeight * 2})
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={resolutionScale === 1}
                    aria-label={`1080p full resolution, ${nativeWidth} by ${nativeHeight}`}
                    onClick={() => setResolutionScale(1)}
                    className={`px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${
                      resolutionScale === 1
                        ? "bg-[#38bdf8] text-black font-semibold"
                        : "bg-[#21242c] text-[#9ca3af] hover:text-white"
                    }`}
                  >
                    1080p ({nativeWidth}×{nativeHeight})
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={Math.abs(resolutionScale - 0.667) < 0.01}
                    aria-label="720p medium resolution"
                    onClick={() => setResolutionScale(0.667)}
                    className={`px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${
                      Math.abs(resolutionScale - 0.667) < 0.01
                        ? "bg-[#38bdf8] text-black font-semibold"
                        : "bg-[#21242c] text-[#9ca3af] hover:text-white"
                    }`}
                  >
                    720p
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={resolutionScale === 0.5}
                    aria-label="540p small resolution"
                    onClick={() => setResolutionScale(0.5)}
                    className={`px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${
                      resolutionScale === 0.5
                        ? "bg-[#38bdf8] text-black font-semibold"
                        : "bg-[#21242c] text-[#9ca3af] hover:text-white"
                    }`}
                  >
                    540p
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-[9.5px] pt-1 border-t border-[#23262e]">
                <span className="text-[#788190] flex items-center gap-1">
                  <Layers size={11} /> Duration & Framerate:
                </span>
                <div className="flex items-center gap-2 font-mono text-[9px] text-[#cbd5e1]">
                  <span>{totalFrames} frames</span>
                  <span className="text-[#4b5563]">•</span>
                  <span>{durationSec}s @ {targetFps} fps</span>
                </div>
              </div>

              {format === "gif" && (
                <div className="flex items-center justify-between text-[9.5px] pt-1 border-t border-[#23262e]">
                  <span id="gif-quality-label" className="text-[#788190]">GIF Quality:</span>
                  <div className="flex items-center gap-1" role="radiogroup" aria-labelledby="gif-quality-label">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={gifQuality === 10}
                      aria-label="High quality GIF sampling (q10)"
                      onClick={() => setGifQuality(10)}
                      className={`px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${
                        gifQuality === 10
                          ? "bg-[#a78bfa] text-black font-semibold"
                          : "bg-[#21242c] text-[#9ca3af] hover:text-white"
                      }`}
                    >
                      High (q10)
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={gifQuality === 20}
                      aria-label="Fast encoding GIF sampling (q20)"
                      onClick={() => setGifQuality(20)}
                      className={`px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${
                        gifQuality === 20
                          ? "bg-[#a78bfa] text-black font-semibold"
                          : "bg-[#21242c] text-[#9ca3af] hover:text-white"
                      }`}
                    >
                      Fast (q20)
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Exporting Progress View */}
        {status === "exporting" && (
          <div className="space-y-4 py-2" data-testid="export-progress-container">
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-2 text-[#38bdf8] font-medium">
                <Loader2 size={13} className="animate-spin" />
                <span>{statusText || "Rendering scene..."}</span>
              </span>
              <span className="font-mono text-[10px] text-[#94a3b8]">
                {progressPercent}%
              </span>
            </div>

            <Progress
              value={progressPercent}
              aria-label="Export rendering progress"
              data-testid="export-progress-bar"
              className="h-2 bg-[#20242e]"
            />

            <div className="flex items-center justify-between text-[9.5px] text-[#64748b]">
              <span>
                Frame {currentRenderFrame} of {totalFrames}
              </span>
              <span>
                Output: {outputWidth}×{outputHeight} px @ {targetFps} fps
              </span>
            </div>

            {/* Live Frame Preview Thumbnail */}
            <div className="flex flex-col items-center justify-center p-2 rounded bg-[#0b0c0e] border border-[#1f2229]">
              <div className="relative overflow-hidden rounded border border-[#2b2f3a] bg-black max-w-[240px] max-h-[140px] flex items-center justify-center">
                <canvas
                  ref={canvasRef}
                  width={outputWidth}
                  height={outputHeight}
                  className="w-full h-auto object-contain"
                  aria-label="Live export render preview"
                />
              </div>
              <span className="text-[8.5px] text-[#6b7280] mt-1.5">
                Real-time canvas capture preview
              </span>
            </div>
          </div>
        )}

        {/* Completed View */}
        {status === "completed" && (
          <div className="space-y-4 py-3 text-center" data-testid="export-completed-container">
            <div className="w-10 h-10 rounded-full bg-[#10b981]/15 text-[#34d399] flex items-center justify-center mx-auto">
              <CheckCircle2 size={20} strokeWidth={2} />
            </div>
            <div className="space-y-1">
              <h4 className="text-[13px] font-semibold text-white">
                Export Complete!
              </h4>
              <p className="text-[10.5px] text-[#9ca3af]">
                Saved <span className="font-mono text-[#38bdf8]">{exportedFilename}</span> to your downloads folder.
              </p>
            </div>

            <div className="p-2.5 rounded bg-[#171920] border border-[#242730] flex items-center justify-between text-[10px]">
              <span className="text-[#8e95a3]">File size:</span>
              <span className="font-mono text-[#cfd3dc]">
                {exportedBlob ? `${(exportedBlob.size / (1024 * 1024)).toFixed(2)} MB` : "Ready"}
              </span>
            </div>
          </div>
        )}

        {/* Error View */}
        {status === "error" && (
          <div className="space-y-3 py-2" data-testid="export-error-container">
            <div className="p-3 rounded bg-[#ef4444]/15 border border-[#ef4444]/30 text-[#fca5a5] flex items-start gap-2 text-[10.5px]">
              <AlertCircle size={14} className="shrink-0 mt-0.5 text-[#ef4444]" />
              <div className="space-y-1 text-left">
                <span className="font-semibold text-white">Export Failed</span>
                <p className="text-[9.5px] leading-relaxed text-[#fecaca]">
                  {errorMessage || "An error occurred while generating the export file."}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Dialog Actions Footer */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#20232a]">
          {status === "idle" || status === "error" ? (
            <>
              <button
                type="button"
                aria-label="Close export dialog"
                onClick={() => onOpenChange(false)}
                className="px-3 py-1.5 rounded text-[10.5px] text-[#9ca3af] hover:text-white hover:bg-[#1f2229] transition-colors"
              >
                Close
              </button>
              <button
                type="button"
                data-testid="button-start-export"
                disabled={format === "mp4"}
                aria-label={`Export scene as ${format.toUpperCase()}`}
                onClick={handleStartExport}
                className={`px-3.5 py-1.5 rounded text-[10.5px] font-semibold flex items-center gap-1.5 transition-all shadow-sm ${
                  format === "mp4"
                    ? "bg-[#252830] text-[#6b7280] cursor-not-allowed"
                    : "bg-[#0284c7] hover:bg-[#0369a1] text-white"
                }`}
              >
                <Download size={11} strokeWidth={2.5} />
                <span>Export {format.toUpperCase()}</span>
              </button>
            </>
          ) : status === "exporting" ? (
            <button
              type="button"
              data-testid="button-cancel-export"
              aria-label="Cancel active export"
              onClick={handleCancelExport}
              className="px-3 py-1.5 rounded text-[10.5px] font-medium text-[#f87171] hover:bg-[#ef4444]/15 border border-[#ef4444]/30 flex items-center gap-1.5 transition-colors"
            >
              <StopCircle size={11} />
              <span>Cancel Export</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                aria-label="Close export dialog"
                onClick={() => onOpenChange(false)}
                className="px-3 py-1.5 rounded text-[10.5px] text-[#9ca3af] hover:text-white hover:bg-[#1f2229] transition-colors"
              >
                Done
              </button>
              <button
                type="button"
                data-testid="button-download-again"
                aria-label="Download exported file again"
                onClick={handleDownloadAgain}
                className="px-3.5 py-1.5 rounded text-[10.5px] font-semibold bg-[#0284c7] hover:bg-[#0369a1] text-white flex items-center gap-1.5 transition-all shadow-sm"
              >
                <Download size={11} strokeWidth={2} />
                <span>Download Again</span>
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
