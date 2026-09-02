import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Folder,
  Square,
  Circle,
  Type,
  Image as ImageIcon,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { useEditorStore } from "../store/editor-store";
import type { Layer } from "../store/editor-store";

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

  function traverse(parentId: string | null, depth: number) {
    const children = childrenMap.get(parentId) || [];
    for (const child of children) {
      result.push({ layer: child, depth });
      if (child.type === "group") {
        traverse(child.id, depth + 1);
      }
    }
  }

  traverse(null, 0);

  // If there are any unvisited layers (safety fallback), include them
  const visited = new Set(result.map((r) => r.layer.id));
  for (const l of layers) {
    if (!visited.has(l.id)) {
      result.push({ layer: l, depth: 0 });
    }
  }

  return result;
}

function isDescendant(layers: Layer[], potentialParentId: string, layerId: string): boolean {
  const map = new Map(layers.map((l) => [l.id, l]));
  let current = map.get(potentialParentId);
  while (current) {
    if (current.id === layerId) return true;
    current = current.parentId ? map.get(current.parentId) : undefined;
  }
  return false;
}

export function LayerTree() {
  const scenes = useEditorStore((state) => state.scenes);
  const activeSceneId = useEditorStore((state) => state.activeSceneId);
  const selectedLayerIds = useEditorStore((state) => state.selectedLayerIds);
  const selectLayers = useEditorStore((state) => state.selectLayers);
  const updateLayer = useEditorStore((state) => state.updateLayer);
  const toggleLayerVisibility = useEditorStore((state) => state.toggleLayerVisibility);
  const toggleLayerLock = useEditorStore((state) => state.toggleLayerLock);
  const reparentLayer = useEditorStore((state) => state.reparentLayer);
  const reorderLayers = useEditorStore((state) => state.reorderLayers);

  const activeScene = useMemo(
    () => scenes.find((s) => s.id === activeSceneId),
    [scenes, activeSceneId],
  );

  const layers = activeScene?.layers || [];
  const flattenedList = useMemo(() => getFlattenedTree(layers), [layers]);

  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

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
      className="layer-tree-container"
      data-testid="layer-tree"
      onDragOver={(e) => e.preventDefault()}
      onDragEnd={handleDragEnd}
    >
      {flattenedList.map(({ layer, depth }, index) => {
        const isSelected = selectedLayerIds.includes(layer.id);
        const isEditing = editingId === layer.id;
        const isDragTarget = dropTarget?.targetLayerId === layer.id;

        return (
          <div
            key={layer.id}
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
          >
            {/* Depth line or branch indicator */}
            {depth > 0 && <span className="layer-indent-guide" style={{ left: `${depth * 14}px` }} />}

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
                {layer.visible ? <Eye size={11} strokeWidth={1.5} /> : <EyeOff size={11} strokeWidth={1.5} />}
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
                {layer.locked ? <Lock size={11} strokeWidth={1.5} /> : <Unlock size={11} strokeWidth={1.5} />}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
