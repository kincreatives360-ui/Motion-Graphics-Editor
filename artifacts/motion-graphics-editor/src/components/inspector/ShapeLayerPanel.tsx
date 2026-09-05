import React from "react";
import { Square, Sparkles } from "lucide-react";
import { type Layer } from "../../store/editor-store";
import {
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrubbableLabel } from "@/hooks/useScrubbableNumber";
import { LayerEffectsPanel } from "../effects/LayerEffectsPanel";

interface ShapeLayerPanelProps {
  layer: Layer;
  updateLayer: (id: string, changes: Partial<Layer>) => void;
}

export function ShapeLayerPanel({ layer, updateLayer }: ShapeLayerPanelProps) {
  return (
    <>
      {/* Shape Appearance */}
      <AccordionItem value="appearance" className="border-b border-[#202227]" data-testid="section-shape-props">
        <AccordionTrigger className="py-2.5 text-[11px] font-semibold tracking-wider text-[#999ba0] uppercase hover:text-[#d8d9dc] hover:no-underline">
          <div className="flex items-center gap-1.5">
            <Square size={12} className="text-[#38bdf8]" />
            <span>Shape Appearance</span>
          </div>
        </AccordionTrigger>
        <AccordionContent className="pb-3 pt-0 text-left">
          {/* Shape Kind */}
          <div className="field mb-2">
            <span className="field-label">Type</span>
            <div className="grid grid-cols-3 gap-1 bg-[#1a1b1e] p-0.5 rounded border border-[#2a2c30]">
              <Button
                variant="ghost"
                size="sm"
                className={`py-1 text-[9px] rounded font-medium transition-colors ${
                  layer.shape?.kind === "rect" ||
                  (!layer.shape?.kind && !layer.shape?.path)
                    ? "bg-[#25282f] text-white"
                    : "text-[#80838a] hover:text-[#d0d2d6]"
                }`}
                onClick={() =>
                  updateLayer(layer.id, {
                    shape: {
                      ...(layer.shape || { fill: "#38bdf8" }),
                      kind: "rect",
                    },
                  })
                }
                data-testid="button-shape-rect"
              >
                Rectangle
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={`py-1 text-[9px] rounded font-medium transition-colors ${
                  layer.shape?.kind === "ellipse"
                    ? "bg-[#25282f] text-white"
                    : "text-[#80838a] hover:text-[#d0d2d6]"
                }`}
                onClick={() =>
                  updateLayer(layer.id, {
                    shape: {
                      ...(layer.shape || { fill: "#38bdf8" }),
                      kind: "ellipse",
                    },
                  })
                }
                data-testid="button-shape-ellipse"
              >
                Ellipse
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={`py-1 text-[9px] rounded font-medium transition-colors ${
                  layer.shape?.kind === "path" || layer.shape?.path
                    ? "bg-[#25282f] text-[#38bdf8]"
                    : "text-[#80838a] hover:text-[#d0d2d6]"
                }`}
                onClick={() =>
                  updateLayer(layer.id, {
                    shape: {
                      ...(layer.shape || { fill: "#38bdf8" }),
                      kind: "path",
                    },
                  })
                }
                data-testid="button-shape-path"
              >
                Path
              </Button>
            </div>
          </div>

          {/* Path data viewer if vector path */}
          {layer.shape?.path && (
            <div className="field mb-2">
              <span className="field-label">SVG Path Data</span>
              <Input
                type="text"
                readOnly
                className="w-full bg-[#16181d] border border-[#262930] rounded text-[8.5px] font-mono text-[#94a3b8] px-2 py-1 outline-none truncate select-all"
                value={layer.shape.path}
                title={layer.shape.path}
              />
            </div>
          )}

          {/* Fill Color */}
          <div className="field mb-2">
            <span className="field-label">Fill Color</span>
            <div className="flex items-center gap-1.5 bg-[#1a1b1e] border border-[#2a2c30] rounded p-1 h-7">
              <input
                type="color"
                className="w-5 h-5 rounded cursor-pointer border-0 p-0 bg-transparent"
                value={
                  layer.shape?.fill && layer.shape.fill.startsWith("#")
                    ? layer.shape.fill
                    : "#38bdf8"
                }
                onChange={(e) =>
                  updateLayer(layer.id, {
                    shape: {
                      ...(layer.shape || { kind: "rect" }),
                      fill: e.target.value,
                    },
                  })
                }
                data-testid="input-shape-fill"
              />
              <Input
                type="text"
                className="w-full bg-transparent text-[9px] font-mono text-[#d8d9dc] outline-none border-0 px-0 h-5 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0"
                value={layer.shape?.fill || "#38bdf8"}
                onChange={(e) =>
                  updateLayer(layer.id, {
                    shape: {
                      ...(layer.shape || { kind: "rect" }),
                      fill: e.target.value,
                    },
                  })
                }
              />
            </div>
          </div>

          {/* Stroke Color & Width */}
          <div className="field mb-0">
            <span className="field-label">Stroke</span>
            <div className="grid grid-cols-3 gap-1.5">
              <div className="col-span-2 flex items-center gap-1.5 bg-[#1a1b1e] border border-[#2a2c30] rounded p-1 h-7">
                <input
                  type="color"
                  className="w-5 h-5 rounded cursor-pointer border-0 p-0 bg-transparent"
                  value={
                    layer.shape?.stroke && layer.shape.stroke.startsWith("#")
                      ? layer.shape.stroke
                      : "#0284c7"
                  }
                  onChange={(e) =>
                    updateLayer(layer.id, {
                      shape: {
                        ...(layer.shape || { kind: "rect", fill: "#38bdf8" }),
                        stroke: e.target.value,
                      },
                    })
                  }
                  data-testid="input-shape-stroke"
                />
                <Input
                  type="text"
                  className="w-full bg-transparent text-[9px] font-mono text-[#d8d9dc] outline-none border-0 px-0 h-5 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  value={layer.shape?.stroke || "#0284c7"}
                  onChange={(e) =>
                    updateLayer(layer.id, {
                      shape: {
                        ...(layer.shape || { kind: "rect", fill: "#38bdf8" }),
                        stroke: e.target.value,
                      },
                    })
                  }
                />
              </div>
              <Label className="flex items-center gap-1 bg-[#1a1b1e] border border-[#2a2c30] rounded px-1.5 h-7">
                <ScrubbableLabel
                  value={layer.shape?.strokeWidth ?? 2}
                  onChange={(w) =>
                    updateLayer(layer.id, {
                      shape: {
                        ...(layer.shape || { kind: "rect", fill: "#38bdf8" }),
                        strokeWidth: Math.max(0, Math.round(w)),
                      },
                    })
                  }
                  min={0}
                  max={50}
                  step={1}
                  className="text-[8.5px] font-mono text-[#6c6e75] hover:text-[#38bdf8] transition-colors select-none"
                  title="Drag horizontal to scrub Stroke Width (Shift: fast, Alt: precision)"
                >
                  px
                </ScrubbableLabel>
                <Input
                  type="number"
                  min="0"
                  max="50"
                  className="w-full bg-transparent text-[9px] text-[#d8d9dc] outline-none font-mono h-5 border-0 px-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  value={layer.shape?.strokeWidth ?? 2}
                  onChange={(e) =>
                    updateLayer(layer.id, {
                      shape: {
                        ...(layer.shape || { kind: "rect", fill: "#38bdf8" }),
                        strokeWidth: Math.max(0, parseInt(e.target.value) || 0),
                      },
                    })
                  }
                  data-testid="input-shape-stroke-width"
                />
              </Label>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Layer Effects (for shape layers: after Shape Appearance, before Typography) */}
      <AccordionItem value="layer-effects" className="border-b border-[#202227]" data-testid="section-layer-effects">
        <AccordionTrigger className="py-2.5 text-[11px] font-semibold tracking-wider text-[#999ba0] uppercase hover:text-[#d8d9dc] hover:no-underline">
          <div className="flex items-center gap-1.5">
            <Sparkles size={12} className="text-[#38bdf8]" />
            <span>Layer Effects</span>
          </div>
        </AccordionTrigger>
        <AccordionContent className="pb-3 pt-0 text-left">
          <LayerEffectsPanel layer={layer} />
        </AccordionContent>
      </AccordionItem>
    </>
  );
}
