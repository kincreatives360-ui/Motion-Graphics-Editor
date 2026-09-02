import type { Layer, Transform } from "../store/editor-store";

export interface SnapLine {
  axis: "x" | "y";
  value: number;
  label?: "edge" | "center" | "spacing";
  start?: number;
  end?: number;
}

export interface SnapCandidates {
  x: { value: number; label: "edge" | "center"; sourceLayer?: Layer }[];
  y: { value: number; label: "edge" | "center"; sourceLayer?: Layer }[];
}

export function getSnapCandidates(
  moving: Layer,
  others: Layer[],
  canvasWidth = 1920,
  canvasHeight = 1080,
): SnapCandidates {
  const xs: { value: number; label: "edge" | "center"; sourceLayer?: Layer }[] = [
    { value: 0, label: "edge" },
    { value: canvasWidth / 2, label: "center" },
    { value: canvasWidth, label: "edge" },
  ];
  const ys: { value: number; label: "edge" | "center"; sourceLayer?: Layer }[] = [
    { value: 0, label: "edge" },
    { value: canvasHeight / 2, label: "center" },
    { value: canvasHeight, label: "edge" },
  ];

  for (const l of others) {
    if (l.id === moving.id || !l.visible) continue;
    const { x, y, width, height } = l.transform;
    xs.push(
      { value: x, label: "edge", sourceLayer: l },
      { value: x + width / 2, label: "center", sourceLayer: l },
      { value: x + width, label: "edge", sourceLayer: l },
    );
    ys.push(
      { value: y, label: "edge", sourceLayer: l },
      { value: y + height / 2, label: "center", sourceLayer: l },
      { value: y + height, label: "edge", sourceLayer: l },
    );
  }

  return { x: xs, y: ys };
}

export function snapTransform(
  moving: Transform,
  candidates: SnapCandidates,
  others: Layer[] = [],
  threshold = 6,
): {
  x: number;
  y: number;
  guides: SnapLine[];
} {
  const pointsX = [
    { offset: 0, label: "edge" as const },
    { offset: moving.width / 2, label: "center" as const },
    { offset: moving.width, label: "edge" as const },
  ];

  const pointsY = [
    { offset: 0, label: "edge" as const },
    { offset: moving.height / 2, label: "center" as const },
    { offset: moving.height, label: "edge" as const },
  ];

  let bestDx = 0;
  let bestDy = 0;
  let bestDistX = threshold;
  let bestDistY = threshold;
  let activeSnapX: { value: number; label: "edge" | "center" } | null = null;
  let activeSnapY: { value: number; label: "edge" | "center" } | null = null;

  for (const pt of pointsX) {
    const px = moving.x + pt.offset;
    for (const cand of candidates.x) {
      const d = Math.abs(px - cand.value);
      if (d < bestDistX) {
        bestDistX = d;
        bestDx = cand.value - px;
        activeSnapX = cand;
      }
    }
  }

  for (const pt of pointsY) {
    const py = moving.y + pt.offset;
    for (const cand of candidates.y) {
      const d = Math.abs(py - cand.value);
      if (d < bestDistY) {
        bestDistY = d;
        bestDy = cand.value - py;
        activeSnapY = cand;
      }
    }
  }

  let finalX = moving.x + bestDx;
  let finalY = moving.y + bestDy;

  const guides: SnapLine[] = [];

  if (activeSnapX) {
    guides.push({
      axis: "x",
      value: activeSnapX.value,
      label: activeSnapX.label,
    });
  }

  if (activeSnapY) {
    guides.push({
      axis: "y",
      value: activeSnapY.value,
      label: activeSnapY.label,
    });
  }

  // Equal-spacing snap detection with adjacent others
  if (others.length >= 2) {
    // Check horizontal equal spacing
    const validOthers = others.filter((o) => o.visible);
    for (let i = 0; i < validOthers.length; i++) {
      for (let j = i + 1; j < validOthers.length; j++) {
        const o1 = validOthers[i].transform;
        const o2 = validOthers[j].transform;

        // Order o1 and o2 left to right
        const [left, right] = o1.x < o2.x ? [o1, o2] : [o2, o1];

        // Case 1: moving is in the middle of left and right
        const gapTotal = right.x - (left.x + left.width);
        if (gapTotal > moving.width) {
          const targetGap = (gapTotal - moving.width) / 2;
          const targetX = left.x + left.width + targetGap;
          const d = Math.abs(finalX - targetX);
          if (d < threshold) {
            finalX = targetX;
            guides.push({
              axis: "x",
              value: targetX,
              label: "spacing",
              start: Math.min(left.y, moving.y),
              end: Math.max(left.y + left.height, moving.y + moving.height),
            });
          }
        }

        // Case 2: moving is on the right with equal spacing: dist(o1, o2) == dist(o2, moving)
        const gap1 = right.x - (left.x + left.width);
        if (gap1 > 0) {
          const targetRightX = right.x + right.width + gap1;
          const d = Math.abs(finalX - targetRightX);
          if (d < threshold) {
            finalX = targetRightX;
            guides.push({
              axis: "x",
              value: targetRightX,
              label: "spacing",
            });
          }
        }
      }
    }
  }

  return { x: finalX, y: finalY, guides };
}
