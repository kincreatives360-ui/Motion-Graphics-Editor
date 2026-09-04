import React, { useMemo } from "react";
import * as THREE from "three";
import { type MockupType } from "../../store/editor-store";

interface R3FDeviceMockupMeshProps {
  mockup: MockupType;
  width: number;
  height: number;
  opacity?: number;
}

/**
 * Creates a 2D rounded rectangle Three.js Shape.
 */
function createRoundedRectShape(
  w: number,
  h: number,
  radius: number,
): THREE.Shape {
  const shape = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  const r = Math.min(radius, Math.min(w, h) / 2);

  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);

  return shape;
}

export function R3FDeviceMockupMesh({
  mockup,
  width,
  height,
  opacity = 1,
}: R3FDeviceMockupMeshProps) {
  if (!mockup || mockup === "none") return null;

  const isIphone = mockup === "iphone";
  const isMacbook = mockup === "macbook";
  const isBrowser = mockup === "safari" || (mockup as string) === "browser";

  if (isIphone) {
    return <IPhone16ProFrame width={width} height={height} opacity={opacity} />;
  }

  if (isMacbook) {
    return <MacBookProFrame width={width} height={height} opacity={opacity} />;
  }

  if (isBrowser) {
    return <BrowserFrame width={width} height={height} opacity={opacity} />;
  }

  return null;
}

/**
 * iPhone 16 Pro 3D Enclosure:
 * - Titanium chassis with rounded corners and bevel
 * - Dark inner screen bezel
 * - Dynamic Island with camera lens reflection
 * - Tactile side buttons (Action button, Volume up/down, Power button)
 */
function IPhone16ProFrame({
  width,
  height,
  opacity,
}: {
  width: number;
  height: number;
  opacity: number;
}) {
  const bezel = 14;
  const chassisW = width + bezel * 2;
  const chassisH = height + bezel * 2;
  const cornerRadius = Math.min(42, width * 0.12);

  const chassisGeo = useMemo(() => {
    const shape = createRoundedRectShape(chassisW, chassisH, cornerRadius);
    return new THREE.ExtrudeGeometry(shape, {
      depth: 10,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 2,
      bevelThickness: 2,
    });
  }, [chassisW, chassisH, cornerRadius]);

  const islandWidth = Math.min(92, width * 0.28);
  const islandHeight = 22;
  const islandGeo = useMemo(() => {
    const shape = createRoundedRectShape(islandWidth, islandHeight, 11);
    return new THREE.ShapeGeometry(shape);
  }, [islandWidth, islandHeight]);

  return (
    <group position={[0, 0, 0]}>
      {/* Titanium Chassis (Sits behind screen geometry) */}
      <mesh geometry={chassisGeo} position={[0, 0, -12]}>
        <meshStandardMaterial
          color="#1c1e23"
          metalness={0.88}
          roughness={0.22}
          transparent={opacity < 1}
          opacity={opacity}
        />
      </mesh>

      {/* Screen Border Frame Rim */}
      <mesh position={[0, 0, -0.5]}>
        <planeGeometry args={[width + 8, height + 8]} />
        <meshBasicMaterial color="#08090b" transparent={opacity < 1} opacity={opacity} />
      </mesh>

      {/* Dynamic Island Pill */}
      <group position={[0, height / 2 - 16, 0.4]}>
        <mesh geometry={islandGeo}>
          <meshBasicMaterial color="#000000" />
        </mesh>
        {/* Camera Lens dot */}
        <mesh position={[islandWidth * 0.22, 0, 0.05]}>
          <circleGeometry args={[3.2, 16]} />
          <meshBasicMaterial color="#172554" />
        </mesh>
        {/* Sensor dot */}
        <mesh position={[-islandWidth * 0.24, 0, 0.05]}>
          <circleGeometry args={[2, 12]} />
          <meshBasicMaterial color="#090d16" />
        </mesh>
      </group>

      {/* Side Action Button (Left) */}
      <mesh position={[-chassisW / 2 - 2.5, height * 0.28, -6]}>
        <boxGeometry args={[3, 16, 4]} />
        <meshStandardMaterial color="#262930" metalness={0.9} roughness={0.2} />
      </mesh>

      {/* Side Volume Up Button (Left) */}
      <mesh position={[-chassisW / 2 - 2.5, height * 0.14, -6]}>
        <boxGeometry args={[3, 26, 4]} />
        <meshStandardMaterial color="#262930" metalness={0.9} roughness={0.2} />
      </mesh>

      {/* Side Volume Down Button (Left) */}
      <mesh position={[-chassisW / 2 - 2.5, height * -0.02, -6]}>
        <boxGeometry args={[3, 26, 4]} />
        <meshStandardMaterial color="#262930" metalness={0.9} roughness={0.2} />
      </mesh>

      {/* Side Power Button (Right) */}
      <mesh position={[chassisW / 2 + 2.5, height * 0.12, -6]}>
        <boxGeometry args={[3, 38, 4]} />
        <meshStandardMaterial color="#262930" metalness={0.9} roughness={0.2} />
      </mesh>
    </group>
  );
}

/**
 * MacBook Pro 3D Enclosure:
 * - Space Gray anodized aluminum display frame with top notch
 * - Protruding 3D aluminum unibody keyboard base & hinge
 * - Camera dot reflection
 */
