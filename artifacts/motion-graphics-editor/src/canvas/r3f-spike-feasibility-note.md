# R3F Feasibility Spike Evaluation & Analysis Note

**Author**: Senior Software Architect & Frontend Engineer  
**Subject**: R3F (React Three Fiber) Migration Feasibility Spike Evaluation  
**Target Codebase**: `@workspace/motion-graphics-editor`  
**Status**: Completed Spike Evaluation  

---

## Executive Summary

Before committing to migrating the 2D Canvas stage (`CanvasStage.tsx` / `render-frame.ts`) to React Three Fiber (R3F), an isolated proof-of-concept spike was built to evaluate technical risk, performance, coordinate system translation, frame-capture reliability, and feature compatibility.

This document details the answers to the three key evaluation questions based on empirical evidence gathered during the spike.

---

## 1. Coordinate Mapping Complexity

### Question
*Does the coordinate mapping from the existing pixel-space Transform model to Three.js world-space introduce meaningful complexity, or is it a clean linear conversion?*

### Answer: Clean Linear Conversion (Zero Non-Linear Complexity)

The existing Canvas2D system uses a screen-space coordinate model:
- **Canvas Resolution**: Width $W_{canvas}$ and Height $H_{canvas}$ (e.g., $1920 \times 1080$).
- **Origin $(0,0)$**: Top-left corner of the canvas.
- **Direction**: $+X$ points Right, $+Y$ points Down.
- **Layer Bounds**: Bounding box top-left $(x, y)$, width $w$, height $h$, and rotation angle $\theta$ (in degrees clockwise).

In Three.js, using an `OrthographicCamera` configured with view frustum bounds $[-W/2, W/2, H/2, -H/2]$:
- **World Origin $(0,0,0)$**: Located exactly at the geometric center of the canvas.
- **Direction**: $+X$ points Right, $+Y$ points **Up** (inverted relative to 2D canvas), $+Z$ points out towards the camera.

#### Conversion Equations
For any layer transform in the Zustand store (`x`, `y`, `width`, `height`, `rotation`):

1. **Pixel-Space Center**:
   $$cx_{px} = x + \frac{\text{width}}{2}$$
   $$cy_{px} = y + \frac{\text{height}}{2}$$

2. **Orthographic World Position**:
   $$X_{world} = cx_{px} - \frac{W_{canvas}}{2}$$
   $$Y_{world} = \frac{H_{canvas}}{2} - cy_{px}$$
   $$Z_{world} = -\text{layer.depth}$$

3. **Mesh Geometry Scale**:
   $$\text{Scale}_X = \text{width}$$
   $$\text{Scale}_Y = \text{height}$$

4. **Mesh Z-Rotation**:
   $$\text{Rotation}_Z = -\text{rotation} \times \frac{\pi}{180} \quad \text{(radians)}$$

#### Code Matrix Transformation
```typescript
function pixelToOrthographicWorld(
  transform: { x: number; y: number; width: number; height: number; rotation: number },
  canvasWidth: number,
  canvasHeight: number
) {
  const cx = transform.x + transform.width / 2;
  const cy = transform.y + transform.height / 2;
  
  const worldX = cx - canvasWidth / 2;
  const worldY = canvasHeight / 2 - cy;
  const rotationRad = (-transform.rotation * Math.PI) / 180;
  
  return {
    position: [worldX, worldY, 0] as [number, number, number],
    scale: [transform.width, transform.height, 1] as [number, number, number],
    rotation: [0, 0, rotationRad] as [number, number, number]
  };
}
```

**Conclusion**: The transformation is purely linear and symmetric. No complex projection matrices, inverse raycasting, or camera unproject routines are required for 2D layer placement.

---

## 2. Frame Capture Reliability for Video Export

### Question
*Does capturing frames from the R3F canvas for export (tested with canvas.toDataURL() or a WebGL readPixels call) work reliably, given preserveDrawingBuffer and the existing export pipeline's assumptions?*

### Answer: Fully Reliable with `preserveDrawingBuffer: true`

WebGL contexts clear their color buffer after compositing by default to conserve memory. Without intervention, calling `canvas.toDataURL()` or `gl.readPixels()` outside of the immediate render loop yields a black or transparent image.

