import React, { useState, useRef } from "react";
import {
  Plus,
  Layers,
  Copy,
  Trash2,
  MoreVertical,
  Volume2,
  Film,
  ZoomIn,
} from "lucide-react";
import {
  useEditorStore,
  useEditorUIStore,
  type Scene,
} from "../store/editor-store";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface TrimState {
  sceneId: string;
  edge: "start" | "end";
  startX: number;
  initialDuration: number;
}

interface DragReorderState {
  fromIndex: number;
  hoverIndex: number;
}

export function SceneFilmstrip() {
  const scenes = useEditorStore((s) => s.scenes);
  const activeSceneId = useEditorStore((s) => s.activeSceneId);
  const setActiveScene = useEditorStore((s) => s.setActiveScene);
  const addScene = useEditorStore((s) => s.addScene);
  const updateScene = useEditorStore((s) => s.updateScene);
  const reorderScenes = useEditorStore((s) => s.reorderScenes);
  const deleteScene = useEditorStore((s) => s.deleteScene);
  const duplicateScene = useEditorStore((s) => s.duplicateScene);

  const setTimelineViewLevel = useEditorUIStore((s) => s.setTimelineViewLevel);

  const [trimState, setTrimState] = useState<TrimState | null>(null);
  const [dragReorder, setDragReorder] = useState<DragReorderState | null>(null);
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const stripRef = useRef<HTMLDivElement>(null);

  // Total project duration
  const totalFrames = scenes.reduce((acc, sc) => acc + (sc.durationFrames || 180), 0);
  const fps = scenes[0]?.fps || 30;

  // Scale: pixels per frame in filmstrip mode
  const stripWidth = stripRef.current ? stripRef.current.clientWidth - 160 : 800;
  const pxPerFrame = Math.max(1, (stripWidth > 0 ? stripWidth : 800) / Math.max(1, totalFrames));

  const formatSeconds = (frames: number) => {
    return (frames / fps).toFixed(1) + "s";
  };

  // Start trimming scene duration
  const handleTrimStart = (
    e: React.PointerEvent,
    scene: Scene,
    edge: "start" | "end",
  ) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    setTrimState({
      sceneId: scene.id,
      edge,
      startX: e.clientX,
      initialDuration: scene.durationFrames || 180,
    });
  };

  const handleTrimPointerMove = (e: React.PointerEvent) => {
    if (!trimState) return;
    const deltaX = e.clientX - trimState.startX;
    const deltaFrames = Math.round(deltaX / pxPerFrame);

    let newDuration = trimState.initialDuration;
    if (trimState.edge === "end") {
      newDuration = Math.max(15, trimState.initialDuration + deltaFrames);
    } else {
      newDuration = Math.max(15, trimState.initialDuration - deltaFrames);
    }

    // Snapping: snap to 1-second intervals (fps frames) if close
    const snapThreshold = 3;
    const nearestSecondFrame = Math.round(newDuration / fps) * fps;
    if (Math.abs(newDuration - nearestSecondFrame) <= snapThreshold) {
      newDuration = nearestSecondFrame;
    }

    updateScene(trimState.sceneId, { durationFrames: newDuration });
  };

  const handleTrimPointerUp = (e: React.PointerEvent) => {
    if (trimState) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // pointer capture fallback
      }
      setTrimState(null);
    }
  };

  // Reorder dragging
  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.effectAllowed = "move";
    setDragReorder({ fromIndex: index, hoverIndex: index });
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragReorder && dragReorder.hoverIndex !== index) {
      setDragReorder({ ...dragReorder, hoverIndex: index });
    }
  };

  const handleDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    if (dragReorder) {
      if (dragReorder.fromIndex !== toIndex) {
        reorderScenes(dragReorder.fromIndex, toIndex);
      }
      setDragReorder(null);
    }
  };

  const handleDragEnd = () => {
    setDragReorder(null);
  };

  return (
    <div
      ref={stripRef}
      className="scene-filmstrip flex flex-col flex-1 min-h-0 bg-[#0c0d0f] select-none overflow-hidden"
      onPointerMove={handleTrimPointerMove}
      onPointerUp={handleTrimPointerUp}
      data-testid="scene-filmstrip"
    >
      {/* Filmstrip Ruler / Summary */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1c1f24] bg-[#121417] text-[10px] text-[#9ca3af]">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white flex items-center gap-1.5">
            <Film size={12} className="text-[#38bdf8]" />
            <span>Whole Video</span>
          </span>
          <span className="text-[#4b5563]">|</span>
          <span>{scenes.length} Scenes</span>
          <span className="text-[#4b5563]">|</span>
          <span className="font-mono text-[#cbd5e1]">
            Total: {formatSeconds(totalFrames)} ({totalFrames} frames @ {fps}fps)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[9px] text-[#6b7280]">
            Double-click or click Edit Scene to view layers
          </span>
          <Button
            type="button"
            size="sm"
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#0284c7] hover:bg-[#38bdf8] text-white hover:text-[#082f49] text-[9.5px] font-semibold transition-colors shadow-sm"
            onClick={() => setTimelineViewLevel("scene-detail")}
            title="Open selected scene's layer timeline"
            data-testid="button-open-scene-detail"
          >
            <ZoomIn size={11} strokeWidth={2} />
            <span>Edit Scene</span>
          </Button>
        </div>
      </div>

      {/* Main Track Columns */}
      <div className="flex-1 flex overflow-x-auto overflow-y-hidden">
        {/* Left Track Names */}
        <div className="w-36 flex-shrink-0 border-r border-[#191b1e] bg-[#0f1114] flex flex-col">
          {/* Scenes Row Header */}
          <div className="h-24 px-3 flex flex-col justify-center border-b border-[#191b1e]">
            <span className="text-[11px] font-medium text-[#e2e8f0] flex items-center gap-1.5">
              <Film size={12} className="text-[#38bdf8]" />
              <span>Scenes</span>
            </span>
            <span className="text-[8.5px] text-[#64748b]">
              Drag to reorder • Trim edges
            </span>
          </div>

          {/* Audio Row Header */}
          <div className="h-16 px-3 flex flex-col justify-center border-b border-[#191b1e]">
            <span className="text-[11px] font-medium text-[#94a3b8] flex items-center gap-1.5">
              <Volume2 size={12} className="text-[#a855f7]" />
              <span>Audio Track</span>
            </span>
            <span className="text-[8.5px] text-[#64748b]">Stereo master</span>
          </div>
        </div>

        {/* Right Track Lanes */}
        <div className="flex-1 min-w-[600px] flex flex-col relative bg-[#090a0c]">
          {/* Scenes Blocks Row */}
          <div className="h-24 relative flex items-center px-2 border-b border-[#191b1e] overflow-hidden bg-[#0c0e12]/60">
            <div className="flex items-center gap-1.5 h-full py-2">
              {scenes.map((sc, index) => {
                const isActive = sc.id === activeSceneId;
                const duration = sc.durationFrames || 180;
                const blockWidth = Math.max(120, duration * pxPerFrame);
                const isDragHover = dragReorder?.hoverIndex === index;

                return (
                  <div
                    key={sc.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                    onClick={() => setActiveScene(sc.id)}
                    onDoubleClick={() => {
                      setActiveScene(sc.id);
                      setTimelineViewLevel("scene-detail");
                    }}
                    className={`relative h-full rounded-md border flex flex-col justify-between p-2 cursor-pointer transition-all select-none group ${
                      isActive
                        ? "bg-[#172554]/40 border-[#38bdf8] shadow-[0_0_12px_rgba(56,189,248,0.25)] ring-1 ring-[#38bdf8]/50"
                        : "bg-[#161920] hover:bg-[#1c202a] border-[#262a33] text-[#94a3b8]"
                    } ${isDragHover ? "opacity-60 ring-2 ring-[#a855f7]" : ""}`}
                    style={{ width: `${blockWidth}px` }}
                    data-testid={`scene-block-${sc.id}`}
                    title={`Scene: ${sc.name} (${formatSeconds(duration)}) - Click to select, double-click to open`}
                  >
                    {/* Left Trim Handle */}
                    <div
                      className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 hover:bg-[#38bdf8]/60 transition-opacity rounded-l-md flex items-center justify-center z-10"
                      onPointerDown={(e) => handleTrimStart(e, sc, "start")}
                      title="Drag left edge to trim duration"
                    >
                      <div className="w-0.5 h-3 bg-white/70 rounded-full" />
                    </div>

                    {/* Top Row: Scene Name and Menu */}
                    <div className="flex items-center justify-between w-full">
                      {editingSceneId === sc.id ? (
                        <Input
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onBlur={() => {
                            if (editName.trim()) {
                              updateScene(sc.id, { name: editName.trim() });
                            }
                            setEditingSceneId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              if (editName.trim()) {
                                updateScene(sc.id, { name: editName.trim() });
                              }
                              setEditingSceneId(null);
                            } else if (e.key === "Escape") {
                              setEditingSceneId(null);
                            }
                          }}
                          className="bg-[#0b0f17] border border-[#38bdf8] text-white text-[10px] px-1 py-0.5 rounded outline-none w-24"
                        />
                      ) : (
                        <span
                          className={`font-semibold text-[10.5px] truncate max-w-[120px] ${
                            isActive ? "text-white" : "text-[#cbd5e1]"
                          }`}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            setEditingSceneId(sc.id);
                            setEditName(sc.name);
                          }}
                          title="Double-click to rename"
                        >
                          {sc.name}
                        </span>
                      )}

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="p-1 rounded hover:bg-[#282e3d] text-[#64748b] hover:text-white transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical size={11} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="bg-[#12141a] border border-[#232732] text-[10px] text-[#cbd5e1] p-1 shadow-2xl"
                        >
                          <DropdownMenuItem
                            className="cursor-pointer px-2 py-1 hover:bg-[#1e2433] rounded flex items-center gap-1.5"
                            onClick={() => {
                              setEditingSceneId(sc.id);
                              setEditName(sc.name);
                            }}
                          >
                            <span>Rename Scene</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="cursor-pointer px-2 py-1 hover:bg-[#1e2433] rounded flex items-center gap-1.5"
                            onClick={() => duplicateScene(sc.id)}
                          >
                            <Copy size={10} />
                            <span>Duplicate Scene</span>
                          </DropdownMenuItem>
                          {scenes.length > 1 && (
                            <>
                              <DropdownMenuSeparator className="bg-[#202533]" />
                              <DropdownMenuItem
                                className="cursor-pointer px-2 py-1 hover:bg-rose-900/40 text-rose-300 rounded flex items-center gap-1.5"
                                onClick={() => deleteScene(sc.id)}
                              >
                                <Trash2 size={10} />
                                <span>Delete Scene</span>
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Bottom Row: Duration & Layers badge */}
                    <div className="flex items-center justify-between w-full text-[9px] text-[#64748b]">
                      <span className="font-mono text-[#94a3b8]">
                        {formatSeconds(duration)} ({duration}f)
                      </span>
                      <span className="flex items-center gap-1 bg-[#0b0e14] px-1.5 py-0.5 rounded text-[8px] border border-[#202430]">
                        <Layers size={9} />
                        <span>{sc.layers.length}</span>
                      </span>
                    </div>

                    {/* Right Trim Handle */}
                    <div
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 hover:bg-[#38bdf8]/60 transition-opacity rounded-r-md flex items-center justify-center z-10"
                      onPointerDown={(e) => handleTrimStart(e, sc, "end")}
                      title="Drag right edge to trim duration"
                    >
                      <div className="w-0.5 h-3 bg-white/70 rounded-full" />
                    </div>
                  </div>
                );
              })}

              {/* Add Scene Button */}
              <Button
                type="button"
                variant="ghost"
                className="h-full px-3 flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-[#2d323f] hover:border-[#38bdf8] bg-[#111318]/50 hover:bg-[#171b24] text-[#64748b] hover:text-[#38bdf8] transition-all min-w-[70px]"
                onClick={() => {
                  const newId = addScene();
                  setActiveScene(newId);
                }}
                title="Add new scene to video"
                data-testid="button-add-scene"
              >
                <Plus size={14} strokeWidth={2} />
                <span className="text-[9px] font-medium">+ Scene</span>
              </Button>
            </div>
          </div>

          {/* Audio Row Lane */}
          <div className="h-16 relative flex items-center px-4 border-b border-[#191b1e] bg-[#0b0c0f]">
            <div className="w-full h-8 rounded bg-[#1e1b2e]/60 border border-[#4c1d95]/40 flex items-center px-3 gap-2">
              <Volume2 size={12} className="text-[#a855f7]" />
              <div className="flex-1 h-3 flex items-center gap-0.5 opacity-60">
                {Array.from({ length: 60 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-1 bg-[#a855f7] rounded-full"
                    style={{
                      height: `${Math.max(2, Math.sin(i * 0.4) * 8 + 4)}px`,
                    }}
                  />
                ))}
              </div>
              <span className="text-[8.5px] font-mono text-[#a855f7]">
                Ambient Audio
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

