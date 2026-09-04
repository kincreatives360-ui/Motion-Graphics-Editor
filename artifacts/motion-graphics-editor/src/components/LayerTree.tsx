import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Folder,
  Square,
  Circle,
  Type,
  Image as ImageIcon,
  Spline,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ChevronRight,
  ChevronDown,
  Sparkles,
  LayoutTemplate,
  Copy,
  FolderPlus,
  Trash2,
  Ungroup,
  ArrowUp,
  ArrowDown,
  ChevronsUp,
  ChevronsDown,
  Search,
} from "lucide-react";
import { useEditorStore } from "../store/editor-store";
import type { Layer } from "../store/editor-store";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  SaveSceneTemplateModal,
  SaveAnimationPresetModal,
} from "./SavePresetModals";

interface FlattenedLayerItem {
  layer: Layer;
  depth: number;
}

function getFlattenedTree(layers: Layer[]): FlattenedLayerItem[] {
  const layerMap = new Map(layers.map((l) => [l.id, l]));
  const childrenMap = new Map<string | null, Layer[]>();

  // Initialize
  childrenMap.set(null, []);
  for (const l of layers) {
    const parent = l.parentId && layerMap.has(l.parentId) ? l.parentId : null;
    if (!childrenMap.has(parent)) {
      childrenMap.set(parent, []);
    }
    childrenMap.get(parent)!.push(l);
  }

  const result: FlattenedLayerItem[] = [];
  const visitedTraversal = new Set<string>();

  function traverse(parentId: string | null, depth: number) {
    if (depth > 64) return;
    const children = childrenMap.get(parentId) || [];
    for (const child of children) {
      if (visitedTraversal.has(child.id)) continue;
      visitedTraversal.add(child.id);
      result.push({ layer: child, depth });
      if (child.type === "group") {
        traverse(child.id, depth + 1);
      }
    }
  }

  traverse(null, 0);

  // If there are any unvisited layers (safety fallback), include them
  for (const l of layers) {
    if (!visitedTraversal.has(l.id)) {
      result.push({ layer: l, depth: 0 });
    }
  }

  return result;
}

function isDescendant(layers: Layer[], potentialParentId: string, layerId: string): boolean {
  const map = new Map(layers.map((l) => [l.id, l]));
  let current = map.get(potentialParentId);
  const visited = new Set<string>();
  while (current) {
    if (visited.has(current.id)) return false;
    visited.add(current.id);
    if (current.id === layerId) return true;
    current = current.parentId ? map.get(current.parentId) : undefined;
  }
  return false;
}

export function filterLayersBySearch(layers: Layer[], query: string): Layer[] {
  const q = query.trim().toLowerCase();
  if (!q) return layers;

  const layerMap = new Map(layers.map((l) => [l.id, l]));
  const matchedIds = new Set<string>();

  for (const layer of layers) {
    if (layer.name.toLowerCase().includes(q)) {
      matchedIds.add(layer.id);
    }
  }

  const visibleIds = new Set<string>(matchedIds);

  // Preserve ancestor groups for each match so the hierarchy remains legible
  for (const id of matchedIds) {
    let current = layerMap.get(id);
    const visited = new Set<string>();
    while (current && current.parentId) {
      if (visited.has(current.parentId)) break;
      visited.add(current.parentId);
      visibleIds.add(current.parentId);
      current = layerMap.get(current.parentId);
    }
  }

  // If a group itself matches, also include all its descendants
  for (const id of matchedIds) {
    const layer = layerMap.get(id);
    if (layer?.type === "group") {
      for (const candidate of layers) {
        let curr = candidate;
        const visited = new Set<string>();
        while (curr && curr.parentId) {
          if (visited.has(curr.parentId)) break;
          visited.add(curr.parentId);
          if (curr.parentId === id) {
            visibleIds.add(candidate.id);
            break;
          }
          curr = layerMap.get(curr.parentId)!;
        }
      }
    }
  }

  return layers.filter((l) => visibleIds.has(l.id));
}

