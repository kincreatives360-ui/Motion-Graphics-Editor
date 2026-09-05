import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Play, Pause, SkipBack, ZoomIn, ZoomOut, Plus, Sparkles } from 'lucide-react';

export type TrackLayerType =
  | 'shot'
  | 'shape'
  | 'text'
  | 'image'
  | 'audio'
  | 'animation'
  | 'camera-zoom'
  | 'light-key'
  | 'effect';

export interface TimelineClip {
  id: string;
  name: string;
  startFrame: number;
  durationFrames: number;
  type: TrackLayerType;
}

export interface TimelineTrack {
  id: string;
  name: string;
  type: TrackLayerType;
  clips: TimelineClip[];
}

export interface RaylightTimelineProps {
  tracks: TimelineTrack[];
  currentFrame: number;
  totalFrames: number;
  fps?: number;
  selectedClipIds: string[];
  onSeek: (frame: number) => void;
  onSelectClip: (clipId: string, multiSelect?: boolean) => void;
  onUpdateClip: (clipId: string, updates: Partial<TimelineClip>) => void;
  onAddClip?: (trackId: string, frame: number) => void;
}

export const LAYER_CONFIG: Record<TrackLayerType, { varName: string; border: string; bg: string; text?: string }> = {
  shot: { varName: 'var(--color-shot)', border: 'border-shot/60', bg: 'bg-shot/15' },
  shape: { varName: 'var(--color-shape)', border: 'border-[var(--color-shape)]/60', bg: 'bg-[var(--color-shape)]/15' },
  text: { varName: 'var(--color-text)', border: 'border-[var(--color-text)]/60', bg: 'bg-[var(--color-text)]/15', text: 'text-text' },
  image: { varName: 'var(--color-primary)', border: 'border-primary/60', bg: 'bg-primary/15' },
  audio: { varName: 'var(--color-audio-track)', border: 'border-[var(--color-audio-track)]/60', bg: 'bg-audio-track/15' },
  animation: { varName: 'var(--color-animation)', border: 'border-animation/60', bg: 'bg-animation/15', text: 'text-animation' },
  'camera-zoom': { varName: 'var(--color-brand-green)', border: 'border-camera-zoom/60', bg: 'bg-camera-zoom/15' },
  'light-key': { varName: 'var(--color-brand-amber)', border: 'border-light-key/60', bg: 'bg-light-key/15', text: 'text-light-key' },
  effect: { varName: 'var(--color-effect)', border: 'border-effect/60', bg: 'bg-effect/15', text: 'text-effect' },
};