function MacBookProFrame({
  width,
  height,
  opacity,
}: {
  width: number;
  height: number;
  opacity: number;
}) {
  const bezel = 16;
  const frameW = width + bezel * 2;
  const frameH = height + bezel * 2;

  const frameGeo = useMemo(() => {
    const shape = createRoundedRectShape(frameW, frameH, 12);
    return new THREE.ExtrudeGeometry(shape, {
      depth: 6,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 1,
      bevelThickness: 1,
    });
  }, [frameW, frameH]);

  const notchW = Math.min(68, width * 0.2);
  const notchH = 14;
  const notchGeo = useMemo(() => {
    const shape = createRoundedRectShape(notchW, notchH, 4);
    return new THREE.ShapeGeometry(shape);
  }, [notchW, notchH]);

  return (
    <group position={[0, 0, 0]}>
      {/* Aluminum Display Lid Backing */}
      <mesh geometry={frameGeo} position={[0, 0, -8]}>
        <meshStandardMaterial
          color="#18191c"
          metalness={0.82}
          roughness={0.28}
          transparent={opacity < 1}
          opacity={opacity}
        />
      </mesh>

      {/* Display Inner Bezel */}
      <mesh position={[0, 0, -0.4]}>
        <planeGeometry args={[width + 8, height + 8]} />
        <meshBasicMaterial color="#08090b" transparent={opacity < 1} opacity={opacity} />
      </mesh>

      {/* Top Center Camera Notch */}
      <group position={[0, height / 2 - 7, 0.4]}>
        <mesh geometry={notchGeo}>
          <meshBasicMaterial color="#050507" />
        </mesh>
        {/* Camera Lens */}
        <mesh position={[0, 1, 0.05]}>
          <circleGeometry args={[2.5, 16]} />
          <meshBasicMaterial color="#1e293b" />
        </mesh>
      </group>

      {/* MacBook Bottom Base Deck & Hinge */}
      <group position={[0, -height / 2 - 12, -4]}>
        {/* Aluminum Base */}
        <mesh position={[0, 0, 2]}>
          <boxGeometry args={[frameW * 1.08, 14, 22]} />
          <meshStandardMaterial
            color="#22242a"
            metalness={0.8}
            roughness={0.3}
            transparent={opacity < 1}
            opacity={opacity}
          />
        </mesh>
        {/* Center Thumb Opener Notch */}
        <mesh position={[0, 4, 13]}>
          <boxGeometry args={[Math.min(64, width * 0.22), 4, 2]} />
          <meshBasicMaterial color="#101114" />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Safari Browser Window 3D Enclosure:
 * - Modern macOS title bar header
 * - Traffic light buttons (Close red, Minimize yellow, Expand green)
 * - Centered URL address pill
 * - Window chrome border
 */
function BrowserFrame({
  width,
  height,
  opacity,
}: {
  width: number;
  height: number;
  opacity: number;
}) {
  const headerH = 34;
  const totalH = height + headerH;
  const cornerRadius = 10;

  const headerGeo = useMemo(() => {
    const shape = createRoundedRectShape(width, headerH, 6);
    return new THREE.ShapeGeometry(shape);
  }, [width, headerH]);

  const urlBarW = Math.min(260, width * 0.52);
  const urlBarH = 20;
  const urlBarGeo = useMemo(() => {
    const shape = createRoundedRectShape(urlBarW, urlBarH, 4);
    return new THREE.ShapeGeometry(shape);
  }, [urlBarW, urlBarH]);

  return (
    <group position={[0, 0, 0]}>
      {/* Background Frame Shadow Rim */}
      <mesh position={[0, headerH / 2, -1]}>
        <planeGeometry args={[width + 4, totalH + 4]} />
        <meshBasicMaterial color="#141518" transparent={opacity < 1} opacity={opacity * 0.9} />
      </mesh>

      {/* Top Header Chrome */}
      <group position={[0, height / 2 + headerH / 2, 0.2]}>
        <mesh geometry={headerGeo}>
          <meshStandardMaterial
            color="#1b1c21"
            metalness={0.2}
            roughness={0.5}
            transparent={opacity < 1}
            opacity={opacity}
          />
        </mesh>

        {/* 3 macOS Traffic Light Buttons */}
        <group position={[-width / 2 + 18, 0, 0.1]}>
          {/* Close Red */}
          <mesh position={[0, 0, 0]}>
            <circleGeometry args={[4.5, 16]} />
            <meshBasicMaterial color="#ff5f56" />
          </mesh>
          {/* Minimize Yellow */}
          <mesh position={[14, 0, 0]}>
            <circleGeometry args={[4.5, 16]} />
            <meshBasicMaterial color="#ffbd2e" />
          </mesh>
          {/* Expand Green */}
          <mesh position={[28, 0, 0]}>
            <circleGeometry args={[4.5, 16]} />
            <meshBasicMaterial color="#27c93f" />
          </mesh>
        </group>

        {/* Centered URL address bar */}
        <mesh geometry={urlBarGeo} position={[0, 0, 0.1]}>
          <meshBasicMaterial color="#0f1013" />
        </mesh>

        {/* Divider line under title bar */}
        <mesh position={[0, -headerH / 2, 0.15]}>
          <planeGeometry args={[width, 1]} />
          <meshBasicMaterial color="#2d3039" />
        </mesh>
      </group>
    </group>
  );
}
