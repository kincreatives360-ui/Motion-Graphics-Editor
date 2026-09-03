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

## Inspector Architecture (Design & Animate Tabs)

- **Context-Aware Inspector Views**:
  - **No Layer Selected**: Displays the global Project Settings view (Project Name, Aspect Ratio switcher, Lens, and Background type/color controls).
  - **Single Layer Selected (`selectedLayerIds.length === 1`)**: Switches to a 2-tab view ("Design" and "Animate") using Radix UI Tabs primitives.
  - **Multiple Layers Selected (`selectedLayerIds.length > 1`)**: Displays a multi-layer summary panel with count and quick deselection controls.
- **Design Tab Controls**:
  - **Universal Transform**: X, Y, Width, Height, Rotation (numeric inputs with canvas-space coordinate mapping), Opacity slider (0-100%) and numerical input, and Depth (Z-depth plane numeric input wired to `transform.depth`).
  - **Shape Layers**: Shape kind toggle (Rectangle / Ellipse), fill color picker/hex text input, stroke color picker/hex input, and stroke width (px).
  - **Text Layers**: Text content `textarea`, font family select (Inter, Roboto, Space Grotesk, Playfair Display, JetBrains Mono, Arial, Georgia), font size numeric input, color picker, and text alignment buttons (Left, Center, Right).
  - **Image Layers**: Read-only natural dimension indicator (`${naturalWidth} × ${naturalHeight} px`) and "Replace image" action button.
- **Animate Tab**:
  - Empty state with a disabled "Add animation block" button (`data-testid="button-add-animation-block"`) equipped with a tooltip indicating "Timeline integration coming in the next step".

## Export Engine (WebM, GIF & MP4 Architecture)

- **Unified Frame Renderer (`render-frame.ts`)**:
  - Pure function `renderSceneFrame` captures the exact visual state of any scene at a given frame index.
  - Samples active camera position, applies 3D perspective projection, animates transform & opacity properties via `computeRenderedLayer`, evaluates depth-of-field blur (`dofBlurPx`), and runs the bloom post-processing pass.
  - Preloads all scene image assets prior to export (`preloadSceneImages`) to ensure zero visual flickering or unloaded texture artifacts.

- **WebM Video Export (`export-webm.ts`)**:
  - Implements frame-by-frame canvas capture using `canvas.captureStream(0)` and manual `track.requestFrame()` calls driven by the same frame sampling engine.
  - Automatically negotiates supported codecs (`video/webm;codecs=vp9`, fallback `video/webm;codecs=vp8`, `video/webm`).
  - Encodes directly in browser memory and outputs a standard `Blob` downloaded as `.webm`.

- **Animated GIF Export (`export-gif.ts`)**:
  - Uses `gif.js` with background web workers (`/gif.worker.js`) executing off the main thread.
  - Captures frame-by-frame `ImageData` and delivers smooth animated GIFs with customizable resolution scaling and frame rate.

- **MP4 Export Strategy & Architecture Decision Note**:
  - True MP4 (H.264/AAC) requires either:
    1. **Client-Side Transcoding via `ffmpeg.wasm`**: Runs WebAssembly client-side to transcode the recorded WebM output directly in the browser completely offline.
    2. **Server-Side API Transcoding**: POSTs the WebM binary to `artifacts/api-server` (`POST /api/export/mp4`, currently stubbed), running native ffmpeg server-side and returning the `.mp4` binary.
  - The endpoint `/api/export/mp4` is stubbed in `artifacts/api-server/src/routes/export.ts` awaiting confirmation on which strategy is preferred before implementing full transcoding.

## Automated Unit Testing Suite

The editor includes comprehensive automated unit test suites powered by Vitest, testing pure mathematical calculations, easing/projection models, canvas snapping algorithms, post-processing shaders, and local persistence:

- **Test Runner**: Vitest configured in `artifacts/motion-graphics-editor/vite.config.ts` using the Node.js test environment for execution without DOM overhead.
- **Running Tests**:
  - Run package tests: `npm run test --workspace=@workspace/motion-graphics-editor`
  - Or from project root: `npm test`
- **Covered Modules**:
  - `animation-blocks.test.ts`:
    - `sampleCubicBezier`: Solves cubic-bezier curves using Newton-Raphson iteration; verified against CSS easing references (linear, ease, ease-in, ease-out, ease-in-out) and boundary frames.
    - `applyEasing`: Tests all 4 modes (`linear`, `ease-in-out`, `spring` with damped harmonic overshoot > 1.0, and `custom` bezier curves).
    - `sampleBlock`: Evaluates all 9 animation presets (`fade-in`, `fade-out`, `slide-in-left`, `slide-in-right`, `slide-in-up`, `slide-in-down`, `scale-in`, `scale-out`, `camera-move`) at start boundary, midpoint, and end boundary frames.
    - `computeRenderedLayer`: Multi-block accumulator composition, overlapping blocks on the same layer, pre-start entrance hold, post-end exit hold, keyframe track precedence, and non-animated baseline layers.
    - `projectLayer` & `focalLength`: Perspective projection verifying `scale = 1.0` at `depth = 0` and `camera.z = 0`, push-in (+z camera movement) scaling up, push-out (-z) scaling down, depth sorting, parallax pan shift, and extreme push-in clamping protection.
    - `sampleCamera`: Single and multi-block additive accumulation across camera translation, zoom, and FOV, including boundary clamping between 10° and 160°.
    - `dofBlurPx`: Depth-of-field blur proportional to distance from `camera.focusDistance`, with clamping at extreme distances and custom blur limits.
  - `snapping.test.ts`:
    - `getSnapCandidates`: Generates canvas edge/center and layer edge/center candidates, ignoring hidden layers and the moving layer itself.
    - `snapTransform`: Tests edge and center threshold snapping, horizontal equal-spacing guide generation, and threshold behavior across zoom extremes (strict fine-tuning at high zoom vs. wide snapping at low zoom).
  - `post-processing.test.ts`:
    - `applyBloom`: Luminance extraction pass, 0-dimension canvas safety, bright pixel thresholding, and composite pass.
  - `local-store.test.ts`:
    - Content-addressed `assets` IndexedDB storage, hash-based deduplication, rolling history pruning, and document snapshot saving/hydration.