export interface LayerTreeProps {
  searchQuery?: string;
}

export function LayerTree({ searchQuery = "" }: LayerTreeProps) {
  const scenes = useEditorStore((state) => state.scenes);
  const activeSceneId = useEditorStore((state) => state.activeSceneId);
  const selectedLayerIds = useEditorStore((state) => state.selectedLayerIds);
  const selectLayers = useEditorStore((state) => state.selectLayers);
  const updateLayer = useEditorStore((state) => state.updateLayer);
  const toggleLayerVisibility = useEditorStore((state) => state.toggleLayerVisibility);
  const toggleLayerLock = useEditorStore((state) => state.toggleLayerLock);
  const reparentLayer = useEditorStore((state) => state.reparentLayer);
  const reorderLayers = useEditorStore((state) => state.reorderLayers);
  const groupSelectedLayers = useEditorStore((state) => state.groupSelectedLayers);
  const ungroupSelectedLayers = useEditorStore((state) => state.ungroupSelectedLayers);
  const bringLayerForward = useEditorStore((state) => state.bringLayerForward);
  const sendLayerBackward = useEditorStore((state) => state.sendLayerBackward);
  const bringLayerToFront = useEditorStore((state) => state.bringLayerToFront);
  const sendLayerToBack = useEditorStore((state) => state.sendLayerToBack);
  const duplicateSelectedLayers = useEditorStore((state) => state.duplicateSelectedLayers);
  const removeLayers = useEditorStore((state) => state.removeLayers);

  const activeScene = useMemo(
    () => scenes.find((s) => s.id === activeSceneId),
    [scenes, activeSceneId],
  );

  const layers = activeScene?.layers || [];
  const animationBlocks = activeScene?.animationBlocks || [];
  const filteredLayers = useMemo(
    () => filterLayersBySearch(layers, searchQuery),
    [layers, searchQuery],
  );
  const flattenedList = useMemo(() => getFlattenedTree(filteredLayers), [filteredLayers]);

  const listContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll current selection into view when selection or search query changes
  useEffect(() => {
    if (selectedLayerIds.length > 0) {
      const targetId = selectedLayerIds[0];
      const el = document.getElementById(`layer-row-${targetId}`);
      if (el) {
        el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [selectedLayerIds, searchQuery]);

  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Modals for saving user presets
  const [saveTemplateModalOpen, setSaveTemplateModalOpen] = useState(false);
  const [saveAnimModalOpen, setSaveAnimModalOpen] = useState(false);

  // Selected layers objects
  const selectedLayers = useMemo(
    () => layers.filter((l) => selectedLayerIds.includes(l.id)),
    [layers, selectedLayerIds],
  );

  const hasGroupSelected = useMemo(
    () => selectedLayers.some((l) => l.type === "group"),
    [selectedLayers],
  );

  // Animation blocks belonging to selected layers
  const selectedLayerBlocks = useMemo(
    () => animationBlocks.filter((b) => b.layerId && selectedLayerIds.includes(b.layerId)),
    [animationBlocks, selectedLayerIds],
  );

  // Drag-and-drop state
  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    targetLayerId: string;
    position: "before" | "after" | "into";
  } | null>(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  if (!layers.length) {
    return (
      <div className="panel-empty" data-testid="text-empty-layers">
        No layers.
      </div>
    );
  }

  const handleRowClick = (e: React.MouseEvent, layer: Layer, index: number) => {
    e.stopPropagation();

    if (e.shiftKey && lastClickedId) {
      const lastIndex = flattenedList.findIndex((item) => item.layer.id === lastClickedId);
      const currentIndex = index;
      if (lastIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        const rangeIds = flattenedList.slice(start, end + 1).map((item) => item.layer.id);
        selectLayers(Array.from(new Set([...selectedLayerIds, ...rangeIds])));
        return;
      }
    }

    if (e.metaKey || e.ctrlKey) {
      if (selectedLayerIds.includes(layer.id)) {
        selectLayers(selectedLayerIds.filter((id) => id !== layer.id));
      } else {
        selectLayers([...selectedLayerIds, layer.id]);
      }
      setLastClickedId(layer.id);
      return;
    }

    // Normal single click
    selectLayers([layer.id]);
    setLastClickedId(layer.id);
  };

  const handleDoubleClick = (e: React.MouseEvent, layer: Layer) => {
    e.stopPropagation();
    setEditingId(layer.id);
    setEditName(layer.name);
  };

  const commitRename = () => {
    if (editingId) {
      const trimmed = editName.trim();
      if (trimmed) {
        updateLayer(editingId, { name: trimmed });
      }
      setEditingId(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitRename();
    } else if (e.key === "Escape") {
      setEditingId(null);
    }
  };

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, layer: Layer) => {
    if (editingId === layer.id) {
      e.preventDefault();
      return;
    }
    setDraggedLayerId(layer.id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", layer.id);
  };

  const handleDragOver = (e: React.DragEvent, targetLayer: Layer) => {
    e.preventDefault();
    if (!draggedLayerId || draggedLayerId === targetLayer.id) {
      return;
    }

    // Check if dragging onto descendant
    if (isDescendant(layers, targetLayer.id, draggedLayerId)) {
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const height = rect.height;

    if (targetLayer.type === "group" && offsetY > height * 0.25 && offsetY < height * 0.75) {
      setDropTarget({ targetLayerId: targetLayer.id, position: "into" });
    } else if (offsetY < height * 0.5) {
      setDropTarget({ targetLayerId: targetLayer.id, position: "before" });
    } else {
      setDropTarget({ targetLayerId: targetLayer.id, position: "after" });
    }
  };

  const handleDragLeave = () => {
    // Only clear if leaving container
  };

  const handleDrop = (e: React.DragEvent, targetLayer: Layer) => {
    e.preventDefault();
    if (!draggedLayerId || draggedLayerId === targetLayer.id || !dropTarget) {
      setDraggedLayerId(null);
      setDropTarget(null);
      return;
    }

    const draggedLayer = layers.find((l) => l.id === draggedLayerId);
    if (!draggedLayer) {
      setDraggedLayerId(null);
      setDropTarget(null);
      return;
    }

    if (dropTarget.position === "into") {
      reparentLayer(draggedLayerId, targetLayer.id);
    } else {
      // Reorder relative to target
      const targetParentId = targetLayer.parentId;
      const withoutDragged = layers.filter((l) => l.id !== draggedLayerId);
      const targetIdx = withoutDragged.findIndex((l) => l.id === targetLayer.id);

      const insertIdx = dropTarget.position === "before" ? targetIdx : targetIdx + 1;
      const updatedDragged = { ...draggedLayer, parentId: targetParentId };

      const newLayers = [
        ...withoutDragged.slice(0, insertIdx),
        updatedDragged,
        ...withoutDragged.slice(insertIdx),
      ];

      reorderLayers(activeSceneId, newLayers);
    }

    setDraggedLayerId(null);
    setDropTarget(null);
  };

  const handleDragEnd = () => {
    setDraggedLayerId(null);
    setDropTarget(null);
  };

  const getLayerIcon = (layer: Layer) => {
    switch (layer.type) {
      case "group":
        return <Folder size={11} className="layer-type-icon group-icon" />;
      case "shape":
        if (layer.shape?.kind === "ellipse") {
          return <Circle size={11} className="layer-type-icon" />;
        }
        if (layer.shape?.kind === "path" || layer.shape?.path) {
          return <Spline size={11} className="layer-type-icon text-[#38bdf8]" />;
        }
        return <Square size={11} className="layer-type-icon" />;
      case "text":
        return <Type size={11} className="layer-type-icon" />;
      case "image":
        return <ImageIcon size={11} className="layer-type-icon" />;
      default:
        return <Square size={11} className="layer-type-icon" />;
    }
  };

  return (
    <div
      className="layer-tree-container flex flex-col h-full"
      data-testid="layer-tree"
      onDragOver={(e) => e.preventDefault()}
      onDragEnd={handleDragEnd}
    >
      {/* Selection Action Bar */}
      {selectedLayerIds.length > 0 && (
        <div
          className="flex items-center justify-between px-2 py-1 bg-[#16181f] border-b border-[#242732] text-[9.5px]"
          data-testid="layer-tree-selection-bar"
        >
          <span className="text-[#8c919d] font-medium">
            {selectedLayerIds.length} selected
          </span>
          <div className="flex items-center gap-1">
            {hasGroupSelected && (
              <button
                type="button"
                data-testid="button-ungroup-selection"
                title="Ungroup selected (⌘⇧G)"
                onClick={() => ungroupSelectedLayers()}
                className="px-1.5 py-0.5 rounded bg-[#202228] hover:bg-[#2a2d36] text-[#cfd3dc] border border-[#2a2d36] flex items-center gap-1 text-[8.5px] font-medium transition-colors"
              >
                <Ungroup size={9} strokeWidth={2} />
                <span>Ungroup</span>
              </button>
            )}
            <button
              type="button"
              data-testid="button-save-selection-preset"
              title="Save selected layers and animations as a reusable preset template"
              onClick={() => setSaveTemplateModalOpen(true)}
              className="px-1.5 py-0.5 rounded bg-[#0284c7]/20 hover:bg-[#0284c7]/30 text-[#38bdf8] border border-[#0284c7]/40 flex items-center gap-1 text-[8.5px] font-medium transition-colors"
            >
              <LayoutTemplate size={9} strokeWidth={2} />
              <span>Save as Preset</span>
            </button>
          </div>
        </div>
      )}

      <div ref={listContainerRef} className="flex-1 overflow-y-auto">
        {flattenedList.length === 0 ? (
          searchQuery.trim() ? (
            <div
              className="p-6 text-center text-[#81838a] text-[10.5px] flex flex-col items-center justify-center gap-2"
              data-testid="layer-search-empty"
            >
              <Search size={16} className="text-[#555a64]" />
              <span>No layers matching &ldquo;{searchQuery.trim()}&rdquo;</span>
            </div>
          ) : (
            <div
              className="p-6 text-center text-[#64748b] text-[10px] flex flex-col items-center justify-center gap-1.5"
              data-testid="layer-tree-empty"
            >
              <span>No layers in this scene</span>
              <span className="text-[9px] text-[#475569]">Click + above or press T / R to add</span>
            </div>
          )
        ) : (
          flattenedList.map(({ layer, depth }, index) => {
            const isSelected = selectedLayerIds.includes(layer.id);
            const isEditing = editingId === layer.id;
            const isDragTarget = dropTarget?.targetLayerId === layer.id;
            const layerHasAnimations = animationBlocks.some((b) => b.layerId === layer.id);

            return (
              <ContextMenu key={layer.id}>
                <ContextMenuTrigger asChild>
                  <div
                    id={`layer-row-${layer.id}`}
                    className={`layer-tree-row ${isSelected ? "selected" : ""} ${
                      isDragTarget ? `drop-${dropTarget.position}` : ""
                    } ${!layer.visible ? "is-hidden" : ""} ${layer.locked ? "is-locked" : ""}`}
                    style={{ paddingLeft: `${8 + depth * 14}px` }}
                    data-testid={`layer-row-${layer.id}`}
                    draggable={!isEditing}
                  onClick={(e) => handleRowClick(e, layer, index)}
                  onDoubleClick={(e) => handleDoubleClick(e, layer)}
                  onDragStart={(e) => handleDragStart(e, layer)}
                  onDragOver={(e) => handleDragOver(e, layer)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, layer)}
                  onContextMenu={() => {
                    if (!isSelected) {
                      selectLayers([layer.id]);
                    }
                  }}
                >
                  {/* Depth line or branch indicator */}
                  {depth > 0 && (
                    <span className="layer-indent-guide" style={{ left: `${depth * 14}px` }} />
                  )}

                  {/* Type Icon */}
                  <span className="layer-icon-wrapper">{getLayerIcon(layer)}</span>

                  {/* Layer Name / Inline Input */}
                  <div className="layer-name-cell">
                    {isEditing ? (
                      <input
                        ref={inputRef}
                        className="layer-rename-input"
                        data-testid={`layer-rename-input-${layer.id}`}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={handleKeyDown}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span
                        className="layer-name-text"
                        data-testid={`layer-name-${layer.id}`}
                        title={`${layer.name} (Double-click to rename)`}
                      >
                        {layer.name}
                      </span>
                    )}
                  </div>

                  {/* Actions: Visibility & Lock */}
                  <div className="layer-row-actions">
                    <button
                      type="button"
                      className={`layer-action-btn ${!layer.visible ? "active-dim" : ""}`}
                      data-testid={`button-toggle-visibility-${layer.id}`}
                      title={layer.visible ? "Hide layer" : "Show layer"}
                      aria-label={layer.visible ? "Hide layer" : "Show layer"}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLayerVisibility(layer.id);
                      }}
                    >
                      {layer.visible ? (
                        <Eye size={11} strokeWidth={1.5} />
                      ) : (
                        <EyeOff size={11} strokeWidth={1.5} />
                      )}
                    </button>
                    <button
                      type="button"
                      className={`layer-action-btn ${layer.locked ? "active-dim" : ""}`}
                      data-testid={`button-toggle-lock-${layer.id}`}
                      title={layer.locked ? "Unlock layer" : "Lock layer"}
                      aria-label={layer.locked ? "Unlock layer" : "Lock layer"}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLayerLock(layer.id);
                      }}
                    >
                      {layer.locked ? (
                        <Lock size={11} strokeWidth={1.5} />
                      ) : (
                        <Unlock size={11} strokeWidth={1.5} />
                      )}
                    </button>
                  </div>
                </div>
              </ContextMenuTrigger>

              <ContextMenuContent
                className="bg-[#181a20] border-[#292d37] text-[#cfd3dc] text-[9.5px] min-w-[170px]"
                data-testid={`context-menu-layer-${layer.id}`}
              >
                <ContextMenuItem
                  className="cursor-pointer hover:bg-[#222631] px-2 py-1.5 flex items-center gap-1.5 text-white"
                  onClick={() => setSaveTemplateModalOpen(true)}
                  data-testid="context-menu-save-scene-template"
                >
                  <LayoutTemplate size={11} className="text-[#38bdf8]" />
                  <span>Save as preset template...</span>
                </ContextMenuItem>

                {layerHasAnimations && (
                  <ContextMenuItem
                    className="cursor-pointer hover:bg-[#222631] px-2 py-1.5 flex items-center gap-1.5 text-[#c4b5fd]"
                    onClick={() => setSaveAnimModalOpen(true)}
                    data-testid="context-menu-save-anim-preset"
                  >
                    <Sparkles size={11} className="text-[#a78bfa]" />
                    <span>Save animation preset...</span>
                  </ContextMenuItem>
                )}

                <ContextMenuSeparator className="bg-[#262a34]" />

                <ContextMenuItem
                  className="cursor-pointer hover:bg-[#222631] px-2 py-1 flex items-center gap-1.5"
                  onClick={() => duplicateSelectedLayers()}
                  data-testid="context-menu-duplicate"
                >
                  <Copy size={11} />
                  <span>Duplicate</span>
                </ContextMenuItem>

                <ContextMenuItem
                  className="cursor-pointer hover:bg-[#222631] px-2 py-1 flex items-center gap-1.5"
                  onClick={() => groupSelectedLayers()}
                  data-testid="context-menu-group"
                >
                  <FolderPlus size={11} />
                  <span>Group selected</span>
                </ContextMenuItem>

                {(layer.type === "group" || hasGroupSelected) && (
                  <ContextMenuItem
                    className="cursor-pointer hover:bg-[#222631] px-2 py-1 flex items-center justify-between gap-1.5"
                    onClick={() => ungroupSelectedLayers()}
                    data-testid="context-menu-ungroup"
                  >
                    <div className="flex items-center gap-1.5">
                      <Ungroup size={11} />
                      <span>Ungroup</span>
                    </div>
                    <span className="text-[8.5px] text-[#6c6e75]">⌘⇧G</span>
                  </ContextMenuItem>
                )}

                <ContextMenuSeparator className="bg-[#262a34]" />

                <ContextMenuItem
                  className="cursor-pointer hover:bg-[#222631] px-2 py-1 flex items-center justify-between gap-1.5"
                  onClick={() => bringLayerForward()}
                  data-testid="context-menu-bring-forward"
                >
                  <div className="flex items-center gap-1.5">
                    <ArrowUp size={11} />
                    <span>Bring Forward</span>
                  </div>
                  <span className="text-[8.5px] text-[#6c6e75]">]</span>
                </ContextMenuItem>

                <ContextMenuItem
                  className="cursor-pointer hover:bg-[#222631] px-2 py-1 flex items-center justify-between gap-1.5"
                  onClick={() => sendLayerBackward()}
                  data-testid="context-menu-send-backward"
                >
                  <div className="flex items-center gap-1.5">
                    <ArrowDown size={11} />
                    <span>Send Backward</span>
                  </div>
                  <span className="text-[8.5px] text-[#6c6e75]">[</span>
                </ContextMenuItem>

                <ContextMenuItem
                  className="cursor-pointer hover:bg-[#222631] px-2 py-1 flex items-center justify-between gap-1.5"
                  onClick={() => bringLayerToFront()}
                  data-testid="context-menu-bring-to-front"
                >
                  <div className="flex items-center gap-1.5">
                    <ChevronsUp size={11} />
                    <span>Bring to Front</span>
                  </div>
                  <span className="text-[8.5px] text-[#6c6e75]">⌘]</span>
                </ContextMenuItem>

                <ContextMenuItem
                  className="cursor-pointer hover:bg-[#222631] px-2 py-1 flex items-center justify-between gap-1.5"
                  onClick={() => sendLayerToBack()}
                  data-testid="context-menu-send-to-back"
                >
                  <div className="flex items-center gap-1.5">
                    <ChevronsDown size={11} />
                    <span>Send to Back</span>
                  </div>
                  <span className="text-[8.5px] text-[#6c6e75]">⌘[</span>
                </ContextMenuItem>

                <ContextMenuSeparator className="bg-[#262a34]" />

                <ContextMenuItem
                  className="cursor-pointer hover:bg-[#222631] px-2 py-1 flex items-center gap-1.5 text-[#f87171]"
                  onClick={() => removeLayers(selectedLayerIds)}
                  data-testid="context-menu-delete"
                >
                  <Trash2 size={11} />
                  <span>Delete layer</span>
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        }))}
      </div>

      {/* Save Scene Template Modal */}
      <SaveSceneTemplateModal
        open={saveTemplateModalOpen}
        onOpenChange={setSaveTemplateModalOpen}
        layers={selectedLayers.length > 0 ? selectedLayers : layers}
        animationBlocks={
          selectedLayers.length > 0 ? selectedLayerBlocks : animationBlocks
        }
        camera={activeScene?.camera}
        durationFrames={activeScene?.durationFrames}
        fps={activeScene?.fps}
      />

      {/* Save Animation Preset Modal from Selection */}
      <SaveAnimationPresetModal
        open={saveAnimModalOpen}
        onOpenChange={setSaveAnimModalOpen}
        blocks={selectedLayerBlocks}
        defaultName={`${selectedLayers[0]?.name || "Layer"} Animation`}
      />
    </div>
  );
}
