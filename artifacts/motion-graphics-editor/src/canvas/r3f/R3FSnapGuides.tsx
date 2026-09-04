import React from "react";
import type { SnapLine } from "../snapping";
import { focalLength } from "../../store/animation-blocks";

export interface R3FSnapGuidesProps {
  guides: SnapLine[];
  canvasWidth: number;
  canvasHeight: number;
  scaleFactor: number;
  camera?: { x?: number; y?: number; z?: number; fov?: number };
}

export function R3FSnapGuides({
  guides,
  canvasWidth,
  canvasHeight,
  scaleFactor,
  camera,
}: R3FSnapGuidesProps) {
  if (!guides || guides.length === 0) return null;

  const f = camera ? focalLength(camera.fov ?? 60, canvasHeight) : canvasHeight;
  const distance = camera ? Math.max(f * 0.05, f - (camera.z || 0)) : f;
  const scale = camera ? f / distance : 1;
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;
  const camX = camera?.x || 0;
  const camY = camera?.y || 0;

  const projX = (x: number) => (camera ? cx + (x - camX - cx) * scale : x) * scaleFactor;
  const projY = (y: number) => (camera ? cy + (y - camY - cy) * scale : y) * scaleFactor;

  return (
    <svg
      className="absolute inset-0 pointer-events-none z-10 overflow-visible"
      style={{ width: "100%", height: "100%" }}
    >
      {guides.map((guide, idx) => {
        if (guide.axis === "x") {
          const px = projX(guide.value);
          const y1 = projY(guide.start !== undefined ? guide.start : 0);
          const y2 = projY(guide.end !== undefined ? guide.end : canvasHeight);
          return (
            <g key={idx}>
              <line
                x1={px}
                y1={y1}
                x2={px}
                y2={y2}
                stroke="#38bdf8"
                strokeWidth={1.5}
                strokeDasharray="4 4"
              />
              {guide.label === "spacing" && (
                <>
                  <rect x={px - 3} y={projY(guide.start ?? 0) - 3} width={6} height={6} fill="#38bdf8" />
                  <rect x={px - 3} y={projY(guide.end ?? canvasHeight) - 3} width={6} height={6} fill="#38bdf8" />
                </>
              )}
            </g>
          );
        } else {
          const py = projY(guide.value);
          const x1 = projX(guide.start !== undefined ? guide.start : 0);
          const x2 = projX(guide.end !== undefined ? guide.end : canvasWidth);
          return (
            <g key={idx}>
              <line
                x1={x1}
                y1={py}
                x2={x2}
                y2={py}
                stroke="#38bdf8"
                strokeWidth={1.5}
                strokeDasharray="4 4"
              />
              {guide.label === "spacing" && (
                <>
                  <rect x={projX(guide.start ?? 0) - 3} y={py - 3} width={6} height={6} fill="#38bdf8" />
                  <rect x={projX(guide.end ?? canvasWidth) - 3} y={py - 3} width={6} height={6} fill="#38bdf8" />
                </>
              )}
            </g>
          );
        }
      })}
    </svg>
  );
}

