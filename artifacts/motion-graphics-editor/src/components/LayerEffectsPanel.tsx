import React from "react";
import { Sliders, Plus, Trash2, Eye, EyeOff } from "lucide-react";
import {
  useEditorStore,
  CANONICAL_LAYER_EFFECTS,
  type LayerEffectKey,
  type Layer,
} from "../store/editor-store";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

export const LAYER_EFFECT_LABELS: Record<LayerEffectKey, string> = {
  dropShadow: "Drop shadow",
  glow: "Glow",
  backdropBlur: "Backdrop blur",
  layerBlur: "Layer blur",
  liquidGlass: "Liquid glass",
};

export function LayerEffectsPanel({ layer }: { layer: Layer }) {
  const addLayerEffect = useEditorStore((state) => state.addLayerEffect);
  const removeLayerEffect = useEditorStore((state) => state.removeLayerEffect);
  const swapLayerEffect = useEditorStore((state) => state.swapLayerEffect);
  const updateLayerEffects = useEditorStore((state) => state.updateLayerEffects);

  const layerEffects = layer.layerEffects || {};
  const activeOrder: LayerEffectKey[] = layerEffects.layerEffectsOrder || [];

  // Filter out layerBlur if layer has 3D extrusion depth > 0 or has a device frame
  const isExtrudedOrDeviceFrame = (layer.depth ?? 0) > 0 || (!!layer.mockupFrame && (layer.mockupFrame as string) !== "none") || (!!layer.mockup && (layer.mockup as string) !== "none");

  const availableCanonical = CANONICAL_LAYER_EFFECTS.filter((key) => {
    if (key === "layerBlur" && isExtrudedOrDeviceFrame) return false;
    return true;
  });

  const unaddedEffects = availableCanonical.filter(
    (key) => !activeOrder.includes(key),
  );
  const allAdded = unaddedEffects.length === 0;

  return (
    <div className="section-layer-effects space-y-2 mb-3">
      {/* Header Row */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase font-mono tracking-wider text-[#8e9198]">
          Layer effects
        </span>

        {/* Add Effect Dropdown */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={allAdded}
                  className={`py-1 px-1.5 text-[9px] font-medium rounded border inline-flex items-center gap-1 shadow-sm transition-colors ${
                    allAdded
                      ? "bg-[#18191d] text-[#555861] border-[#25272e] cursor-not-allowed opacity-60"
                      : "bg-[#1d1f24] hover:bg-[#252830] text-[#38bdf8] border-[#2d313b]"
                  }`}
                  data-testid="button-add-layer-effect"
                >
                  <Plus size={10} strokeWidth={2} />
                  <span>Add</span>
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            {allAdded && (
              <TooltipContent className="bg-[#18191d] text-[#e2e8f0] text-[9px] border border-[#2d313b]">
                All effects added.
              </TooltipContent>
            )}
          </Tooltip>

          {!allAdded && (
            <DropdownMenuContent
              align="end"
              className="w-44 bg-[#14161a] border border-[#26282e] text-[#cfd3dc] text-[9.5px] shadow-2xl rounded-md p-1 outline-none"
            >
              <DropdownMenuLabel className="text-[8px] uppercase tracking-wider text-[#38bdf8] font-mono px-2 py-1 flex items-center justify-between">
                <span>Add Layer Effect</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-[#20232a] my-1" />
              {unaddedEffects.map((key) => (
                <DropdownMenuItem
                  key={key}
                  className="cursor-pointer hover:bg-[#1a2c3d] hover:text-[#38bdf8] px-2 py-1 rounded-[3px] text-[9.5px] text-[#cbd5e1]"
                  onClick={() => addLayerEffect(layer.id, key)}
                  data-testid={`menu-add-layer-effect-${key}`}
                >
                  {LAYER_EFFECT_LABELS[key]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          )}
        </DropdownMenu>
      </div>

      {/* Added Layer Effects Rows */}
      {activeOrder.length === 0 ? (
        <div className="text-[9px] text-[#63666d] bg-[#14161a] border border-[#22252c] rounded p-2 text-center">
          No layer effects added
        </div>
      ) : (
        <div className="space-y-1.5">
          {activeOrder.map((key) => {
            const effectData = (layerEffects as any)[key] || {};
            const isEnabled = effectData.enabled !== false;

            return (
              <div
                key={key}
                className="bg-[#16181c] border border-[#252830] rounded p-1.5 flex items-center justify-between text-[9.5px]"
                data-testid={`layer-effect-row-${key}`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  {/* Settings Popover Button */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="p-1 rounded bg-[#1e2026] hover:bg-[#282b34] text-[#38bdf8] transition-colors"
                        title={`${LAYER_EFFECT_LABELS[key]} settings`}
                      >
                        <Sliders size={11} />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      side="left"
                      align="start"
                      className="w-56 bg-[#14161a] border border-[#26282e] p-3 text-[#d8d9dc] shadow-2xl rounded-md space-y-3"
                    >
                      <div className="text-[10px] font-semibold text-[#38bdf8] border-b border-[#20232a] pb-1 font-mono">
                        {LAYER_EFFECT_LABELS[key]} Controls
                      </div>

                      {/* Drop Shadow */}
                      {key === "dropShadow" && (
                        <div className="space-y-2 text-[9px]">
                          <div className="grid grid-cols-2 gap-1.5">
                            <div>
                              <span className="text-[#81838a] block mb-0.5">Offset X</span>
                              <input
                                type="number"
                                className="w-full bg-[#1c1e24] border border-[#2a2d36] rounded p-1 text-center font-mono text-white"
                                value={effectData.offsetX ?? 4}
                                onChange={(e) =>
                                  updateLayerEffects(layer.id, {
                                    dropShadow: { ...effectData, offsetX: parseFloat(e.target.value) || 0 },
                                  })
                                }
                              />
                            </div>
                            <div>
                              <span className="text-[#81838a] block mb-0.5">Offset Y</span>
                              <input
                                type="number"
                                className="w-full bg-[#1c1e24] border border-[#2a2d36] rounded p-1 text-center font-mono text-white"
                                value={effectData.offsetY ?? 8}
                                onChange={(e) =>
                                  updateLayerEffects(layer.id, {
                                    dropShadow: { ...effectData, offsetY: parseFloat(e.target.value) || 0 },
                                  })
                                }
                              />
                            </div>
                          </div>

                          <div>
                            <div className="flex justify-between text-[#81838a] mb-1">
                              <span>Blur Radius</span>
                              <span className="font-mono text-white">{effectData.blur ?? 16}px</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="60"
                              step="1"
                              className="w-full h-1 bg-[#282a30] rounded appearance-none accent-[#38bdf8]"
                              value={effectData.blur ?? 16}
                              onChange={(e) =>
                                updateLayerEffects(layer.id, {
                                  dropShadow: { ...effectData, blur: parseFloat(e.target.value) },
                                })
                              }
                            />
                          </div>

                          <div>
                            <div className="flex justify-between text-[#81838a] mb-1">
                              <span>Opacity</span>
                              <span className="font-mono text-white">
                                {Math.round((effectData.opacity ?? 0.4) * 100)}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.05"
                              className="w-full h-1 bg-[#282a30] rounded appearance-none accent-[#38bdf8]"
                              value={effectData.opacity ?? 0.4}
                              onChange={(e) =>
                                updateLayerEffects(layer.id, {
                                  dropShadow: { ...effectData, opacity: parseFloat(e.target.value) },
                                })
                              }
                            />
                          </div>

                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[#81838a]">Shadow Color</span>
                            <input
                              type="color"
                              className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
                              value={effectData.color || "#000000"}
                              onChange={(e) =>
                                updateLayerEffects(layer.id, {
                                  dropShadow: { ...effectData, color: e.target.value },
                                })
                              }
                            />
                          </div>
                        </div>
                      )}

                      {/* Glow */}
                      {key === "glow" && (
                        <div className="space-y-2 text-[9px]">
                          <div>
                            <div className="flex justify-between text-[#81838a] mb-1">
                              <span>Glow Intensity</span>
                              <span className="font-mono text-white">{effectData.intensity ?? 1.0}</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="3"
                              step="0.1"
                              className="w-full h-1 bg-[#282a30] rounded appearance-none accent-[#38bdf8]"
                              value={effectData.intensity ?? 1.0}
                              onChange={(e) =>
                                updateLayerEffects(layer.id, {
                                  glow: { ...effectData, intensity: parseFloat(e.target.value) },
                                })
                              }
                            />
                          </div>

                          <div>
                            <div className="flex justify-between text-[#81838a] mb-1">
                              <span>Blur Radius</span>
                              <span className="font-mono text-white">{effectData.blur ?? 20}px</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="60"
                              step="1"
                              className="w-full h-1 bg-[#282a30] rounded appearance-none accent-[#38bdf8]"
                              value={effectData.blur ?? 20}
                              onChange={(e) =>
                                updateLayerEffects(layer.id, {
                                  glow: { ...effectData, blur: parseFloat(e.target.value) },
                                })
                              }
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-1.5">
                            <div>
                              <span className="text-[#81838a] block mb-0.5">Mode</span>
                              <select
                                className="w-full bg-[#1c1e24] border border-[#2a2d36] rounded p-1 text-[9px] text-white"
                                value={effectData.mode || "fill"}
                                onChange={(e) =>
                                  updateLayerEffects(layer.id, {
                                    glow: { ...effectData, mode: e.target.value as "edge" | "fill" },
                                  })
                                }
                              >
                                <option value="fill">Fill</option>
                                <option value="edge">Edge</option>
                              </select>
                            </div>
                            <div>
                              <span className="text-[#81838a] block mb-0.5">Blend</span>
                              <select
                                className="w-full bg-[#1c1e24] border border-[#2a2d36] rounded p-1 text-[9px] text-white"
                                value={effectData.blend || "add"}
                                onChange={(e) =>
                                  updateLayerEffects(layer.id, {
                                    glow: { ...effectData, blend: e.target.value as "add" | "normal" },
                                  })
                                }
                              >
                                <option value="add">Add</option>
                                <option value="normal">Normal</option>
                              </select>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[#81838a]">Glow Color</span>
                            <input
                              type="color"
                              className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
                              value={effectData.color || "#38bdf8"}
                              onChange={(e) =>
                                updateLayerEffects(layer.id, {
                                  glow: { ...effectData, color: e.target.value },
                                })
                              }
                            />
                          </div>
                        </div>
                      )}

                      {/* Backdrop Blur */}
                      {key === "backdropBlur" && (
                        <div className="space-y-2 text-[9px]">
                          <div>
                            <div className="flex justify-between text-[#81838a] mb-1">
                              <span>Blur Amount</span>
                              <span className="font-mono text-white">{effectData.blur ?? 12}px</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="40"
                              step="1"
                              className="w-full h-1 bg-[#282a30] rounded appearance-none accent-[#38bdf8]"
                              value={effectData.blur ?? 12}
                              onChange={(e) =>
                                updateLayerEffects(layer.id, {
                                  backdropBlur: { ...effectData, blur: parseFloat(e.target.value) },
                                })
                              }
                            />
                          </div>
                        </div>
                      )}

                      {/* Layer Blur */}
                      {key === "layerBlur" && (
                        <div className="space-y-2 text-[9px]">
                          <div>
                            <div className="flex justify-between text-[#81838a] mb-1">
                              <span>Blur Radius</span>
                              <span className="font-mono text-white">{effectData.blur ?? 8}px</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="40"
                              step="1"
                              className="w-full h-1 bg-[#282a30] rounded appearance-none accent-[#38bdf8]"
                              value={effectData.blur ?? 8}
                              onChange={(e) =>
                                updateLayerEffects(layer.id, {
                                  layerBlur: { ...effectData, blur: parseFloat(e.target.value) },
                                })
                              }
                            />
                          </div>

                          <div>
                            <span className="text-[#81838a] block mb-0.5">Mode</span>
                            <select
                              className="w-full bg-[#1c1e24] border border-[#2a2d36] rounded p-1 text-[9px] text-white"
                              value={effectData.mode || "uniform"}
                              onChange={(e) =>
                                updateLayerEffects(layer.id, {
                                  layerBlur: { ...effectData, mode: e.target.value as "uniform" | "progressive" },
                                })
                              }
                            >
                              <option value="uniform">Uniform</option>
                              <option value="progressive">Progressive (Gradient)</option>
                            </select>
                          </div>
                        </div>
                      )}

                      {/* Liquid Glass */}
                      {key === "liquidGlass" && (
                        <div className="space-y-2 text-[9px]">
                          <div>
                            <div className="flex justify-between text-[#81838a] mb-1">
                              <span>Refraction</span>
                              <span className="font-mono text-white">
                                {Math.round((effectData.refraction ?? 0.3) * 100)}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.05"
                              className="w-full h-1 bg-[#282a30] rounded appearance-none accent-[#38bdf8]"
                              value={effectData.refraction ?? 0.3}
                              onChange={(e) =>
                                updateLayerEffects(layer.id, {
                                  liquidGlass: { ...effectData, refraction: parseFloat(e.target.value) },
                                })
                              }
                            />
                          </div>
                          <div>
                            <div className="flex justify-between text-[#81838a] mb-1">
                              <span>Dispersion</span>
                              <span className="font-mono text-white">
                                {Math.round((effectData.dispersion ?? 0.2) * 100)}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.05"
                              className="w-full h-1 bg-[#282a30] rounded appearance-none accent-[#38bdf8]"
                              value={effectData.dispersion ?? 0.2}
                              onChange={(e) =>
                                updateLayerEffects(layer.id, {
                                  liquidGlass: { ...effectData, dispersion: parseFloat(e.target.value) },
                                })
                              }
                            />
                          </div>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>

                  {/* Type Swap Dropdown */}
                  <select
                    className="bg-[#1a1b1f] border border-[#26282e] rounded text-[9px] text-[#d8d9dc] px-1 py-0.5 outline-none font-medium cursor-pointer"
                    value={key}
                    onChange={(e) =>
                      swapLayerEffect(layer.id, key, e.target.value as LayerEffectKey)
                    }
                    data-testid={`select-swap-layer-effect-${key}`}
                  >
                    <option value={key}>{LAYER_EFFECT_LABELS[key]}</option>
                    {unaddedEffects.map((optKey) => (
                      <option key={optKey} value={optKey}>
                        {LAYER_EFFECT_LABELS[optKey]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  {/* Eye Toggle */}
                  <button
                    type="button"
                    className={`p-1 rounded transition-colors ${
                      isEnabled ? "text-[#38bdf8] hover:bg-[#1f232c]" : "text-[#555861] hover:bg-[#1f232c]"
                    }`}
                    title={isEnabled ? "Disable effect" : "Enable effect"}
                    onClick={() =>
                      updateLayerEffects(layer.id, {
                        [key]: { ...effectData, enabled: !isEnabled },
                      })
                    }
                    data-testid={`toggle-layer-effect-${key}`}
                  >
                    {isEnabled ? <Eye size={11} /> : <EyeOff size={11} />}
                  </button>

                  {/* Delete Button */}
                  <button
                    type="button"
                    className="p-1 rounded text-[#64748b] hover:text-[#f87171] hover:bg-[#202227] transition-colors"
                    title="Remove effect"
                    onClick={() => removeLayerEffect(layer.id, key)}
                    data-testid={`delete-layer-effect-${key}`}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

