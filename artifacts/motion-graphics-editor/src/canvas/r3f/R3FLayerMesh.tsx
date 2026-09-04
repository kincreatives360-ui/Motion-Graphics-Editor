import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { Text } from "@react-three/drei";
import { SVGLoader } from "three-stdlib";
import type {
  Layer,
  Camera,
  DropShadowLayerEffect,
  GlowLayerEffect,
  LayerBlurLayerEffect,
  BackdropBlurLayerEffect,
  LiquidGlassLayerEffect,
} from "../../store/editor-store";
import { createRoundRectShaderMaterial } from "./R3FRoundRectMaterial";
import {
  createDropShadowShaderMaterial,
  createGlowShaderMaterial,
  createLayerBlurShaderMaterial,
  createBackdropBlurShaderMaterial,
  createLiquidGlassShaderMaterial,
  type LayerGeometryInfo,
} from "./R3FLayerEffectsMaterials";
import { R3FDeviceMockupMesh } from "./R3FDeviceMockupMesh";

export interface R3FLayerMeshProps {
  layer: Layer;
  canvasWidth: number;
  canvasHeight: number;
  camera?: Camera;
  dofBlur?: number;
}

/**
 * Converts screen-space transform (top-left origin, Y down) into Three.js world coordinates (center origin, Y up).
 */
export function layerTransformToThree(
  transform: Layer["transform"],
  canvasWidth: number,
  canvasHeight: number,
  camera?: Camera,
) {
  const cx = transform.x + transform.width / 2;
  const cy = transform.y + transform.height / 2;

  const worldX = cx - canvasWidth / 2;
  const worldY = canvasHeight / 2 - cy;
  const worldZ = -(transform.depth ?? 0);

  const camPitch = camera?.pitch ?? 0;
  const camYaw = camera?.yaw ?? 0;
  const camRoll = camera?.roll ?? 0;

  const rotZ = (-((transform.rotation || 0) + camRoll) * Math.PI) / 180;
  const rotX = ((((transform.rotateX || 0) - camPitch)) * Math.PI) / 180;
  const rotY = ((((transform.rotateY || 0) + camYaw)) * Math.PI) / 180;

  return {
    position: [worldX, worldY, worldZ] as [number, number, number],
    rotation: [rotX, rotY, rotZ] as [number, number, number],
    size: [transform.width, transform.height] as [number, number],
  };
}

/**
 * Renders an arbitrary SVG path string as a 2D triangulated mesh.
 */
