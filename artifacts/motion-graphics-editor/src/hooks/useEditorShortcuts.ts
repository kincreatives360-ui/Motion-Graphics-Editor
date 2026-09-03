import { useEffect } from "react";
import { useEditorStore, useEditorUIStore } from "../store/editor-store";
import type { Layer } from "../store/editor-store";
import { isSvgContent, parseSvgToLayers, importImageFile } from "../lib/svg-importer";

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
    let lastPasteTimestamp = 0;

    const tryPasteSvgOrImage = async (clipboardData?: DataTransfer | null): Promise<boolean> => {
      // 1. Check DataTransfer if available (synchronous and highest fidelity)
      if (clipboardData) {
        const text =
          clipboardData.getData("text/plain") ||
          clipboardData.getData("image/svg+xml") ||
          "";

        if (text && isSvgContent(text)) {
          const parsed = parseSvgToLayers(text);
          if (parsed && parsed.layers.length > 0) {
            useEditorStore.getState().addImportedLayers(parsed.layers, [parsed.groupId]);
            return true;
          }
        }

        // Try image files from clipboard
        if (clipboardData.files && clipboardData.files.length > 0) {
          const file = clipboardData.files[0];
          if (file.type.startsWith("image/") || file.name.endsWith(".svg")) {
            await importImageFile(file);
            return true;
          }
        }
      }

      // 2. Fall back to navigator.clipboard.readText() if available
      try {
        if (navigator.clipboard && typeof navigator.clipboard.readText === "function") {
          const text = await navigator.clipboard.readText();
          if (text && isSvgContent(text)) {
            const parsed = parseSvgToLayers(text);
            if (parsed && parsed.layers.length > 0) {
              useEditorStore.getState().addImportedLayers(parsed.layers, [parsed.groupId]);
              return true;
            }
          }
        }
      } catch {
        // Clipboard read permission might not be granted in sandbox
      }

      return false;
    };

    const handlePaste = async (e: ClipboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const now = Date.now();
      if (now - lastPasteTimestamp < 300) return;

      const handledSvg = await tryPasteSvgOrImage(e.clipboardData);
      if (handledSvg) {
        e.preventDefault();
        lastPasteTimestamp = Date.now();
        return;
      }

      if (inMemoryClipboard.length > 0) {
        e.preventDefault();
        lastPasteTimestamp = Date.now();
        useEditorStore.getState().pasteLayers(inMemoryClipboard);
      }
    };

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
        e.preventDefault();
        const now = Date.now();
        if (now - lastPasteTimestamp < 300) return;
        lastPasteTimestamp = now;

        (async () => {
          const handledSvg = await tryPasteSvgOrImage(null);
          if (!handledSvg) {
            // Fall through to in-app layer clipboard
            if (inMemoryClipboard.length > 0) {
              store.pasteLayers(inMemoryClipboard);
            }
          }
        })();
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

      // Tool Switching Shortcuts (Select: V, Hand: H, Tilt: Y, Move: G, Scissors: C)
      if (!isCmdOrCtrl && !e.altKey && !e.shiftKey) {
        const uiStore = useEditorUIStore.getState();
        if (key === "v" || key === "V") {
          e.preventDefault();
          uiStore.setActiveTool("scene");
        } else if (key === "h" || key === "H") {
          e.preventDefault();
          uiStore.setActiveTool("hand");
        } else if (key === "y" || key === "Y") {
          e.preventDefault();
          uiStore.setActiveTool("tilt");
        } else if (key === "g" || key === "G") {
          e.preventDefault();
          uiStore.setActiveTool("move");
        } else if (key === "c" || key === "C") {
          e.preventDefault();
          uiStore.setActiveTool("scissors");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("paste", handlePaste);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("paste", handlePaste);
    };
  }, []);
}
