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

      // Group (Cmd/Ctrl + G) vs Ungroup (Cmd/Ctrl + Shift + G)
      if (isCmdOrCtrl && (key === "g" || key === "G")) {
        e.preventDefault();
        if (e.shiftKey) {
          store.ungroupSelectedLayers();
        } else {
          store.groupSelectedLayers();
        }
        return;
      }

      // Restack: Bring Forward (]), Send Backward ([), Bring to Front (Cmd/Ctrl + ]), Send to Back (Cmd/Ctrl + [)
      if (key === "]" || key === "}") {
        e.preventDefault();
        if (isCmdOrCtrl) {
          store.bringLayerToFront();
        } else {
          store.bringLayerForward();
        }
        return;
      }
      if (key === "[" || key === "{") {
        e.preventDefault();
        if (isCmdOrCtrl) {
          store.sendLayerToBack();
        } else {
          store.sendLayerBackward();
        }
        return;
      }

      // Align: Alt/Option + A (Left), D (Right), W (Top), S (Bottom), H (Center H), V (Center V)
      if (e.altKey && !isCmdOrCtrl) {
        const lowerKey = key.toLowerCase();
        const isCode = (codeName: string) => e.code === codeName;
        if (lowerKey === "a" || isCode("KeyA")) {
          e.preventDefault();
          store.alignLeft();
          return;
        }
        if (lowerKey === "d" || isCode("KeyD")) {
          e.preventDefault();
          store.alignRight();
          return;
        }
        if (lowerKey === "w" || isCode("KeyW")) {
          e.preventDefault();
          store.alignTop();
          return;
        }
        if (lowerKey === "s" || isCode("KeyS")) {
          e.preventDefault();
          store.alignBottom();
          return;
        }
        if (lowerKey === "h" || isCode("KeyH")) {
          e.preventDefault();
          store.alignCenterHorizontal();
          return;
        }
        if (lowerKey === "v" || isCode("KeyV")) {
          e.preventDefault();
          store.alignCenterVertical();
          return;
        }
      }

      // Flip: Shift + H (Horizontal), Shift + V (Vertical)
      if (e.shiftKey && !isCmdOrCtrl && !e.altKey) {
        if (key === "H" || e.code === "KeyH") {
          e.preventDefault();
          store.flipHorizontal();
          return;
        }
        if (key === "V" || e.code === "KeyV") {
          e.preventDefault();
          store.flipVertical();
          return;
        }
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

      // Global Deselect (Escape)
      if (key === "Escape") {
        const ui = useEditorUIStore.getState();
        if (selectedLayerIds.length > 0 || ui.isCameraSelected) {
          e.preventDefault();
          store.selectLayers([]);
          ui.setIsCameraSelected(false);
          return;
        }
      }

      // Select All in Scene (Cmd/Ctrl + A)
      if (isCmdOrCtrl && !e.shiftKey && !e.altKey && (key === "a" || key === "A" || e.code === "KeyA")) {
        e.preventDefault();
        if (currentScene) {
          const topLevelIds = currentScene.layers
            .filter((l) => !l.parentId)
            .map((l) => l.id);
          store.selectLayers(topLevelIds);
        }
        return;
      }

      // Hide / Show Selected Layers (Cmd/Ctrl + Shift + H)
      if (isCmdOrCtrl && e.shiftKey && !e.altKey && (key === "h" || key === "H" || e.code === "KeyH")) {
        e.preventDefault();
        store.toggleSelectedLayersVisibility();
        return;
      }

      // Split at Playhead (Cmd/Ctrl + B)
      if (isCmdOrCtrl && !e.shiftKey && !e.altKey && (key === "b" || key === "B" || e.code === "KeyB")) {
        e.preventDefault();
        store.splitBlocksAtPlayhead();
        return;
      }

      // Timeline Zoom In / Out (Cmd/Ctrl + '+', Cmd/Ctrl + '-')
      if (isCmdOrCtrl && (key === "+" || key === "=")) {
        e.preventDefault();
        useEditorUIStore.getState().setTimelineZoom((z) => Math.min(100, z + 10));
        return;
      }
      if (isCmdOrCtrl && (key === "-" || key === "_")) {
        e.preventDefault();
        useEditorUIStore.getState().setTimelineZoom((z) => Math.max(0, z - 10));
        return;
      }

      // Fit Timeline to View (Shift + Z)
      if (e.shiftKey && !isCmdOrCtrl && !e.altKey && (key === "Z" || e.code === "KeyZ")) {
        e.preventDefault();
        useEditorUIStore.getState().setTimelineZoom(50);
        return;
      }

      // Nudge with Arrow keys
      if (
        key === "ArrowUp" ||
        key === "ArrowDown" ||
        key === "ArrowLeft" ||
        key === "ArrowRight"
      ) {
        if (selectedLayerIds.length > 0) {
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

        // When no layers are selected, ArrowUp/ArrowDown navigates previous/next scene
        if (!isCmdOrCtrl && !e.altKey && (key === "ArrowUp" || key === "ArrowDown")) {
          e.preventDefault();
          const currIdx = scenes.findIndex((s) => s.id === activeSceneId);
          if (key === "ArrowUp" && currIdx > 0) {
            store.setActiveScene(scenes[currIdx - 1].id);
          } else if (key === "ArrowDown" && currIdx < scenes.length - 1) {
            store.setActiveScene(scenes[currIdx + 1].id);
          }
          return;
        }
        return;
      }

      // Shift shortcuts: Arrow (Shift + L), Animate Mode Toggle (Shift + A)
      if (e.shiftKey && !isCmdOrCtrl && !e.altKey) {
        const uiStore = useEditorUIStore.getState();
        if (key === "L" || e.code === "KeyL") {
          e.preventDefault();
          uiStore.setActiveTool("arrow");
          return;
        }
        if (key === "A" || e.code === "KeyA") {
          e.preventDefault();
          uiStore.toggleAnimateMode();
          return;
        }
      }

      // No-modifier shortcuts: Trim, Opacity, Home/End, Tools
      if (!isCmdOrCtrl && !e.altKey && !e.shiftKey) {
        const uiStore = useEditorUIStore.getState();

        // Opacity 10%–90% ('1'–'9') and 100% ('0' when layer selected)
        if (key >= "0" && key <= "9") {
          if (selectedLayerIds.length > 0) {
            e.preventDefault();
            const opacityVal = key === "0" ? 1.0 : parseInt(key, 10) / 10;
            store.setSelectedLayersOpacity(opacityVal);
            return;
          } else if (key === "0") {
            // '0' with no selection navigates to timeline start
            e.preventDefault();
            uiStore.setCurrentFrame(0);
            return;
          }
        }

        // Timeline Start / End
        if (key === "Home") {
          e.preventDefault();
          uiStore.setCurrentFrame(0);
          return;
        }
        if (key === "End") {
          e.preventDefault();
          const dur = currentScene?.durationFrames ?? 180;
          uiStore.setCurrentFrame(dur);
          return;
        }

        // Trim In (Q) / Trim Out (W)
        if (key === "q" || key === "Q") {
          e.preventDefault();
          store.trimInPointAtPlayhead();
          return;
        }
        if (key === "w" || key === "W") {
          e.preventDefault();
          store.trimOutPointAtPlayhead();
          return;
        }

        // Tool Switching Shortcuts (Select: V, Hand: H, Tilt: Y, Move: G, Scissors: C, Rect: R, Ellipse: O, Line: L, Text: T)
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
        } else if (key === "r" || key === "R") {
          e.preventDefault();
          uiStore.setActiveTool("rectangle");
        } else if (key === "o" || key === "O") {
          e.preventDefault();
          uiStore.setActiveTool("ellipse");
        } else if (key === "l" || key === "L") {
          e.preventDefault();
          uiStore.setActiveTool("line");
        } else if (key === "t" || key === "T") {
          e.preventDefault();
          uiStore.setActiveTool("text");
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