function SvgPathMesh({
  pathData,
  fill,
  stroke,
  strokeWidth,
  width,
  height,
  opacity,
}: {
  pathData: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  width: number;
  height: number;
  opacity: number;
}) {
  const shapes = useMemo(() => {
    try {
      const loader = new SVGLoader();
      const svgXml = `<svg viewBox="0 0 ${width} ${height}"><path d="${pathData}"/></svg>`;
      const parsed = loader.parse(svgXml);
      const allShapes: THREE.Shape[] = [];
      for (const path of parsed.paths) {
        allShapes.push(...SVGLoader.createShapes(path));
      }
      return allShapes;
    } catch {
      return [];
    }
  }, [pathData, width, height]);

  if (!shapes || shapes.length === 0) return null;

  return (
    <group position={[-width / 2, height / 2, 0]} scale={[1, -1, 1]}>
      {shapes.map((shape, idx) => (
        <mesh key={idx}>
          <shapeGeometry args={[shape]} />
          <meshBasicMaterial
            color={fill && fill !== "transparent" ? fill : "#38bdf8"}
            transparent
            opacity={opacity}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Renders image layers via cached HTMLImage or Texture.
 */
function ImageLayerMesh({
  src,
  width,
  height,
  opacity,
}: {
  src: string;
  width: number;
  height: number;
  opacity: number;
}) {
  const texture = useMemo(() => {
    if (!src) return null;
    const tex = new THREE.TextureLoader().load(src);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [src]);

  if (!texture) return null;

  return (
    <mesh>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} transparent opacity={opacity} />
    </mesh>
  );
}

function DropShadowMesh({
  geo,
  effect,
}: {
  geo: LayerGeometryInfo;
  effect: DropShadowLayerEffect;
}) {
  const { material, meshW, meshH } = useMemo(
    () => createDropShadowShaderMaterial(geo, effect),
    [geo, effect],
  );

  return (
    <mesh position={[effect.offsetX, -effect.offsetY, -0.02]} material={material}>
      <planeGeometry args={[meshW, meshH]} />
    </mesh>
  );
}

function GlowMesh({
  geo,
  effect,
}: {
  geo: LayerGeometryInfo;
  effect: GlowLayerEffect;
}) {
  const { material, meshW, meshH } = useMemo(
    () => createGlowShaderMaterial(geo, effect),
    [geo, effect],
  );

  return (
    <mesh position={[0, 0, 0.02]} material={material}>
      <planeGeometry args={[meshW, meshH]} />
    </mesh>
  );
}

function BackdropBlurMesh({
  geo,
  effect,
}: {
  geo: LayerGeometryInfo;
  effect: BackdropBlurLayerEffect;
}) {
  const { material } = useMemo(
    () => createBackdropBlurShaderMaterial(geo, effect),
    [geo, effect],
  );

  return (
    <mesh position={[0, 0, -0.005]} material={material}>
      <planeGeometry args={[geo.width, geo.height]} />
    </mesh>
  );
}

function LiquidGlassMesh({
  geo,
  effect,
}: {
  geo: LayerGeometryInfo;
  effect: LiquidGlassLayerEffect;
}) {
  const { material } = useMemo(
    () => createLiquidGlassShaderMaterial(geo, effect),
    [geo, effect],
  );

  return (
    <mesh position={[0, 0, 0.03]} material={material}>
      <planeGeometry args={[geo.width, geo.height]} />
    </mesh>
  );
}

function LayerBlurShapeMesh({
  geo,
  effect,
  fillColor,
  strokeColor,
  strokeWidth,
}: {
  geo: LayerGeometryInfo;
  effect: LayerBlurLayerEffect;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
}) {
  const { material, meshW, meshH } = useMemo(
    () =>
      createLayerBlurShaderMaterial(
        geo,
        effect,
        fillColor,
        strokeColor,
        strokeWidth,
      ),
    [geo, effect, fillColor, strokeColor, strokeWidth],
  );

  return (
    <mesh material={material}>
      <planeGeometry args={[meshW, meshH]} />
    </mesh>
  );
}

/**
 * Unified R3F Mesh representing any layer (Shape, Text, Image, SVG Path)
 * with multi-pass extra meshes for Drop Shadow, Glow, Backdrop Blur, Layer Blur, and Liquid Glass.
 */
export function R3FLayerMesh({
  layer,
  canvasWidth,
  canvasHeight,
  camera,
  dofBlur = 0,
}: R3FLayerMeshProps) {
  if (!layer.visible || layer.opacity <= 0) return null;

  const { position, rotation, size } = useMemo(
    () => layerTransformToThree(layer.transform, canvasWidth, canvasHeight, camera),
    [layer.transform, canvasWidth, canvasHeight, camera],
  );

  const [width, height] = size;
  const opacity = Math.max(0, Math.min(1, layer.opacity));

  const isEllipse = layer.type === "shape" && layer.shape?.kind === "ellipse";
  const radius = isEllipse ? 0 : (layer.type === "shape" && layer.shape?.radius ? layer.shape.radius : 0);

  const geoInfo: LayerGeometryInfo = useMemo(() => ({
    width,
    height,
    radius,
    isEllipse,
    layerOpacity: opacity,
  }), [width, height, radius, isEllipse, opacity]);

  // Active layer effects partitioned by type
  const activeEffects = useMemo(() => {
    const rawEffects = layer.effects || [];
    const order = layer.effectsOrder && layer.effectsOrder.length > 0
      ? layer.effectsOrder
      : rawEffects.map((e) => e.id);
    const orderMap = new Map(order.map((id, index) => [id, index]));
    return [...rawEffects]
      .filter((fx) => fx.enabled && fx.visible)
      .sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
  }, [layer.effects, layer.effectsOrder]);

  const dropShadowEffects = useMemo(
    () => activeEffects.filter((e): e is DropShadowLayerEffect => e.type === "dropShadow"),
    [activeEffects],
  );

  const glowEffects = useMemo(
    () => activeEffects.filter((e): e is GlowLayerEffect => e.type === "glow"),
    [activeEffects],
  );

  const layerBlurEffect = useMemo(
    () => activeEffects.find((e): e is LayerBlurLayerEffect => e.type === "layerBlur"),
    [activeEffects],
  );

  const backdropBlurEffect = useMemo(
    () => activeEffects.find((e): e is BackdropBlurLayerEffect => e.type === "backdropBlur"),
    [activeEffects],
  );

  const liquidGlassEffects = useMemo(
    () => activeEffects.filter((e): e is LiquidGlassLayerEffect => e.type === "liquidGlass"),
    [activeEffects],
  );

  // Material for standard shapes with optical depth-of-field blur (used when layerBlur is not active)
  const shapeMaterial = useMemo(() => {
    if (layer.type !== "shape" || !layer.shape) return null;
    return createRoundRectShaderMaterial({
      width,
      height,
      radius,
      fillColor: layer.shape.fill ?? "#38bdf8",
      strokeColor: layer.shape.stroke ?? "transparent",
      strokeWidth: layer.shape.strokeWidth ?? 0,
      opacity,
      isEllipse,
      blur: dofBlur,
    });
  }, [layer.type, layer.shape, width, height, radius, isEllipse, opacity, dofBlur]);

  return (
    <group position={position} rotation={rotation}>
      {/* 3D Realistic Device Enclosure (iPhone 16 Pro, MacBook Pro, Safari Browser) */}
      {layer.mockup && layer.mockup !== "none" && (
        <R3FDeviceMockupMesh
          mockup={layer.mockup}
          width={width}
          height={height}
          opacity={opacity}
        />
      )}

      {/* 1. Backdrop Blur Pass (composited behind layer) */}
      {backdropBlurEffect && (
        <BackdropBlurMesh geo={geoInfo} effect={backdropBlurEffect} />
      )}

      {/* 2. Drop Shadow Pass(es) (composited behind layer) */}
      {dropShadowEffects.map((ds) => (
        <DropShadowMesh key={ds.id} geo={geoInfo} effect={ds} />
      ))}

      {/* 3. Layer Fill / Stroke Mesh Pass */}
      {/* 3a. Shape: Layer Blur analytical erf progressive/uniform shader pass */}
      {layer.type === "shape" && layer.shape && layer.shape.kind !== "path" && layerBlurEffect && (
        <LayerBlurShapeMesh
          geo={geoInfo}
          effect={layerBlurEffect}
          fillColor={layer.shape.fill ?? "#38bdf8"}
          strokeColor={layer.shape.stroke ?? "transparent"}
          strokeWidth={layer.shape.strokeWidth ?? 0}
        />
      )}

      {/* 3b. Shape: Standard SDF RoundRect / Ellipse (when layerBlur is not active) */}
      {layer.type === "shape" && layer.shape && layer.shape.kind !== "path" && !layerBlurEffect && shapeMaterial && (
        <mesh material={shapeMaterial}>
          <planeGeometry args={[width, height]} />
        </mesh>
      )}

      {/* 3c. Shape: Custom SVG Path */}
      {layer.type === "shape" && layer.shape && layer.shape.kind === "path" && layer.shape.path && (
        <SvgPathMesh
          pathData={layer.shape.path}
          fill={layer.shape.fill}
          stroke={layer.shape.stroke}
          strokeWidth={layer.shape.strokeWidth}
          width={width}
          height={height}
          opacity={opacity}
        />
      )}

      {/* 3d. Text Layer via Drei MSDF Text with optical blur support */}
      {layer.type === "text" && layer.text && (
        <Text
          fontSize={layer.text.fontSize || 32}
          color={layer.text.color || "#ffffff"}
          textAlign={layer.text.align || "left"}
          anchorX={layer.text.align === "left" ? "left" : layer.text.align === "right" ? "right" : "center"}
          anchorY="middle"
          maxWidth={width}
          fillOpacity={opacity}
          outlineWidth={dofBlur > 0.5 ? Math.min(6, dofBlur * 0.4) : 0}
          outlineBlur={dofBlur > 0.5 ? Math.min(12, dofBlur * 0.8) : 0}
          outlineColor={layer.text.color || "#ffffff"}
          outlineOpacity={opacity * 0.75}
          position={[
            layer.text.align === "left" ? -width / 2 : layer.text.align === "right" ? width / 2 : 0,
            0,
            0.1,
          ]}
        >
          {layer.text.content || "Text Layer"}
        </Text>
      )}

      {/* 3e. Image Layer */}
      {layer.type === "image" && layer.image?.src && (
        <ImageLayerMesh
          src={layer.image.src}
          width={width}
          height={height}
          opacity={opacity}
        />
      )}

      {/* 4. Glow Pass(es) (composited over/around layer) */}
      {glowEffects.map((gl) => (
        <GlowMesh key={gl.id} geo={geoInfo} effect={gl} />
      ))}

      {/* 5. Liquid Glass Pass(es) (composited on top of layer) */}
      {liquidGlassEffects.map((lg) => (
        <LiquidGlassMesh key={lg.id} geo={geoInfo} effect={lg} />
      ))}
    </group>
  );
}

