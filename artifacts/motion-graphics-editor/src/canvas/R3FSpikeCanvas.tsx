import React, { useRef, useState, useMemo, useCallback } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { EffectComposer, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { useEditorStore, useEditorUIStore, type Layer, type Transform } from "../store/editor-store";
import { computeRenderedLayer } from "../store/animation-blocks";
import { Camera, Image as ImageIcon, Sparkles, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";

/**
 * Custom GLSL Shader Material for flat-colored mesh rendering in R3F spike.
 */
const CustomTestShaderMaterial = {
  uniforms: {
    uColor: { value: new THREE.Color("#38bdf8") },
    uTime: { value: 0 },
    uOpacity: { value: 1.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uColor;
    uniform float uTime;
    uniform float uOpacity;
    varying vec2 vUv;

    void main() {
      // Subtle pulse grid effect to visually confirm shader execution
      vec2 grid = abs(fract(vUv * 10.0 - 0.5) - 0.5) / fwidth(vUv * 10.0);
      float line = min(grid.x, grid.y);
      float gridPattern = 1.0 - min(line, 1.0);

      vec3 finalColor = mix(uColor, vec3(1.0), gridPattern * 0.15);
      gl_FragColor = vec4(finalColor, uOpacity);
    }
  `,
};

/**
 * Converts Canvas2D pixel coordinates (top-left origin, Y down) into Three.js Orthographic world space (center origin, Y up).
 */
export function canvasToOrthographicWorld(
  transform: Transform,
  canvasWidth: number,
  canvasHeight: number
) {
  // Center of layer in Canvas2D pixel space
  const cx = transform.x + transform.width / 2;
  const cy = transform.y + transform.height / 2;

  // Orthographic world coordinates: Center (0,0) is canvas center
  const worldX = cx - canvasWidth / 2;
  const worldY = canvasHeight / 2 - cy;
  const depthZ = -(transform.depth || 0);

  // Rotation around Z axis: Canvas2D clockwise vs Three.js counter-clockwise
  const rotationRad = (-transform.rotation * Math.PI) / 180;

  return {
    position: [worldX, worldY, depthZ] as [number, number, number],
    scale: [transform.width, transform.height, 1] as [number, number, number],
    rotation: [0, 0, rotationRad] as [number, number, number],
  };
}

/**
 * Renders a single flat-colored rectangle mesh matching a layer's transform.
 */
function TestLayerMesh({
  layer,
  canvasWidth,
  canvasHeight,
  fillColor,
}: {
  layer: Layer;
  canvasWidth: number;
  canvasHeight: number;
  fillColor: string;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const { position, scale, rotation } = useMemo(
    () => canvasToOrthographicWorld(layer.transform, canvasWidth, canvasHeight),
    [layer.transform, canvasWidth, canvasHeight]
  );

  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(fillColor || "#38bdf8") },
      uTime: { value: 0 },
      uOpacity: { value: layer.opacity ?? 1.0 },
    }),
    [fillColor, layer.opacity]
  );

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.getElapsedTime();
      materialRef.current.uniforms.uColor.value.set(fillColor || "#38bdf8");
      materialRef.current.uniforms.uOpacity.value = layer.opacity ?? 1.0;
    }
  });

  return (
    <mesh ref={meshRef} position={position} scale={scale} rotation={rotation}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        ref={materialRef}
        args={[CustomTestShaderMaterial]}
        uniforms={uniforms}
        transparent
      />
    </mesh>
  );
}

/**
 * Syncs Orthographic Camera bounds with canvas container dimensions.
 */
function OrthographicCameraSetup({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  const { camera } = useThree();

  React.useEffect(() => {
    if (camera instanceof THREE.OrthographicCamera) {
      camera.left = -width / 2;
      camera.right = width / 2;
      camera.top = height / 2;
      camera.bottom = -height / 2;
      camera.near = 0.1;
      camera.far = 2000;
      camera.position.set(0, 0, 1000);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
    }
  }, [camera, width, height]);

  return null;
}

/**
 * Controller inside R3F context exposing gl readPixels and toDataURL capabilities.
 */
function FrameCaptureController({
  onCaptureReady,
}: {
  onCaptureReady: (helpers: {
    toDataURL: () => string;
    readPixels: () => Uint8Array;
  }) => void;
}) {
  const { gl, scene, camera } = useThree();

  React.useEffect(() => {
    const helpers = {
      toDataURL: () => {
        gl.render(scene, camera);
        return gl.domElement.toDataURL("image/png");
      },
      readPixels: () => {
        gl.render(scene, camera);
        const width = gl.drawingBufferWidth;
        const height = gl.drawingBufferHeight;
        const buf = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        return buf;
      },
    };
    onCaptureReady(helpers);
  }, [gl, scene, camera, onCaptureReady]);

  return null;
}

/**
 * Standalone R3F Spike Canvas Component.
 */
export function R3FSpikeCanvas() {
  const scenes = useEditorStore((state) => state.scenes);
  const activeSceneId = useEditorStore((state) => state.activeSceneId);
  const selectedLayerIds = useEditorStore((state) => state.selectedLayerIds);
  const currentFrame = useEditorUIStore((state) => state.currentFrame);

  const activeScene = useMemo(() => {
    return scenes?.find((s) => s.id === activeSceneId) || scenes?.[0];
  }, [scenes, activeSceneId]);

  const layers = activeScene?.layers || [];
  const blocks = activeScene?.animationBlocks || [];

  const canvasWidth = 1280;
  const canvasHeight = 720;

  // Pick the selected layer or first layer
  const targetLayer = useMemo(() => {
    if (!layers || layers.length === 0) return null;
    const selectedId = selectedLayerIds?.[0];
    const selected = layers.find((l: Layer) => l.id === selectedId);
    return selected || layers[0];
  }, [layers, selectedLayerIds]);

  // Compute animated layer state for current timeline frame
  const animatedLayer = useMemo(() => {
    if (!targetLayer) return null;
    const rendered = computeRenderedLayer(targetLayer, blocks, currentFrame);
    return {
      ...targetLayer,
      transform: rendered.transform,
      opacity: rendered.opacity,
      fill: rendered.fill || targetLayer.shape?.fill || "#38bdf8",
    };
  }, [targetLayer, blocks, currentFrame]);

  // State for frame capture verification
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [pixelStats, setPixelStats] = useState<{ totalBytes: number; nonZeroBytes: number } | null>(null);
  const [captureStatus, setCaptureStatus] = useState<"idle" | "testing" | "success" | "failed">("idle");
  const captureHelpersRef = useRef<{ toDataURL: () => string; readPixels: () => Uint8Array } | null>(null);

  const handleCaptureReady = useCallback(
    (helpers: { toDataURL: () => string; readPixels: () => Uint8Array }) => {
      captureHelpersRef.current = helpers;
    },
    []
  );

  const runFrameCaptureTest = () => {
    if (!captureHelpersRef.current) {
      setCaptureStatus("failed");
      return;
    }
    setCaptureStatus("testing");
    try {
      // 1. Test canvas.toDataURL()
      const dataUrl = captureHelpersRef.current.toDataURL();
      setCapturedDataUrl(dataUrl);

      // 2. Test gl.readPixels()
      const pixels = captureHelpersRef.current.readPixels();
      let nonZero = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] > 0) nonZero++;
      }
      setPixelStats({ totalBytes: pixels.length, nonZeroBytes: nonZero });
      setCaptureStatus("success");
    } catch (err) {
      console.error("Frame capture test failed:", err);
      setCaptureStatus("failed");
    }
  };

  const worldCoords = useMemo(() => {
    if (!animatedLayer) return null;
    return canvasToOrthographicWorld(animatedLayer.transform, canvasWidth, canvasHeight);
  }, [animatedLayer, canvasWidth, canvasHeight]);

  return (
    <div className="w-full h-full flex flex-col bg-[#0b0c0e] text-[#e2e8f0] font-sans overflow-hidden">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#121418] border-b border-[#21252d]">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-xs text-slate-200">
            R3F Feasibility Spike Canvas
          </span>
          <span className="px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/50 text-[10px]">
            Feature-Flagged Spike
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={runFrameCaptureTest}
            className="flex items-center gap-1.5 px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs transition-colors font-medium"
            data-testid="button-test-frame-capture"
          >
            <Camera className="w-3.5 h-3.5" />
            Test Frame Capture (toDataURL & readPixels)
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Main R3F Canvas Viewport */}
        <div className="flex-1 relative bg-[#181a20] flex items-center justify-center p-4">
          <div
            className="relative shadow-2xl border border-[#2b303b] bg-black overflow-hidden"
            style={{
              width: `${canvasWidth * 0.65}px`,
              height: `${canvasHeight * 0.65}px`,
              aspectRatio: `${canvasWidth} / ${canvasHeight}`,
            }}
          >
            <Canvas
              orthographic
              gl={{ preserveDrawingBuffer: true, antialias: true }}
              style={{ width: "100%", height: "100%" }}
              data-testid="r3f-spike-canvas"
            >
              <OrthographicCameraSetup width={canvasWidth} height={canvasHeight} />
              <FrameCaptureController onCaptureReady={handleCaptureReady} />

              <ambientLight intensity={0.8} />

              {animatedLayer && (
                <TestLayerMesh
                  layer={animatedLayer}
                  canvasWidth={canvasWidth}
                  canvasHeight={canvasHeight}
                  fillColor={animatedLayer.fill}
                />
              )}

              {/* Post-Processing Pass: Vignette */}
              <EffectComposer>
                <Vignette eskil={false} offset={0.2} darkness={0.8} />
              </EffectComposer>
            </Canvas>

            <div className="absolute top-2 left-2 px-2 py-1 bg-black/70 backdrop-blur rounded text-[10px] text-slate-300 font-mono pointer-events-none">
              Viewport: {canvasWidth}x{canvasHeight}px | PostFX: Vignette Active
            </div>
          </div>
        </div>

        {/* Diagnostic Sidebar */}
        <div className="w-80 border-l border-[#21252d] bg-[#121418] p-4 flex flex-col gap-4 overflow-y-auto text-xs">
          <div>
            <h3 className="font-semibold text-slate-200 text-xs mb-2 border-b border-[#21252d] pb-1">
              Active Layer Transform
            </h3>
            {animatedLayer ? (
              <div className="font-mono text-[11px] bg-[#181a20] p-2.5 rounded border border-[#252932] space-y-1 text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-500">Layer ID:</span>
                  <span className="text-cyan-400">{animatedLayer.name || animatedLayer.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Pixel (X, Y):</span>
                  <span>({Math.round(animatedLayer.transform.x)}, {Math.round(animatedLayer.transform.y)})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Size (W x H):</span>
                  <span>{Math.round(animatedLayer.transform.width)} x {Math.round(animatedLayer.transform.height)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Rotation:</span>
                  <span>{Math.round(animatedLayer.transform.rotation || 0)}°</span>
                </div>
              </div>
            ) : (
              <div className="text-slate-500 italic text-[11px]">No layer found in store.</div>
            )}
          </div>

          <div>
            <h3 className="font-semibold text-slate-200 text-xs mb-2 border-b border-[#21252d] pb-1">
              Mapped Three.js World Vector
            </h3>
            {worldCoords ? (
              <div className="font-mono text-[11px] bg-[#181a20] p-2.5 rounded border border-[#252932] space-y-1 text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-500">World Pos (X,Y,Z):</span>
                  <span className="text-emerald-400">
                    ({Math.round(worldCoords.position[0])}, {Math.round(worldCoords.position[1])}, {worldCoords.position[2]})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Mesh Scale:</span>
                  <span>{worldCoords.scale[0]} x {worldCoords.scale[1]}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Z-Rot (rad):</span>
                  <span>{worldCoords.rotation[2].toFixed(3)} rad</span>
                </div>
              </div>
            ) : null}
          </div>

          <div>
            <h3 className="font-semibold text-slate-200 text-xs mb-2 border-b border-[#21252d] pb-1">
              Frame Capture Test Results
            </h3>
            {captureStatus === "idle" && (
              <p className="text-[#8c8f96] text-[11px] italic">
                Click "Test Frame Capture" above to execute `toDataURL` and `readPixels` tests on WebGL drawing buffer.
              </p>
            )}
            {captureStatus === "success" && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  Frame Capture Verified
                </div>
                <div className="font-mono text-[10px] bg-[#181a20] p-2 rounded border border-[#252932] text-slate-300 space-y-1">
                  <div>
                    <span className="text-slate-500">readPixels:</span>{" "}
                    {pixelStats?.totalBytes.toLocaleString()} bytes read
                  </div>
                  <div>
                    <span className="text-slate-500">Non-zero pixels:</span>{" "}
                    {pixelStats?.nonZeroBytes.toLocaleString()} px
                  </div>
                  <div>
                    <span className="text-slate-500">preserveDrawingBuffer:</span>{" "}
                    <span className="text-emerald-400">True</span>
                  </div>
                </div>

                {capturedDataUrl && (
                  <div className="space-y-1">
                    <div className="text-[10px] text-slate-400">Captured Thumbnail (toDataURL):</div>
                    <img
                      src={capturedDataUrl}
                      alt="Captured WebGL Frame"
                      className="w-full rounded border border-cyan-800/60 shadow"
                    />
                  </div>
                )}
              </div>
            )}
            {captureStatus === "failed" && (
              <div className="flex items-center gap-1.5 text-rose-400 text-xs">
                <AlertCircle className="w-4 h-4" />
                Capture Failed
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
