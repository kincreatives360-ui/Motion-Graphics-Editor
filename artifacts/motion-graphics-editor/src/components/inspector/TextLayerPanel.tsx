import React from "react";
import { Type, AlignLeft, AlignCenter, AlignRight, Zap, Sparkles } from "lucide-react";
import { type Layer } from "../../store/editor-store";
import {
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrubbableLabel } from "@/hooks/useScrubbableNumber";
import { LayerEffectsPanel } from "../effects/LayerEffectsPanel";

const FONT_OPTIONS = [
  { label: "Inter", value: "Inter, system-ui, sans-serif" },
  { label: "Roboto", value: "Roboto, sans-serif" },
  { label: "Space Grotesk", value: "Space Grotesk, sans-serif" },
  { label: "Playfair Display", value: "Playfair Display, Georgia, serif" },
  { label: "JetBrains Mono", value: "JetBrains Mono, monospace" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
];

interface TextLayerPanelProps {
  layer: Layer;
  updateLayer: (id: string, changes: Partial<Layer>) => void;
  currentFrame: number;
  addAnimationBlock: (sceneId: string, block: any) => void;
  activeSceneId: string;
}

export function TextLayerPanel({
  layer,
  updateLayer,
  currentFrame,
  addAnimationBlock,
  activeSceneId,
}: TextLayerPanelProps) {
  return (
    <>
      {/* Typography */}
      <AccordionItem value="appearance" className="border-b border-[#202227]" data-testid="section-text-props">
        <AccordionTrigger className="py-2.5 text-[11px] font-semibold tracking-wider text-[#999ba0] uppercase hover:text-[#d8d9dc] hover:no-underline">
          <div className="flex items-center gap-1.5">
            <Type size={12} className="text-[#38bdf8]" />
            <span>Typography</span>
          </div>
        </AccordionTrigger>
        <AccordionContent className="pb-3 pt-0 text-left">
          {/* Text Content */}
          <Label className="field mb-2 block">
            <span className="field-label">Content</span>
            <Textarea
              className="w-full bg-[#1a1b1e] border border-[#2a2c30] rounded p-1.5 text-[9.5px] text-[#d8d9dc] outline-none resize-none focus:border-[#4b7991]"
              rows={2}
              value={layer.text?.content || ""}
              onChange={(e) =>
                updateLayer(layer.id, {
                  text: {
                    ...(layer.text || {
                      fontSize: 32,
                      fontFamily: "Inter",
                      color: "#ffffff",
                      align: "left",
                    }),
                    content: e.target.value,
                  },
                })
              }
              data-testid="textarea-text-content"
            />
          </Label>

          {/* Font Family Select */}
          <Label className="field mb-2 block">
            <span className="field-label">Font Family</span>
            <Select
              value={layer.text?.fontFamily || "Inter, system-ui, sans-serif"}
              onValueChange={(val) =>
                updateLayer(layer.id, {
                  text: {
                    ...(layer.text || {
                      content: "Heading",
                      fontSize: 32,
                      color: "#ffffff",
                      align: "left",
                    }),
                    fontFamily: val,
                  },
                })
              }
              data-testid="select-text-font"
            >
              <SelectTrigger className="select-input">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_OPTIONS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Label>

          {/* Font Size & Color */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <Label className="flex items-center gap-1 bg-[#1a1b1e] border border-[#2a2c30] rounded px-1.5 h-7">
              <ScrubbableLabel
                value={layer.text?.fontSize || 32}
                onChange={(fontSize) =>
                  updateLayer(layer.id, {
                    text: {
                      ...(layer.text || {
                        content: "Text",
                        fontFamily: "Inter",
                        color: "#ffffff",
                        align: "left",
                      }),
                      fontSize: Math.max(8, Math.min(200, Math.round(fontSize))),
                    },
                  })
                }
                min={8}
                max={200}
                step={1}
                className="text-[8.5px] font-mono text-[#6c6e75] hover:text-[#38bdf8] transition-colors select-none"
                title="Drag horizontal to scrub Font Size (Shift: fast, Alt: precision)"
              >
                Size
              </ScrubbableLabel>
              <Input
                type="number"
                min="8"
                max="200"
                className="w-full bg-transparent text-[9.5px] text-[#d8d9dc] outline-none font-mono h-5 border-0 px-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0"
                value={layer.text?.fontSize || 32}
                onChange={(e) =>
                  updateLayer(layer.id, {
                    text: {
                      ...(layer.text || {
                        content: "Text",
                        fontFamily: "Inter",
                        color: "#ffffff",
                        align: "left",
                      }),
                      fontSize: Math.max(8, parseInt(e.target.value) || 32),
                    },
                  })
                }
                data-testid="input-text-size"
              />
            </Label>

            <div className="flex items-center gap-1.5 bg-[#1a1b1e] border border-[#2a2c30] rounded p-1 h-7">
              <input
                type="color"
                className="w-5 h-5 rounded cursor-pointer border-0 p-0 bg-transparent"
                value={
                  layer.text?.color && layer.text.color.startsWith("#")
                    ? layer.text.color
                    : "#ffffff"
                }
                onChange={(e) =>
                  updateLayer(layer.id, {
                    text: {
                      ...(layer.text || {
                        content: "Text",
                        fontFamily: "Inter",
                        fontSize: 32,
                        align: "left",
                      }),
                      color: e.target.value,
                    },
                  })
                }
                data-testid="input-text-color"
              />
              <Input
                type="text"
                className="w-full bg-transparent text-[9px] font-mono text-[#d8d9dc] outline-none border-0 px-0 h-5 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0"
                value={layer.text?.color || "#ffffff"}
                onChange={(e) =>
                  updateLayer(layer.id, {
                    text: {
                      ...(layer.text || {
                        content: "Text",
                        fontFamily: "Inter",
                        fontSize: 32,
                        align: "left",
                      }),
                      color: e.target.value,
                    },
                  })
                }
              />
            </div>
          </div>

          {/* Text Alignment */}
          <div className="field">
            <span className="field-label">Alignment</span>
            <div className="flex items-center gap-1 bg-[#1a1b1e] p-0.5 rounded border border-[#2a2c30]">
              {(["left", "center", "right"] as const).map((alignMode) => (
                <Button
                  key={alignMode}
                  variant="ghost"
                  size="sm"
                  className={`flex-1 flex items-center justify-center py-1 rounded transition-colors ${
                    (layer.text?.align || "left") === alignMode
                      ? "bg-[#25282f] text-white"
                      : "text-[#777a82] hover:text-[#c4c6cc]"
                  }`}
                  onClick={() =>
                    updateLayer(layer.id, {
                      text: {
                        ...(layer.text || {
                          content: "Text",
                          fontSize: 32,
                          fontFamily: "Inter",
                          color: "#ffffff",
                        }),
                        align: alignMode,
                      },
                    })
                  }
                  data-testid={`button-align-${alignMode}`}
                  title={`Align ${alignMode}`}
                >
                  {alignMode === "left" && <AlignLeft size={12} />}
                  {alignMode === "center" && <AlignCenter size={12} />}
                  {alignMode === "right" && <AlignRight size={12} />}
                </Button>
              ))}
            </div>
          </div>

          {/* Kinetic Typography Quick Presets */}
          <div className="mt-3 pt-2 border-t border-[#202227]">
            <span className="field-label text-[8.5px] text-[#38bdf8] flex items-center gap-1 mb-1.5">
              <Zap size={10} className="text-[#38bdf8]" />
              <span>Kinetic Typography Presets</span>
            </span>
            <div className="grid grid-cols-3 gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="py-1 px-1.5 bg-[#16181d] hover:bg-[#20242c] border border-[#272a31] hover:border-[#38bdf8]/50 rounded text-[8px] font-medium text-[#94a3b8] hover:text-white transition-colors"
                onClick={() => {
                  const start = Math.max(0, currentFrame);
                  addAnimationBlock(activeSceneId, {
                    layerId: layer.id,
                    preset: "fade-in",
                    startFrame: start,
                    endFrame: start + 24,
                    easing: "spring",
                  });
                }}
              >
                Pop & Rise
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="py-1 px-1.5 bg-[#16181d] hover:bg-[#20242c] border border-[#272a31] hover:border-[#38bdf8]/50 rounded text-[8px] font-medium text-[#94a3b8] hover:text-white transition-colors"
                onClick={() => {
                  const start = Math.max(0, currentFrame);
                  addAnimationBlock(activeSceneId, {
                    layerId: layer.id,
                    preset: "scale-in",
                    startFrame: start,
                    endFrame: start + 30,
                    easing: "spring",
                  });
                }}
              >
                Punch Scale
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="py-1 px-1.5 bg-[#16181d] hover:bg-[#20242c] border border-[#272a31] hover:border-[#38bdf8]/50 rounded text-[8px] font-medium text-[#94a3b8] hover:text-white transition-colors"
                onClick={() => {
                  const start = Math.max(0, currentFrame);
                  addAnimationBlock(activeSceneId, {
                    layerId: layer.id,
                    preset: "slide-in-left",
                    startFrame: start,
                    endFrame: start + 25,
                    easing: "spring",
                  });
                }}
              >
                Kinetic Slide
              </Button>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Layer Effects (for non-shape layers: rendered after Typography / Appearance) */}
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
