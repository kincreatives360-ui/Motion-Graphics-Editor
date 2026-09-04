import React, { useRef, useMemo, useEffect, useLayoutEffect, useImperativeHandle, forwardRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  useEditorStore,
  useEditorUIStore,
  type Scene,
  type Layer,
} from "../../store/editor-store";
import {
  sampleCamera,
  dofBlurPx,
  type CameraTransform,
} from "../../store/animation-blocks";
import { getScreenTransform } from "../render-frame";
import { R3FLayerMesh } from "./R3FLayerMesh";
import { R3FPostProcessing } from "./R3FPostProcessing";

export interface R3FSceneCanvasRef {
  getCanvas: () => HTMLCanvasElement | null;
  renderFrame: (frame: number) => void;
}

export interface R3FSceneCanvasProps {
  scene?: Scene;
  nativeWidth: number;
  nativeHeight: number;
  frame?: number;
  backgroundColor?: string;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}

/**
 * Updates orthographic camera frustum and position to track canvas dimensions.
 * camera.manual is explicitly set to true so R3F resize observers never overwrite
 * the native coordinate space with DOM element pixel dimensions.
 * Since effectiveLayer coordinates are already perspective-projected by getScreenTransform,
 * the orthographic camera stays centered at (0, 0, 1000) looking at (0, 0, 0).
 */
function OrthoCameraController({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  const { camera, size } = useThree();

  useLayoutEffect(() => {
    if (camera instanceof THREE.OrthographicCamera) {
      camera.manual = true;
      camera.left = -width / 2;
      camera.right = width / 2;
      camera.top = height / 2;
      camera.bottom = -height / 2;
      camera.near = 0.1;
      camera.far = 4000;

      camera.position.set(0, 0, 1000);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
    }
  }, [camera, width, height, size]);

  return null;
}

/**
 * Hook to extract the underlying HTMLCanvasElement from the Three.js gl context.
 */
function CanvasBridge({
  onCanvasReady,
  onGlContext,
}: {
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
  onGlContext?: (gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) => void;
}) {
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    if (gl.domElement) {
      onCanvasReady?.(gl.domElement);
    }
    onGlContext?.(gl, scene, camera);
  }, [gl, scene, camera, onCanvasReady, onGlContext]);

  return null;
}

/**
 * Main WebGL Scene Viewport rendered via React Three Fiber.
 */
export const R3FSceneCanvas = forwardRef<R3FSceneCanvasRef, R3FSceneCanvasProps>(
  (
    {
      scene,
      nativeWidth,
      nativeHeight,
      frame: controlledFrame,
      backgroundColor = "#000000",
      onCanvasReady,
    },
    ref,
  ) => {
    const storeFrame = useEditorUIStore((s) => s.currentFrame);
    const activeFrame = controlledFrame !== undefined ? controlledFrame : storeFrame;

    const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
    const glContextRef = useRef<{
      gl: THREE.WebGLRenderer;
      scene: THREE.Scene;
      camera: THREE.Camera;
    } | null>(null);

    // Expose canvas handle and imperative renderFrame method for export pipeline
    useImperativeHandle(
      ref,
      () => ({
        getCanvas: () => canvasElementRef.current,
        renderFrame: (_targetFrame: number) => {
          if (glContextRef.current) {
            const { gl, scene: threeScene, camera } = glContextRef.current;
            gl.render(threeScene, camera);
          }
        },
      }),
      [],
    );

    const activeScene = scene;
    const layers = activeScene?.layers || [];
    const animationBlocks = activeScene?.animationBlocks || [];

    const currentCamera = useMemo(() => {
      if (!activeScene) return { x: 0, y: 0, z: 0, fov: 60, focusDistance: 1000 };
      return sampleCamera(activeScene.camera, animationBlocks, activeFrame);
    }, [activeScene, animationBlocks, activeFrame]);

    // Sort layers by depth (further back layers rendered first)
    const sortedLayers = useMemo(() => {
      return [...layers].sort(
        (a, b) => (b.transform.depth ?? 0) - (a.transform.depth ?? 0),
      );
    }, [layers]);

    // Compute animated & projected transforms for each layer
    const renderedLayers = useMemo(() => {
      return sortedLayers.map((layer) => {
        const { effectiveLayer } = getScreenTransform(
          layer,
          animationBlocks,
          activeFrame,
          currentCamera,
          { width: nativeWidth, height: nativeHeight },
          layers,
        );

        const blurAmount = dofBlurPx(layer, currentCamera);

        return {
          originalLayer: layer,
          effectiveLayer,
          blurAmount,
        };
      });
    }, [sortedLayers, animationBlocks, activeFrame, currentCamera, nativeWidth, nativeHeight, layers]);

    const handleCanvasReadyInternal = (canvas: HTMLCanvasElement) => {
      canvasElementRef.current = canvas;
      onCanvasReady?.(canvas);
    };

    const handleGlContext = (gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) => {
      glContextRef.current = { gl, scene, camera };
    };

    return (
      <div
        className="w-full h-full relative select-none overflow-hidden bg-black"
        style={{ width: "100%", height: "100%" }}
      >
        <Canvas
          orthographic
          camera={{
            manual: true,
            left: -nativeWidth / 2,
            right: nativeWidth / 2,
            top: nativeHeight / 2,
            bottom: -nativeHeight / 2,
            near: 0.1,
            far: 4000,
            position: [0, 0, 1000],
          }}
          gl={{
            preserveDrawingBuffer: true,
            antialias: true,
            alpha: false,
            powerPreference: "high-performance",
          }}
          style={{ width: "100%", height: "100%" }}
        >
          <color attach="background" args={[backgroundColor]} />

          <OrthoCameraController
            width={nativeWidth}
            height={nativeHeight}
          />

          <CanvasBridge
            onCanvasReady={handleCanvasReadyInternal}
            onGlContext={handleGlContext}
          />

          {/* Studio Lighting */}
          <ambientLight intensity={activeScene?.lighting?.enabled ? 0.75 : 1.0} />
          {activeScene?.lighting?.enabled && (
            <directionalLight
              position={[
                (activeScene.lighting.lightX ?? -300),
                -(activeScene.lighting.lightY ?? -450),
                600,
              ]}
              intensity={(activeScene.lighting.intensity ?? 0.6) * 1.5}
            />
          )}

          {/* Render all scene layers */}
          {renderedLayers.map(({ effectiveLayer, blurAmount }) => (
            <R3FLayerMesh
              key={effectiveLayer.id}
              layer={effectiveLayer}
              canvasWidth={nativeWidth}
              canvasHeight={nativeHeight}
              camera={currentCamera}
              dofBlur={blurAmount}
            />
          ))}

          {/* GPU Post-Processing Effects */}
          <R3FPostProcessing effects={activeScene?.effects} />
        </Canvas>
      </div>
    );
  },
);

R3FSceneCanvas.displayName = "R3FSceneCanvas";

