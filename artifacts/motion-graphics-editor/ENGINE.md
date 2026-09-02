# Motion Graphics Editor — Engine & Document Model

## Document Data Model

The editor state is managed by a centralized Zustand store (`artifacts/motion-graphics-editor/src/store/editor-store.ts`) conforming to the following interfaces:

- **`EditorDocument`**: Root document containing `projectName`, `aspectRatio` ("16:9" | "9:16" | "1:1"), an array of `scenes`, `activeSceneId`, and ephemeral `selectedLayerIds`.
- **`Scene`**: Holds scene metadata (`id`, `name`, `durationFrames`, `fps`), an array of `layers`, and a 3D `camera` configuration (`x`, `y`, `z`, `fov`, `focusDistance`). Default canvas is seeded at 1920x1080 resolution with camera at `z: 0`.
- **`Layer`**: Canvas entity with `id`, `parentId` (for nested grouping), `type` ("shape" | "text" | "image" | "group"), `name`, `transform` (`x`, `y`, `width`, `height`, `rotation`, `depth`), `opacity`, `visible`, `locked`, and type-discriminated payloads (`shape`, `text`, `image`).
- **Actions**:
  - `addLayer(sceneId?, layer?)`: Adds a new layer and selects it.
  - `updateLayer(id, partial)`: Applies granular property and transform changes.
  - `removeLayer(id)`: Removes a layer and deselects it.
  - `selectLayers(ids)`: Updates selection without recording history steps.
  - `setActiveScene(id)`: Switches active scene.
  - `addScene(scene?)`: Creates and navigates to a new scene.
  - `moveLayerDepth(id, delta)`: Shifts layer depth along the 3D Z-axis.

## Undo/Redo & Temporal History

- **Temporal Middleware**: Implemented via `zundo` wrapping the Zustand store with a 100-step capacity limit (`limit: 100`).
- **Transient Selection Excluded**: `partialize` tracks only document structure (`projectName`, `aspectRatio`, `scenes`, `activeSceneId`) and excludes `selectedLayerIds` so selection changes do not dirty the undo history.
- **Debounced Mutation Tracking**: State equality checking on the serialized document snapshot prevents intermediate micro-steps (such as continuous slider dragging or dragging layers across pixels) from polluting the undo stack.
- **Hook Access**: `useEditorHistory()` exposes `{ undo, redo, canUndo, canRedo, clear, pastCount, futureCount }` derived from the store's temporal state.

## Local Persistence (IndexedDB)

- **Storage Module**: `artifacts/motion-graphics-editor/src/persistence/local-store.ts` via `idb`.
- **Stores**:
  - `documents`: Keyed by `projectName` storing the latest active document snapshot.
  - `history`: Timestamp-keyed rolling version history indexed by `projectName`, retaining the last 20 saves.
- **Autosave Pipeline**: Subscribed to store changes, excluding `selectedLayerIds`, debounced 2 seconds after the last mutation.
- **Hydration**: On application bootstrap in `main.tsx`, attempts `loadDocument()` to rehydrate state into `useEditorStore` before render.

## Canvas Renderer, Pan/Zoom & Selection Engine

- **Canvas Stage**: `artifacts/motion-graphics-editor/src/canvas/CanvasStage.tsx`.
- **Aspect Ratio & DPR**: Dynamically scales scene canvas based on active aspect ratio (16:9, 9:16, 1:1) and renders with `window.devicePixelRatio` for high-density displays.
- **Layer Rendering Engine**:
  - Renders visible layers in ascending array order with individual opacity, center-pivot rotation (`ctx.rotate`), and bounding transform.
  - Supports `rect` (with optional corner radius), `ellipse`, `text` (font, size, alignment), and `image` (cached via `HTMLImageElement` memory map).
- **Execution Loop**: Only runs a `requestAnimationFrame` loop when `playing === true`; otherwise redraws reactively upon store mutation to conserve CPU at idle.
- **Viewport Navigation**: Supports Ctrl/Cmd + wheel zooming, zoom level cycling on the `.zoom-pill`, and canvas panning with the Hand tool.
- **Selection & Hit-Testing**: Top-down layer hit-testing with inverse rotation coordinate projection to accurately detect clicks on rotated layers.
- **Smart-Guide Snapping (`snapping.ts`)**:
  - Computes edge (left, right, top, bottom) and center candidates across all other scene layers and canvas boundaries.
  - Snaps within a 6px canvas threshold (scaled inversely by zoom) and detects horizontal equal-spacing intervals with visual span indicators.
  - Active guide lines are rendered dynamically in canvas space during drag operations and cleared on pointer release.
