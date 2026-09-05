import React, { useRef, useCallback } from "react";
import { ScrubbableLabel } from "@/hooks/useScrubbableNumber";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface CubicBezierEditorProps {
  value?: [number, number, number, number];
  onChange: (value: [number, number, number, number]) => void;
}

const PRESETS: Array<{ name: string; curve: [number, number, number, number] }> = [
  { name: "Ease", curve: [0.25, 0.1, 0.25, 1.0] },
  { name: "Ease In", curve: [0.42, 0.0, 1.0, 1.0] },
  { name: "Ease Out", curve: [0.0, 0.0, 0.58, 1.0] },
  { name: "Ease In Out", curve: [0.42, 0.0, 0.58, 1.0] },
  { name: "Linear", curve: [0.0, 0.0, 1.0, 1.0] },
];

export function CubicBezierEditor({
  value = [0.25, 0.1, 0.25, 1.0],
  onChange,
}: CubicBezierEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const activeHandleRef = useRef<"p1" | "p2" | null>(null);

  const [x1, y1, x2, y2] = value;

  // Viewbox coordinates:
  // We use a 140x110 viewbox where the unit square [0,1]x[0,1] is mapped with padding:
  // padding = 20, boxWidth = 100, boxHeight = 70
  // x: [0, 1] -> [padding, padding + boxWidth] = [20, 120]
  // y: [0, 1] -> [padding + boxHeight, padding] = [90, 20] (SVG Y is inverted)
  const padX = 20;
  const padY = 20;
  const boxW = 100;
  const boxH = 70;

  const toSvgX = (nx: number) => padX + nx * boxW;
  const toSvgY = (ny: number) => padY + boxH - ny * boxH;

  const fromSvgX = (sx: number) => Math.max(0, Math.min(1, (sx - padX) / boxW));
  const fromSvgY = (sy: number) =>
    Math.max(-0.4, Math.min(1.4, (padY + boxH - sy) / boxH));

  const startX = toSvgX(0);
  const startY = toSvgY(0);
  const endX = toSvgX(1);
  const endY = toSvgY(1);

  const p1X = toSvgX(x1);
  const p1Y = toSvgY(y1);
  const p2X = toSvgX(x2);
  const p2Y = toSvgY(y2);

  const pathD = `M ${startX} ${startY} C ${p1X} ${p1Y}, ${p2X} ${p2Y}, ${endX} ${endY}`;

  const updateHandle = useCallback(
    (e: React.PointerEvent) => {
      if (!svgRef.current || !activeHandleRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;

      // scale from rendered size to 140x110 viewbox
      const scaleX = 140 / rect.width;
      const scaleY = 110 / rect.height;

      const svgX = clientX * scaleX;
      const svgY = clientY * scaleY;

      const normX = Number(fromSvgX(svgX).toFixed(3));
      const normY = Number(fromSvgY(svgY).toFixed(3));

      if (activeHandleRef.current === "p1") {
        onChange([normX, normY, x2, y2]);
      } else if (activeHandleRef.current === "p2") {
        onChange([x1, y1, normX, normY]);
      }
    },
    [x1, y1, x2, y2, onChange],
  );

  const handlePointerDown = (
    handle: "p1" | "p2",
    e: React.PointerEvent<SVGCircleElement>,
  ) => {
    e.stopPropagation();
    activeHandleRef.current = handle;
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (activeHandleRef.current) {
      updateHandle(e);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeHandleRef.current) {
      activeHandleRef.current = null;
      try {
        (e.target as Element).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

  const handleKeyP1 = (e: React.KeyboardEvent) => {
    let nx = x1;
    let ny = y1;
    const step = e.shiftKey ? 0.1 : 0.02;
    if (e.key === "ArrowLeft") { nx = Math.max(0, nx - step); e.preventDefault(); }
    else if (e.key === "ArrowRight") { nx = Math.min(1, nx + step); e.preventDefault(); }
    else if (e.key === "ArrowUp") { ny = Math.min(1.4, ny + step); e.preventDefault(); }
    else if (e.key === "ArrowDown") { ny = Math.max(-0.4, ny - step); e.preventDefault(); }
    if (nx !== x1 || ny !== y1) {
      onChange([Number(nx.toFixed(3)), Number(ny.toFixed(3)), x2, y2]);
    }
  };

  const handleKeyP2 = (e: React.KeyboardEvent) => {
    let nx = x2;
    let ny = y2;
    const step = e.shiftKey ? 0.1 : 0.02;
    if (e.key === "ArrowLeft") { nx = Math.max(0, nx - step); e.preventDefault(); }
    else if (e.key === "ArrowRight") { nx = Math.min(1, nx + step); e.preventDefault(); }
    else if (e.key === "ArrowUp") { ny = Math.min(1.4, ny + step); e.preventDefault(); }
    else if (e.key === "ArrowDown") { ny = Math.max(-0.4, ny - step); e.preventDefault(); }
    if (nx !== x2 || ny !== y2) {
      onChange([x1, y1, Number(nx.toFixed(3)), Number(ny.toFixed(3))]);
    }
  };

  return (
    <div className="flex flex-col gap-2 p-2 bg-[#141518] rounded border border-[#23252a]">
      <div className="flex items-center justify-between text-[9px]">
        <span className="text-[#8e9198] font-medium">Curve Editor</span>
        <span className="font-mono text-[#38bdf8] text-[8.5px]">
          ({x1.toFixed(2)}, {y1.toFixed(2)}, {x2.toFixed(2)}, {y2.toFixed(2)})
        </span>
      </div>

      {/* Interactive SVG canvas */}
      <div className="relative w-full aspect-[14/11] bg-[#0d0e10] rounded border border-[#1f2126] overflow-hidden">
        <svg
          ref={svgRef}
          viewBox="0 0 140 110"
          role="img"
          aria-label={`Cubic bezier curve: handle 1 at ${x1.toFixed(2)}, ${y1.toFixed(2)}; handle 2 at ${x2.toFixed(2)}, ${y2.toFixed(2)}`}
          className="w-full h-full select-none cursor-crosshair"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {/* Unit square grid bounds */}
          <rect
            x={padX}
            y={padY}
            width={boxW}
            height={boxH}
            fill="none"
            stroke="#1d2026"
            strokeWidth="1"
            strokeDasharray="2 2"
          />

          {/* Diagonal reference line (linear) */}
          <line
            x1={startX}
            y1={startY}
            x2={endX}
            y2={endY}
            stroke="#20232a"
            strokeWidth="1"
          />

          {/* Handle line 1 */}
          <line
            x1={startX}
            y1={startY}
            x2={p1X}
            y2={p1Y}
            stroke="#0ea5e9"
            strokeWidth="1.2"
            strokeOpacity="0.7"
          />

          {/* Handle line 2 */}
          <line
            x1={endX}
            y1={endY}
            x2={p2X}
            y2={p2Y}
            stroke="#f59e0b"
            strokeWidth="1.2"
            strokeOpacity="0.7"
          />

          {/* Bezier Curve */}
          <path
            d={pathD}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2"
            strokeLinecap="round"
          />

          {/* Start and End Anchor points */}
          <circle cx={startX} cy={startY} r="3" fill="#64748b" />
          <circle cx={endX} cy={endY} r="3" fill="#64748b" />

          {/* Control Point 1 */}
          <circle
            cx={p1X}
            cy={p1Y}
            r="5"
            fill="#0284c7"
            stroke="#ffffff"
            strokeWidth="1.5"
            tabIndex={0}
            role="slider"
            aria-label={`Handle 1: X ${x1.toFixed(2)}, Y ${y1.toFixed(2)}. Use arrow keys to adjust`}
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={x1}
            onKeyDown={handleKeyP1}
            className="cursor-pointer hover:scale-125 focus:ring-2 focus:ring-[#38bdf8] outline-none transition-transform"
            onPointerDown={(e) => handlePointerDown("p1", e)}
          />

          {/* Control Point 2 */}
          <circle
            cx={p2X}
            cy={p2Y}
            r="5"
            fill="#d97706"
            stroke="#ffffff"
            strokeWidth="1.5"
            tabIndex={0}
            role="slider"
            aria-label={`Handle 2: X ${x2.toFixed(2)}, Y ${y2.toFixed(2)}. Use arrow keys to adjust`}
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={x2}
            onKeyDown={handleKeyP2}
            className="cursor-pointer hover:scale-125 focus:ring-2 focus:ring-[#f59e0b] outline-none transition-transform"
            onPointerDown={(e) => handlePointerDown("p2", e)}
          />
        </svg>
      </div>

      {/* Numeric inputs for fine-grain editing with labels */}
      <div className="grid grid-cols-4 gap-1.5 pt-0.5">
        <div>
          <ScrubbableLabel
            value={x1}
            onChange={(newX1) => onChange([Math.max(0, Math.min(1, Math.round(newX1 * 100) / 100)), y1, x2, y2])}
            min={0}
            max={1}
            step={0.01}
            className="text-[8px] text-[#717684] block font-mono hover:text-[#38bdf8] transition-colors select-none"
            title="Drag horizontal to scrub X1 (Shift: fast, Alt: precision)"
          >
            X1
          </ScrubbableLabel>
          <Input
            id="bezier-p1-x"
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={x1}
            aria-label="Handle 1 X coordinate"
            onChange={(e) => onChange([Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)), y1, x2, y2])}
            className="w-full bg-[#111317] border border-[#23262d] rounded px-1 py-0.5 text-[8.5px] font-mono text-[#cbd5e1] focus:border-[#38bdf8] outline-none"
          />
        </div>
        <div>
          <ScrubbableLabel
            value={y1}
            onChange={(newY1) => onChange([x1, Math.max(-0.4, Math.min(1.4, Math.round(newY1 * 100) / 100)), x2, y2])}
            min={-0.4}
            max={1.4}
            step={0.01}
            className="text-[8px] text-[#717684] block font-mono hover:text-[#38bdf8] transition-colors select-none"
            title="Drag horizontal to scrub Y1 (Shift: fast, Alt: precision)"
          >
            Y1
          </ScrubbableLabel>
          <Input
            id="bezier-p1-y"
            type="number"
            min={-0.4}
            max={1.4}
            step={0.05}
            value={y1}
            aria-label="Handle 1 Y coordinate"
            onChange={(e) => onChange([x1, Math.max(-0.4, Math.min(1.4, parseFloat(e.target.value) || 0)), x2, y2])}
            className="w-full bg-[#111317] border border-[#23262d] rounded px-1 py-0.5 text-[8.5px] font-mono text-[#cbd5e1] focus:border-[#38bdf8] outline-none"
          />
        </div>
        <div>
          <ScrubbableLabel
            value={x2}
            onChange={(newX2) => onChange([x1, y1, Math.max(0, Math.min(1, Math.round(newX2 * 100) / 100)), y2])}
            min={0}
            max={1}
            step={0.01}
            className="text-[8px] text-[#717684] block font-mono hover:text-[#38bdf8] transition-colors select-none"
            title="Drag horizontal to scrub X2 (Shift: fast, Alt: precision)"
          >
            X2
          </ScrubbableLabel>
          <Input
            id="bezier-p2-x"
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={x2}
            aria-label="Handle 2 X coordinate"
            onChange={(e) => onChange([x1, y1, Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)), y2])}
            className="w-full bg-[#111317] border border-[#23262d] rounded px-1 py-0.5 text-[8.5px] font-mono text-[#cbd5e1] focus:border-[#38bdf8] outline-none"
          />
        </div>
        <div>
          <ScrubbableLabel
            value={y2}
            onChange={(newY2) => onChange([x1, y1, x2, Math.max(-0.4, Math.min(1.4, Math.round(newY2 * 100) / 100))])}
            min={-0.4}
            max={1.4}
            step={0.01}
            className="text-[8px] text-[#717684] block font-mono hover:text-[#38bdf8] transition-colors select-none"
            title="Drag horizontal to scrub Y2 (Shift: fast, Alt: precision)"
          >
            Y2
          </ScrubbableLabel>
          <Input
            id="bezier-p2-y"
            type="number"
            min={-0.4}
            max={1.4}
            step={0.05}
            value={y2}
            aria-label="Handle 2 Y coordinate"
            onChange={(e) => onChange([x1, y1, x2, Math.max(-0.4, Math.min(1.4, parseFloat(e.target.value) || 0))])}
            className="w-full bg-[#111317] border border-[#23262d] rounded px-1 py-0.5 text-[8.5px] font-mono text-[#cbd5e1] focus:border-[#38bdf8] outline-none"
          />
        </div>
      </div>

      {/* Preset pills */}
      <div className="flex flex-wrap gap-1 pt-1" role="toolbar" aria-label="Cubic bezier presets">
        {PRESETS.map((preset) => {
          const isSelected =
            preset.curve[0] === x1 &&
            preset.curve[1] === y1 &&
            preset.curve[2] === x2 &&
            preset.curve[3] === y2;
          return (
            <Button
              key={preset.name}
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={isSelected}
              aria-label={`Apply ${preset.name} easing curve`}
              className={`px-1.5 py-0.5 text-[8.5px] rounded transition-colors ${
                isSelected
                  ? "bg-[#0369a1] text-white font-medium"
                  : "bg-[#1d1f24] hover:bg-[#272a31] text-[#9ca0a8]"
              }`}
              onClick={() => onChange([...preset.curve])}
            >
              {preset.name}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