export const RaylightTimeline: React.FC<RaylightTimelineProps> = ({
  tracks,
  currentFrame,
  totalFrames,
  fps = 30,
  selectedClipIds,
  onSeek,
  onSelectClip,
  onUpdateClip,
  onAddClip,
}) => {
  const [pixelsPerFrame, setPixelsPerFrame] = useState<number>(4);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [hoveredFrame, setHoveredFrame] = useState<number | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<{ trackId: string; frame: number; leftPx: number; widthPx: number } | null>(null);
  
  const [activeDrag, setActiveDrag] = useState<{
    clipId: string;
    action: 'move' | 'trim-start' | 'trim-end';
    startX: number;
    initialStartFrame: number;
    initialDuration: number;
    currentStartFrame: number;
    currentDuration: number;
  } | null>(null);

  const rulerRef = useRef<HTMLDivElement>(null);
  const tracksContainerRef = useRef<HTMLDivElement>(null);

  // Format seconds + frames
  const formatTime = (frame: number) => {
    const totalSecs = frame / fps;
    const mins = Math.floor(totalSecs / 60);
    const secs = Math.floor(totalSecs % 60);
    const remFrames = frame % fps;
    return `${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}:${remFrames.toString().padStart(2, '0')}`;
  };

  // Scrubber Seek logic
  const handleScrub = useCallback(
    (clientX: number) => {
      if (!rulerRef.current) return;
      const rect = rulerRef.current.getBoundingClientRect();
      const relativeX = clientX - rect.left;
      const targetFrame = Math.round(Math.max(0, relativeX / pixelsPerFrame));
      onSeek(Math.min(totalFrames, targetFrame));
    },
    [pixelsPerFrame, totalFrames, onSeek]
  );

  const onRulerMouseDown = (e: React.MouseEvent) => {
    handleScrub(e.clientX);
    const onMove = (moveEvt: MouseEvent) => handleScrub(moveEvt.clientX);
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const onRulerMouseMove = (e: React.MouseEvent) => {
    if (!rulerRef.current) return;
    const rect = rulerRef.current.getBoundingClientRect();
    const relativeX = e.clientX - rect.left;
    const frame = Math.round(Math.max(0, Math.min(totalFrames, relativeX / pixelsPerFrame)));
    setHoveredFrame(frame);
  };

  // Keyboard shortcut listener for Play/Pause and Step Frame
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.getAttribute('contenteditable') === 'true')) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        onSeek(Math.max(0, currentFrame - step));
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        onSeek(Math.min(totalFrames, currentFrame + step));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentFrame, totalFrames, onSeek]);

  // Playhead Clock loop
  useEffect(() => {
    if (!isPlaying) return;
    let animId: number;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const delta = (now - lastTime) / 1000;
      if (delta >= 1 / fps) {
        onSeek(currentFrame >= totalFrames ? 0 : currentFrame + 1);
        lastTime = now;
      }
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, currentFrame, totalFrames, fps, onSeek]);

  // Global mousemove/mouseup listener for dragging clips
  useEffect(() => {
    if (!activeDrag) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - activeDrag.startX;
      const deltaFrames = Math.round(deltaX / pixelsPerFrame);

      if (activeDrag.action === 'move') {
        const newStart = Math.max(0, activeDrag.initialStartFrame + deltaFrames);
        setActiveDrag((prev) => prev ? { ...prev, currentStartFrame: newStart } : null);
        onUpdateClip(activeDrag.clipId, { startFrame: newStart });
      } else if (activeDrag.action === 'trim-start') {
        const newStart = Math.max(0, activeDrag.initialStartFrame + deltaFrames);
        const newDuration = Math.max(1, activeDrag.initialDuration - deltaFrames);
        if (newDuration >= 1) {
          setActiveDrag((prev) => prev ? { ...prev, currentStartFrame: newStart, currentDuration: newDuration } : null);
          onUpdateClip(activeDrag.clipId, { startFrame: newStart, durationFrames: newDuration });
        }
      } else if (activeDrag.action === 'trim-end') {
        const newDuration = Math.max(1, activeDrag.initialDuration + deltaFrames);
        setActiveDrag((prev) => prev ? { ...prev, currentDuration: newDuration } : null);
        onUpdateClip(activeDrag.clipId, { durationFrames: newDuration });
      }
    };

    const handleMouseUp = () => {
      setActiveDrag(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activeDrag, pixelsPerFrame, onUpdateClip]);

  const handleTrackPointerMove = (e: React.PointerEvent, track: TimelineTrack) => {
    if (!tracksContainerRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relativeX = e.clientX - rect.left;
    const frame = Math.max(0, Math.min(totalFrames, Math.floor(relativeX / pixelsPerFrame)));
    
    // Check if hovering directly over an existing clip
    const isOverClip = track.clips.some(
      (c) => frame >= c.startFrame && frame <= c.startFrame + c.durationFrames
    );

    if (isOverClip) {
      setHoveredSlot(null);
    } else {
      const snapFrame = Math.floor(frame / 5) * 5;
      const slotDuration = Math.min(30, totalFrames - snapFrame);
      setHoveredSlot({
        trackId: track.id,
        frame: snapFrame,
        leftPx: snapFrame * pixelsPerFrame,
        widthPx: slotDuration * pixelsPerFrame,
      });
    }
  };

  const activeDraggingClip = activeDrag
    ? tracks.flatMap((t) => t.clips).find((c) => c.id === activeDrag.clipId)
    : null;

  return (
    <div className="flex flex-col w-full bg-background border-t border-border select-none font-sans overflow-hidden">
      {/* 1. Transport Toolbar */}
      <div className="flex items-center justify-between h-9 px-3 bg-secondary/30 border-b border-border text-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onSeek(0)}
            className="p-1.5 hover:bg-secondary/60 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Jump to Start"
          >
            <SkipBack className="size-3.5" />
          </button>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-1.5 hover:bg-secondary/60 rounded text-foreground transition-colors cursor-pointer"
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5 fill-current" />}
          </button>
          <div className="h-4 w-px bg-border mx-1" />
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {formatTime(currentFrame)}{' '}
            <span className="opacity-40">/</span> {formatTime(totalFrames)}
            <span className="opacity-50 ml-1.5 text-[10px]">({currentFrame}f)</span>
          </span>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPixelsPerFrame((prev) => Math.max(1, prev - 1))}
            className="p-1 hover:bg-secondary/60 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="size-3.5" />
          </button>
          <span className="text-[10px] font-mono tabular-nums text-muted-foreground px-1">
            {pixelsPerFrame}x
          </span>
          <button
            onClick={() => setPixelsPerFrame((prev) => Math.min(20, prev + 1))}
            className="p-1 hover:bg-secondary/60 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="size-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Scrubber Track Ruler */}
      <div className="relative flex h-7 w-full bg-card border-b border-border overflow-hidden select-none">
        {/* Fixed Header Blank */}
        <div className="sticky left-0 z-30 w-36 h-full bg-card border-r border-border shrink-0 flex items-center px-3 shadow-xs">
          <span className="text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">
            Tracks
          </span>
        </div>

        {/* Interactive Scrubbing Ribbon */}
        <div
          ref={rulerRef}
          onMouseDown={onRulerMouseDown}
          onMouseMove={onRulerMouseMove}
          onMouseLeave={() => setHoveredFrame(null)}
          className="group/scrub relative flex-1 h-full cursor-col-resize bg-secondary/10 hover:bg-secondary/30 transition-colors"
        >
          {/* Tick Marks */}
          <div className="absolute inset-0 flex items-end pointer-events-none opacity-40">
            {Array.from({ length: Math.ceil(totalFrames / fps) + 1 }).map((_, i) => (
              <div
                key={i}
                className="absolute bottom-0 h-3 border-l border-muted-foreground"
                style={{ left: `${i * fps * pixelsPerFrame}px` }}
              >
                <span className="absolute bottom-3 left-1 text-[8px] font-mono tabular-nums text-muted-foreground group-hover/scrub:text-foreground">
                  {i}s
                </span>
              </div>
            ))}
          </div>

          {/* Hover Ghost Scrubber Marker */}
          {hoveredFrame !== null && (
            <div
              className="absolute top-0 bottom-0 pointer-events-none w-px bg-primary/40 z-20"
              style={{ left: `${hoveredFrame * pixelsPerFrame}px` }}
            >
              <span className="absolute top-0.5 left-1 text-[8px] font-mono bg-card/90 px-1 py-0.2 rounded border border-border text-primary shadow-xs">
                {hoveredFrame}f
              </span>
            </div>
          )}

          {/* Scrubber Needle & Diamond Head */}
          <div
            className="absolute top-0 bottom-0 z-40 w-[1.75px] bg-primary pointer-events-none transition-[left] duration-75"
            style={{ transform: `translateX(${currentFrame * pixelsPerFrame}px)` }}
          >
            <div className="size-2.5 -ml-[4.5px] -mt-[1px] bg-primary rotate-45 rounded-[1px] shadow-sm hover:scale-125 transition-transform cursor-ew-resize pointer-events-auto" />
          </div>
        </div>
      </div>

      {/* 3. Layer Track Container with full-height Scrubber Line and Snap Guides */}
      <div
        ref={tracksContainerRef}
        className="relative flex flex-col divide-y divide-border/60 overflow-y-auto max-h-72 overflow-x-hidden bg-canvas/80"
      >
        {/* Full-height Scrubber Line with glow through all tracks */}
        <div
          className="absolute top-0 bottom-0 w-[1.75px] bg-primary pointer-events-none z-30 shadow-[0_0_8px_var(--color-primary)] transition-[left] duration-75"
          style={{
            left: `${currentFrame * pixelsPerFrame + 144}px`, // 144px is w-36 sidebar
          }}
        />

        {/* Dynamic Snap Guidelines during active drag or trim */}
        {activeDrag && activeDraggingClip && (
          <>
            {/* Start Edge Guide Line */}
            <div
              className="absolute top-0 bottom-0 w-px border-l border-dashed border-primary/80 pointer-events-none z-30"
              style={{ left: `${(activeDrag.currentStartFrame ?? activeDrag.initialStartFrame) * pixelsPerFrame + 144}px` }}
            />
            {/* End Edge Guide Line */}
            <div
              className="absolute top-0 bottom-0 w-px border-l border-dashed border-primary/80 pointer-events-none z-30"
              style={{
                left: `${((activeDrag.currentStartFrame ?? activeDrag.initialStartFrame) + (activeDrag.currentDuration ?? activeDrag.initialDuration)) * pixelsPerFrame + 144}px`,
              }}
            />
          </>
        )}

        {tracks.map((track) => (
          <div
            key={track.id}
            className="group/row relative h-11 w-full flex items-center bg-canvas/80 hover:bg-secondary/20 transition-colors"
          >
            {/* Sticky Sidebar Label */}
            <div className="sticky left-0 z-20 w-36 h-full px-3 flex items-center bg-card/95 backdrop-blur-xs border-r border-border text-xs font-medium text-muted-foreground group-hover/row:text-foreground shrink-0 shadow-xs">
              <span className="truncate">{track.name}</span>
            </div>

            {/* Track Lanes */}
            <div
              className="relative h-full flex-1 overflow-hidden"
              onPointerMove={(e) => handleTrackPointerMove(e, track)}
              onPointerLeave={() => {
                if (hoveredSlot?.trackId === track.id) setHoveredSlot(null);
              }}
            >
              {track.clips.map((clip) => {
                const config = LAYER_CONFIG[clip.type] || LAYER_CONFIG.shot;
                const isSelected = selectedClipIds.includes(clip.id);
                const isThisDragging = activeDrag?.clipId === clip.id;

                return (
                  <div
                    key={clip.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectClip(clip.id, e.shiftKey || e.metaKey);
                    }}
                    style={{
                      left: `${clip.startFrame * pixelsPerFrame}px`,
                      width: `${clip.durationFrames * pixelsPerFrame}px`,
                      '--layer-color': config.varName,
                    } as React.CSSProperties & Record<string, string>}
                    className={`group/clip absolute top-1 bottom-1 rounded-sm border transition-all cursor-grab active:cursor-grabbing shadow-xs ${
                      config.border
                    } ${config.bg} ${
                      isSelected
                        ? 'ring-2 ring-primary/80 border-primary bg-primary/20 shadow-md z-10'
                        : 'hover:border-(--layer-color) hover:brightness-105'
                    } ${isThisDragging ? 'scale-[1.01] shadow-lg ring-2 ring-primary z-20 cursor-grabbing' : ''}`}
                  >
                    {/* Live Duration Tooltip Badge floating above clip during drag */}
                    {isThisDragging && (
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-card/95 border border-border text-primary px-1.5 py-0.5 rounded text-[9px] font-mono shadow-md whitespace-nowrap z-40 animate-in fade-in">
                        {clip.durationFrames}f ({(clip.durationFrames / fps).toFixed(2)}s)
                      </div>
                    )}

                    {/* Left Trim Handle */}
                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setActiveDrag({
                          clipId: clip.id,
                          action: 'trim-start',
                          startX: e.clientX,
                          initialStartFrame: clip.startFrame,
                          initialDuration: clip.durationFrames,
                          currentStartFrame: clip.startFrame,
                          currentDuration: clip.durationFrames,
                        });
                      }}
                      className="absolute left-0 top-0 bottom-0 w-2.5 cursor-ew-resize opacity-0 group-hover/clip:opacity-100 bg-primary/30 rounded-l-xs hover:bg-primary/70 transition-opacity z-20 flex items-center justify-center"
                      title="Trim start"
                    >
                      <div className="w-[1px] h-3 bg-primary/80 rounded-full" />
                    </div>

                    {/* Drag Move Handle */}
                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setActiveDrag({
                          clipId: clip.id,
                          action: 'move',
                          startX: e.clientX,
                          initialStartFrame: clip.startFrame,
                          initialDuration: clip.durationFrames,
                          currentStartFrame: clip.startFrame,
                          currentDuration: clip.durationFrames,
                        });
                      }}
                      className="w-full h-full px-2.5 flex items-center overflow-hidden"
                    >
                      <span className={`text-[10px] font-medium truncate select-none ${config.text || 'text-foreground/90'}`}>
                        {clip.name}
                      </span>
                    </div>

                    {/* Right Trim Handle */}
                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setActiveDrag({
                          clipId: clip.id,
                          action: 'trim-end',
                          startX: e.clientX,
                          initialStartFrame: clip.startFrame,
                          initialDuration: clip.durationFrames,
                          currentStartFrame: clip.startFrame,
                          currentDuration: clip.durationFrames,
                        });
                      }}
                      className="absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize opacity-0 group-hover/clip:opacity-100 bg-primary/30 rounded-r-xs hover:bg-primary/70 transition-opacity z-20 flex items-center justify-center"
                      title="Trim end"
                    >
                      <div className="w-[1px] h-3 bg-primary/80 rounded-full" />
                    </div>
                  </div>
                );
              })}

              {/* Dotted Line / Empty Slot Preview on Track Hover */}
              {hoveredSlot?.trackId === track.id && (
                <div
                  className="absolute top-1 bottom-1 rounded-sm border-2 border-dashed border-primary/70 bg-primary/10 text-primary flex items-center justify-center gap-1 text-[9px] font-semibold cursor-pointer z-10 shadow-xs transition-all animate-pulse"
                  style={{
                    left: `${hoveredSlot.leftPx}px`,
                    width: `${Math.max(32, hoveredSlot.widthPx)}px`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onAddClip) onAddClip(track.id, hoveredSlot.frame);
                  }}
                  title={`Click to add clip at frame ${hoveredSlot.frame}`}
                >
                  <Plus size={10} strokeWidth={2.5} />
                  <span className="text-[8px] uppercase tracking-wider font-mono">Add</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