- **Bounding Box & 8-Handle Resizing**: Interactive bounding box with corner and edge handles (`nw`, `n`, `ne`, `e`, `se`, `s`, `sw`, `w`), respecting layer rotation and supporting aspect-ratio preservation with Shift key.
- **Direct Creation Tools**:
  - **Shape Tool**: Direct click-to-place default rectangle layer centered at pointer coordinates.
  - **Text Tool**: Direct click-to-place text layer with an inline `textarea` overlay auto-focused for immediate editing, committing back to layer content on blur or Enter.

## Layer Tree & Hierarchy Engine

- **Layer Tree View**: `artifacts/motion-graphics-editor/src/components/LayerTree.tsx` mounted inside `LeftPanel`.
- **Hierarchical Nesting**: Resolves parent-child relationships via `parentId` with progressive indentation guides.
- **Direct Row Interactions**:
  - **Inline Renaming**: Double-clicking a layer name mounts an auto-focused inline input; Enter or blur commits name change, Escape cancels.
  - **Visibility & Lock Toggles**: Direct toggle buttons with icons (`Eye`/`EyeOff`, `Lock`/`Unlock`) modifying `visible` and `locked` state.
  - **Selection Sync**: Single-click selects layer; Shift-click selects contiguous range in flattened tree order; Cmd/Ctrl-click toggles selection membership.
- **Drag-to-Reorder & Reparenting**:
  - Dragging a row over another calculates drop zone: top/bottom 50% reorders layer order in `scene.layers` (controlling canvas draw order); dropping into a group highlights and reparents the layer with cycle-prevention checks.

## Grouping & Global Keyboard Shortcuts

- **Group Selection (Cmd/Ctrl + G)**:
  - Automatically calculates the bounding box enclosing all currently selected layers (`minX`, `minY`, `width`, `height`).
  - Creates a new `group` layer and reparents selected layers beneath it, keeping transforms in absolute canvas coordinates.
- **Shortcut Pipeline (`useEditorShortcuts.ts`)**:
  - **Delete/Backspace**: Removes selected layers and any descendant children.
  - **Arrow Keys**: Nudges selected layers by 1px (10px when Shift is held).
  - **Duplicate (Cmd/Ctrl + D)**: Clones selected layers with a 10px offset and selects the duplicates.
  - **Copy / Paste (Cmd/Ctrl + C, Cmd/Ctrl + V)**: In-memory session clipboard copying layers (including group hierarchies) and pasting into the active scene with a +20px offset.
  - **Undo / Redo (Cmd/Ctrl + Z, Cmd/Ctrl + Shift + Z / Cmd/Ctrl + Y)**: Dispatches temporal undo/redo actions.
  - **Input Guarding**: Automatically ignores editor shortcuts when focus is inside text inputs, textareas, selects, or `contentEditable` elements.

## Canvas Viewport, Alignment & Zoom Engine

- **Viewport Centering & Coordinate Precision**:
  - Removed legacy fixed CSS dimension overrides on `.canvas` in favor of strict pixel-accurate display bounds (`displayW`, `displayH`).
  - Native canvas resolution buffers (`bufferW = displayW * dpr`, `bufferH = displayH * dpr`) dynamically scale coordinates for high-DPI displays.
  - Screen-to-canvas coordinate mapping matches `(clientX - rect.left) / scaleFactor` across all zoom levels, pans, and aspect ratios (16:9, 9:16, 1:1).
- **Zoom Dropdown Menu**:
  - Floating zoom pill displays active percentage (`ZoomIn` icon, value, `ChevronDown`).
  - Dropdown options: "Fit Screen (100%)", granular presets (25%, 50%, 75%, 100%, 125%, 150%, 200%, 300%, 400%), step zoom buttons (+25% / -25%), and "Reset Pan".
  - Dismisses on click-outside and marks active preset with a check indicator.
- **Scroll-to-Zoom**:
  - Natural wheel scrolling over the canvas stage dynamically zooms in (scroll up) and out (scroll down) clamped between 10% and 500%.
  - Holding Shift/Alt or activating the Hand tool smoothly pans the canvas viewport (`pan.x`, `pan.y`).