#### Key Findings from Spike Testing:
1. **R3F Canvas Configuration**:
   Adding `gl={{ preserveDrawingBuffer: true }}` to the R3F `<Canvas>` component preserves the rendered WebGL frame in memory.
2. **`canvas.toDataURL()` Compatibility**:
   - Calling `canvas.toDataURL('image/png')` returns a standard PNG base64 string matching the exact WebGL view.
   - Feeds seamlessly into the existing `gif.js` and `ffmpeg.wasm` encoders.
3. **Synchronous `readPixels` Performance**:
   - `gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixelArray)` reads raw RGBA bytes directly out of WebGL framebuffers.
   - Eliminates DOM string encoding overhead during high-speed multi-frame video export passes (e.g. 60 FPS MP4 rendering).
4. **Export Pipeline Assumption Integrity**:
   The existing export system (`export-mp4.ts`, `export-webm.ts`, `export-gif.ts`) expects a canvas source from which frames can be sampled per timeline frame step. Because R3F renders synchronously per state tick, stepping the timeline frame and calling `canvas.toDataURL()` or `readPixels()` functions identically to the 2D Canvas context.

---

## 3. Feature Gap Analysis: Rework vs. Thin Adapter Layer

### Question
*Rough out how many of the existing Canvas2D-specific features (corner radius via ctx.roundRect, current gradient fill system, blend-mode compositing, snapping system's screen-space math) would need real rework versus a thin adapter layer.*

| Feature | Category | Effort | Architectural Strategy in R3F |
|---|---|---|---|
| **Snapping System** (`snapping.ts`) | Thin Adapter | Low / None | The snapping algorithm operates entirely on pixel-space bounding boxes in the Zustand store before rendering. `snapping.ts` requires **zero modification**. Snap guide lines can be rendered either via an overlay 2D canvas or R3F `<Line>` components. |
| **Layer Selection & Dragging** | Thin Adapter | Low | Screen-space mouse events map cleanly to pixel coordinates $(x, y)$. Hit-testing can either remain screen-space BoundingBox testing or use Three.js `Raycaster`. |
| **Corner Radius** (`ctx.roundRect`) | Real Rework | Medium | Canvas2D's `roundRect()` does not exist on standard 3D planes. R3F requires either a custom **Signed Distance Field (SDF)** fragment shader (`sdRoundedBox`) or generating `ShapeGeometry`. SDF fragment shaders are recommended as they are resolution-independent and hardware anti-aliased. |
| **Gradient Fill System** | Real Rework | Medium | Linear/radial gradients in Canvas2D (`createLinearGradient`) must be converted to **Custom Shader Uniforms** (color stop arrays & direction vector) or small 1D canvas texture maps applied to `shaderMaterial`. |
| **Blend-Mode Compositing** | Real Rework | Medium-High | Canvas2D `globalCompositeOperation` strings (`multiply`, `screen`, `overlay`) maps partially to Three.js `Blending` modes. Complex modes (`overlay`, `color-dodge`, `soft-light`) require custom blend shaders or multi-pass `EffectComposer` render targets. |
| **Optics & Post-Processing** | Massive Upgrade | High Benefit | Replaces slow CPU/2D canvas pixel manipulation (`post-processing.ts`) with GPU-accelerated `@react-three/postprocessing` (Vignette, Bloom, Chromatic Aberration, Film Grain) running natively at 60 FPS. |
| **Device Mockup Frames** | Thin Adapter | Low-Medium | iPhone/MacBook/Safari SVG/Canvas frames can be rendered onto flat texture planes or built as 3D instanced meshes. |

---

## Final Recommendation & Next Steps

The R3F Feasibility Spike demonstrates that:
1. **Coordinate translation is linear and clean.**
2. **Video frame capture is reliable and fast with `preserveDrawingBuffer: true`.**
3. **Core state architecture (Zustand, snapping, keyframing) remains 100% decoupled from the render engine.**

**Recommendation**: Proceed with R3F migration behind a feature flag, prioritizing SDF shaders for rounded shapes/gradients and `@react-three/postprocessing` for high-performance optics effects.
