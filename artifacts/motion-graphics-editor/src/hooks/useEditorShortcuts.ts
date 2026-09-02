import { useEffect } from "react";
import { useEditorStore } from "../store/editor-store";
import type { Layer } from "../store/editor-store";

// Session-level in-memory clipboard for layers
let inMemoryClipboard: Layer[] = [];

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target.isContentEditable ||
    target.closest("[contenteditable='true']") !== null
  );
}

export function useEditorShortcuts() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
      const key = e.key;

      const store = useEditorStore.getState();
      const { selectedLayerIds, scenes, activeSceneId } = store;
      const currentScene = scenes.find((s) => s.id === activeSceneId);

      // Undo / Redo
      if (isCmdOrCtrl && (key === "z" || key === "Z")) {
        e.preventDefault();
        const temporal = useEditorStore.temporal.getState();
        if (e.shiftKey) {
          temporal.redo();
        } else {
          temporal.undo();
        }
        return;
      }

      if (isCmdOrCtrl && (key === "y" || key === "Y")) {
        e.preventDefault();
        useEditorStore.temporal.getState().redo();
        return;
      }

      // Group Selection (Cmd/Ctrl + G)
      if (isCmdOrCtrl && (key === "g" || key === "G")) {
        e.preventDefault();
        store.groupSelectedLayers();
        return;
      }

      // Duplicate (Cmd/Ctrl + D)
      if (isCmdOrCtrl && (key === "d" || key === "D")) {
        e.preventDefault();
        store.duplicateSelectedLayers();
        return;
      }

      // Copy (Cmd/Ctrl + C)
      if (isCmdOrCtrl && (key === "c" || key === "C")) {
        if (!currentScene || selectedLayerIds.length === 0) return;
        e.preventDefault();

        // Get all selected layers and their recursive children if any are groups
        const selectedSet = new Set(selectedLayerIds);
        let expanded = true;
        while (expanded) {
          expanded = false;
          for (const l of currentScene.layers) {
            if (l.parentId && selectedSet.has(l.parentId) && !selectedSet.has(l.id)) {
              selectedSet.add(l.id);
              expanded = true;
            }
          }
        }

        const layersToCopy = currentScene.layers.filter((l) => selectedSet.has(l.id));
        inMemoryClipboard = JSON.parse(JSON.stringify(layersToCopy));
        return;
      }

      // Paste (Cmd/Ctrl + V)
      if (isCmdOrCtrl && (key === "v" || key === "V")) {
        if (inMemoryClipboard.length === 0) return;
        e.preventDefault();
        store.pasteLayers(inMemoryClipboard);
        return;
      }

      // Delete / Backspace
      if (key === "Delete" || key === "Backspace") {
        if (selectedLayerIds.length === 0) return;
        e.preventDefault();
        store.removeLayers(selectedLayerIds);
        return;
      }

      // Nudge with Arrow keys
      if (
        key === "ArrowUp" ||
        key === "ArrowDown" ||
        key === "ArrowLeft" ||
        key === "ArrowRight"
      ) {
        if (selectedLayerIds.length === 0) return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        let dx = 0;
        let dy = 0;
        if (key === "ArrowUp") dy = -step;
        if (key === "ArrowDown") dy = step;
        if (key === "ArrowLeft") dx = -step;
        if (key === "ArrowRight") dx = step;

        store.nudgeSelectedLayers(dx, dy);
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);
}
