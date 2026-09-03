import React, { useState } from "react";
import {
  Sparkles,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Sliders,
  Sparkle,
  SlidersHorizontal,
} from "lucide-react";
import {
  useEditorStore,
  CANONICAL_SCENE_EFFECTS,
  type SceneEffectKey,
  type SceneEffectsSettings,
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
import { EffectStylesModal } from "./EffectStylesModal";

export const SCENE_EFFECT_LABELS: Record<SceneEffectKey, string> = {
  depthOfField: "Depth of field",
  bloom: "Bloom",
  vignette: "Vignette",
  motionBlur: "Motion blur",
  chromaticAberration: "Color split",
  filmGrain: "Film grain",
  ghost: "Ghost",
  colorGrade: "Color grade",
  edgeFade: "Edge fade",
  glitch: "Glitch",
};

export function SceneEffectsPanel() {
  const activeSceneId = useEditorStore((state) => state.activeSceneId);
  const scenes = useEditorStore((state) => state.scenes);
  const addSceneEffect = useEditorStore((state) => state.addSceneEffect);
  const removeSceneEffect = useEditorStore((state) => state.removeSceneEffect);
  const swapSceneEffect = useEditorStore((state) => state.swapSceneEffect);
  const updateSceneEffects = useEditorStore((state) => state.updateSceneEffects);

  const [stylesModalOpen, setStylesModalOpen] = useState(false);

  const activeScene = scenes.find((s) => s.id === activeSceneId) || scenes[0];
  const sceneEffects = activeScene?.sceneEffects || {};
  const activeOrder: SceneEffectKey[] = sceneEffects.effectsOrder || [];

  const unaddedEffects = CANONICAL_SCENE_EFFECTS.filter(
    (key) => !activeOrder.includes(key),
  );
  const allAdded = unaddedEffects.length === 0;

  return (
    <div className="section-scene-effects space-y-2 mb-3">
      {/* Header Row */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase font-mono tracking-wider text-[#8e9198]">
          Scene effects
        </span>
        <div className="flex items-center gap-1">
          {/* Effect Styles button */}
          <button
            type="button"
            className="py-1 px-1.5 text-[9px] font-medium bg-[#1d1f24] hover:bg-[#252830] text-[#cfd3dc] rounded border border-[#2d313b] inline-flex items-center gap-1 shadow-sm transition-colors"
            title="Effect styles"
            onClick={() => setStylesModalOpen(true)}
            data-testid="button-effect-styles"
          >
            <SlidersHorizontal size={10} className="text-[#38bdf8]" />
            <span>Effect styles</span>
          </button>

          {/* Add Effect Button / Dropdown */}
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
                    data-testid="button-add-scene-effect"
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
                  <span>Add Scene Effect</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-[#20232a] my-1" />
                {unaddedEffects.map((key) => (
                  <DropdownMenuItem
                    key={key}
                    className="cursor-pointer hover:bg-[#1a2c3d] hover:text-[#38bdf8] px-2 py-1 rounded-[3px] text-[9.5px] text-[#cbd5e1]"
                    onClick={() => addSceneEffect(activeSceneId, key)}
                    data-testid={`menu-add-scene-effect-${key}`}
                  >
                    {SCENE_EFFECT_LABELS[key]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            )}
          </DropdownMenu>
        </div>
      </div>

      {/* Added Effects List */}
      {activeOrder.length === 0 ? (
        <div className="text-[9px] text-[#63666d] bg-[#14161a] border border-[#22252c] rounded p-2 text-center">
          No scene effects added
        </div>
      ) : (
        <div className="space-y-1.5">
          {activeOrder.map((key) => {
            const effectData = (sceneEffects as any)[key] || {};
            const isEnabled = effectData.enabled !== false;

            return (
              <div
                key={key}
                className="bg-[#16181c] border border-[#252830] rounded p-1.5 flex items-center justify-between text-[9.5px]"
                data-testid={`scene-effect-row-${key}`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  {/* Settings Popover Button */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="p-1 rounded bg-[#1e2026] hover:bg-[#282b34] text-[#38bdf8] transition-colors"
                        title={`${SCENE_EFFECT_LABELS[key]} settings`}
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
                        {SCENE_EFFECT_LABELS[key]} Controls
                      </div>

                      {/* Dynamic Controls per Effect Key */}
                      {key === "bloom" && (
                        <div className="space-y-2 text-[9px]">
                          <div>
                            <div className="flex justify-between text-[#81838a] mb-1">
                              <span>Intensity</span>
                              <span className="font-mono text-white">
                                {effectData.intensity ?? 1.0}
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="3"
                              step="0.1"
                              className="w-full h-1 bg-[#282a30] rounded appearance-none accent-[#38bdf8]"
                              value={effectData.intensity ?? 1.0}
                              onChange={(e) =>
                                updateSceneEffects(activeSceneId, {
                                  bloom: { ...effectData, intensity: parseFloat(e.target.value) },
                                })
                              }
                            />
                          </div>
                          <div>
                            <div className="flex justify-between text-[#81838a] mb-1">
                              <span>Threshold</span>
                              <span className="font-mono text-white">
                                {effectData.threshold ?? 0.8}
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.05"
                              className="w-full h-1 bg-[#282a30] rounded appearance-none accent-[#38bdf8]"
                              value={effectData.threshold ?? 0.8}
                              onChange={(e) =>
                                updateSceneEffects(activeSceneId, {
                                  bloom: { ...effectData, threshold: parseFloat(e.target.value) },
                                })
                              }
                            />
                          </div>
                        </div>
                      )}

                      {key === "vignette" && (
                        <div className="space-y-2 text-[9px]">
                          <div>
                            <div className="flex justify-between text-[#81838a] mb-1">
                              <span>Intensity</span>
                              <span className="font-mono text-white">
                                {Math.round((effectData.intensity ?? 0.3) * 100)}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.05"
                              className="w-full h-1 bg-[#282a30] rounded appearance-none accent-[#38bdf8]"
                              value={effectData.intensity ?? 0.3}
                              onChange={(e) =>
                                updateSceneEffects(activeSceneId, {
                                  vignette: { ...effectData, intensity: parseFloat(e.target.value) },
                                })
                              }
                            />
                          </div>
                        </div>
                      )}

                      {key === "chromaticAberration" && (
                        <div className="space-y-2 text-[9px]">
                          <div>
                            <div className="flex justify-between text-[#81838a] mb-1">
                              <span>Split Offset</span>
                              <span className="font-mono text-white">
                                {effectData.offset ?? 4}
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="20"
                              step="1"
                              className="w-full h-1 bg-[#282a30] rounded appearance-none accent-[#38bdf8]"
                              value={effectData.offset ?? 4}
                              onChange={(e) =>
                                updateSceneEffects(activeSceneId, {
                                  chromaticAberration: { ...effectData, offset: parseFloat(e.target.value) },
                                })
                              }
                            />
                          </div>
                        </div>
                      )}

                      {key === "filmGrain" && (
                        <div className="space-y-2 text-[9px]">
                          <div>
                            <div className="flex justify-between text-[#81838a] mb-1">
                              <span>Intensity</span>
                              <span className="font-mono text-white">
                                {Math.round((effectData.intensity ?? 0.08) * 100)}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.02"
                              className="w-full h-1 bg-[#282a30] rounded appearance-none accent-[#38bdf8]"
                              value={effectData.intensity ?? 0.08}
                              onChange={(e) =>
                                updateSceneEffects(activeSceneId, {
                                  filmGrain: { ...effectData, intensity: parseFloat(e.target.value) },
                                })
                              }
                            />
                          </div>
                          <div>
                            <div className="flex justify-between text-[#81838a] mb-1">
                              <span>Grain Size</span>
                              <span className="font-mono text-white">
                                {effectData.size ?? 1.0}
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0.5"
                              max="3"
                              step="0.1"
                              className="w-full h-1 bg-[#282a30] rounded appearance-none accent-[#38bdf8]"
                              value={effectData.size ?? 1.0}
                              onChange={(e) =>
                                updateSceneEffects(activeSceneId, {
                                  filmGrain: { ...effectData, size: parseFloat(e.target.value) },
                                })
                              }
                            />
                          </div>
                        </div>
                      )}

                      {key === "colorGrade" && (
                        <div className="space-y-2 text-[9px]">
                          <div>
                            <div className="flex justify-between text-[#81838a] mb-1">
                              <span>Exposure</span>
                              <span className="font-mono text-white">
                                {effectData.exposure ?? 0}
                              </span>
                            </div>
                            <input
                              type="range"
                              min="-2"
                              max="2"
                              step="0.1"
                              className="w-full h-1 bg-[#282a30] rounded appearance-none accent-[#38bdf8]"
                              value={effectData.exposure ?? 0}
                              onChange={(e) =>
                                updateSceneEffects(activeSceneId, {
                                  colorGrade: { ...effectData, exposure: parseFloat(e.target.value) },
                                })
                              }
                            />
                          </div>
                          <div>
                            <div className="flex justify-between text-[#81838a] mb-1">
                              <span>Contrast</span>
                              <span className="font-mono text-white">
                                {effectData.contrast ?? 1}
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="2"
                              step="0.1"
                              className="w-full h-1 bg-[#282a30] rounded appearance-none accent-[#38bdf8]"
                              value={effectData.contrast ?? 1}
                              onChange={(e) =>
                                updateSceneEffects(activeSceneId, {
                                  colorGrade: { ...effectData, contrast: parseFloat(e.target.value) },
                                })
                              }
                            />
                          </div>
                          <div>
                            <div className="flex justify-between text-[#81838a] mb-1">
                              <span>Saturation</span>
                              <span className="font-mono text-white">
                                {effectData.saturation ?? 1}
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="2"
                              step="0.1"
                              className="w-full h-1 bg-[#282a30] rounded appearance-none accent-[#38bdf8]"
                              value={effectData.saturation ?? 1}
                              onChange={(e) =>
                                updateSceneEffects(activeSceneId, {
                                  colorGrade: { ...effectData, saturation: parseFloat(e.target.value) },
                                })
                              }
                            />
                          </div>
                        </div>
                      )}

                      {key === "glitch" && (
                        <div className="space-y-2 text-[9px]">
                          <div>
                            <div className="flex justify-between text-[#81838a] mb-1">
                              <span>Intensity</span>
                              <span className="font-mono text-white">
                                {Math.round((effectData.intensity ?? 0.3) * 100)}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.05"
                              className="w-full h-1 bg-[#282a30] rounded appearance-none accent-[#38bdf8]"
                              value={effectData.intensity ?? 0.3}
                              onChange={(e) =>
                                updateSceneEffects(activeSceneId, {
                                  glitch: { ...effectData, intensity: parseFloat(e.target.value) },
                                })
                              }
                            />
                          </div>
                          <div>
                            <div className="flex justify-between text-[#81838a] mb-1">
                              <span>Speed</span>
                              <span className="font-mono text-white">
                                {effectData.speed ?? 1.0}
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0.5"
                              max="3"
                              step="0.1"
                              className="w-full h-1 bg-[#282a30] rounded appearance-none accent-[#38bdf8]"
                              value={effectData.speed ?? 1.0}
                              onChange={(e) =>
                                updateSceneEffects(activeSceneId, {
                                  glitch: { ...effectData, speed: parseFloat(e.target.value) },
                                })
                              }
                            />
                          </div>
                        </div>
                      )}

                      {key === "motionBlur" && (
                        <div className="space-y-2 text-[9px]">
                          <div>
                            <div className="flex justify-between text-[#81838a] mb-1">
                              <span>Shutter Angle</span>
                              <span className="font-mono text-white">
                                {effectData.shutterAngle ?? 180}°
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="360"
                              step="10"
                              className="w-full h-1 bg-[#282a30] rounded appearance-none accent-[#38bdf8]"
                              value={effectData.shutterAngle ?? 180}
                              onChange={(e) =>
                                updateSceneEffects(activeSceneId, {
                                  motionBlur: { ...effectData, shutterAngle: parseFloat(e.target.value) },
                                })
                              }
                            />
                          </div>
                          <div>
                            <div className="flex justify-between text-[#81838a] mb-1">
                              <span>Samples</span>
                              <span className="font-mono text-white">
                                {effectData.samples ?? 16}
                              </span>
                            </div>
                            <input
                              type="range"
                              min="1"
                              max="32"
                              step="1"
                              className="w-full h-1 bg-[#282a30] rounded appearance-none accent-[#38bdf8]"
                              value={effectData.samples ?? 16}
                              onChange={(e) =>
                                updateSceneEffects(activeSceneId, {
                                  motionBlur: { ...effectData, samples: parseInt(e.target.value, 10) },
                                })
                              }
                            />
                          </div>
                        </div>
                      )}

                      {key === "depthOfField" && (
                        <div className="space-y-2 text-[9px]">
                          <div>
                            <div className="flex justify-between text-[#81838a] mb-1">
                              <span>Bokeh Scale</span>
                              <span className="font-mono text-white">
                                {effectData.bokehScale ?? 2.0}
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="5"
                              step="0.2"
                              className="w-full h-1 bg-[#282a30] rounded appearance-none accent-[#38bdf8]"
                              value={effectData.bokehScale ?? 2.0}
                              onChange={(e) =>
                                updateSceneEffects(activeSceneId, {
                                  depthOfField: { ...effectData, bokehScale: parseFloat(e.target.value) },
                                })
                              }
                            />
                          </div>
                          <div>
                            <div className="flex justify-between text-[#81838a] mb-1">
                              <span>Aperture (f-stop)</span>
                              <span className="font-mono text-white">
                                f/{effectData.aperture ?? 2.8}
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0.7"
                              max="22"
                              step="0.3"
                              className="w-full h-1 bg-[#282a30] rounded appearance-none accent-[#38bdf8]"
                              value={effectData.aperture ?? 2.8}
                              onChange={(e) =>
                                updateSceneEffects(activeSceneId, {
                                  depthOfField: { ...effectData, aperture: parseFloat(e.target.value) },
                                })
                              }
                            />
                          </div>
                        </div>
                      )}

                      {key === "ghost" && (
                        <div className="space-y-2 text-[9px]">
                          <div>
                            <div className="flex justify-between text-[#81838a] mb-1">
                              <span>Opacity</span>
                              <span className="font-mono text-white">
                                {Math.round((effectData.opacity ?? 0.5) * 100)}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.05"
                              className="w-full h-1 bg-[#282a30] rounded appearance-none accent-[#38bdf8]"
                              value={effectData.opacity ?? 0.5}
                              onChange={(e) =>
                                updateSceneEffects(activeSceneId, {
                                  ghost: { ...effectData, opacity: parseFloat(e.target.value) },
                                })
                              }
                            />
                          </div>
                          <div>
                            <div className="flex justify-between text-[#81838a] mb-1">
                              <span>Offset</span>
                              <span className="font-mono text-white">
                                {effectData.offset ?? 10}px
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="30"
                              step="1"
                              className="w-full h-1 bg-[#282a30] rounded appearance-none accent-[#38bdf8]"
                              value={effectData.offset ?? 10}
                              onChange={(e) =>
                                updateSceneEffects(activeSceneId, {
                                  ghost: { ...effectData, offset: parseFloat(e.target.value) },
                                })
                              }
                            />
                          </div>
                        </div>
                      )}

                      {key === "edgeFade" && (
                        <div className="space-y-2 text-[9px]">
                          <div className="grid grid-cols-2 gap-1.5">
                            <div>
                              <span className="text-[#81838a] block mb-0.5">Top</span>
                              <input
                                type="number"
                                step="0.05"
                                min="0"
                                max="1"
                                className="w-full bg-[#1c1e24] border border-[#2a2d36] rounded p-1 text-center font-mono text-white"
                                value={effectData.top ?? 0.1}
                                onChange={(e) =>
                                  updateSceneEffects(activeSceneId, {
                                    edgeFade: { ...effectData, top: parseFloat(e.target.value) || 0 },
                                  })
                                }
                              />
                            </div>
                            <div>
                              <span className="text-[#81838a] block mb-0.5">Bottom</span>
                              <input
                                type="number"
                                step="0.05"
                                min="0"
                                max="1"
                                className="w-full bg-[#1c1e24] border border-[#2a2d36] rounded p-1 text-center font-mono text-white"
                                value={effectData.bottom ?? 0.1}
                                onChange={(e) =>
                                  updateSceneEffects(activeSceneId, {
                                    edgeFade: { ...effectData, bottom: parseFloat(e.target.value) || 0 },
                                  })
                                }
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>

                  {/* Type-Swap Combobox */}
                  <select
                    className="bg-[#1a1b1f] border border-[#26282e] rounded text-[9px] text-[#d8d9dc] px-1 py-0.5 outline-none font-medium cursor-pointer"
                    value={key}
                    onChange={(e) =>
                      swapSceneEffect(activeSceneId, key, e.target.value as SceneEffectKey)
                    }
                    data-testid={`select-swap-scene-effect-${key}`}
                  >
                    <option value={key}>{SCENE_EFFECT_LABELS[key]}</option>
                    {unaddedEffects.map((optKey) => (
                      <option key={optKey} value={optKey}>
                        {SCENE_EFFECT_LABELS[optKey]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  {/* Eye Toggle Button */}
                  <button
                    type="button"
                    className={`p-1 rounded transition-colors ${
                      isEnabled ? "text-[#38bdf8] hover:bg-[#1f232c]" : "text-[#555861] hover:bg-[#1f232c]"
                    }`}
                    title={isEnabled ? "Disable effect" : "Enable effect"}
                    onClick={() =>
                      updateSceneEffects(activeSceneId, {
                        [key]: { ...effectData, enabled: !isEnabled },
                      })
                    }
                    data-testid={`toggle-scene-effect-${key}`}
                  >
                    {isEnabled ? <Eye size={11} /> : <EyeOff size={11} />}
                  </button>

                  {/* Trash Button */}
                  <button
                    type="button"
                    className="p-1 rounded text-[#64748b] hover:text-[#f87171] hover:bg-[#202227] transition-colors"
                    title="Remove effect"
                    onClick={() => removeSceneEffect(activeSceneId, key)}
                    data-testid={`delete-scene-effect-${key}`}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {stylesModalOpen && (
        <EffectStylesModal
          open={stylesModalOpen}
          onOpenChange={setStylesModalOpen}
        />
      )}
    </div>
  );
}

