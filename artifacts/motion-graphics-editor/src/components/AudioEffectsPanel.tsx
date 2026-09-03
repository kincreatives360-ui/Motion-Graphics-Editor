import React from "react";
import { Sliders, Plus, Trash2, Eye, EyeOff } from "lucide-react";
import {
  useEditorStore,
  CANONICAL_AUDIO_EFFECTS,
  type AudioEffectKey,
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

export const AUDIO_EFFECT_LABELS: Record<AudioEffectKey, string> = {
  eq: "EQ",
  filter: "Filter",
  compressor: "Compressor",
  distortion: "Distortion",
  delay: "Delay",
  reverb: "Reverb",
};

export function AudioEffectsPanel({ layer }: { layer: Layer }) {
  const addAudioEffect = useEditorStore((state) => state.addAudioEffect);
  const removeAudioEffect = useEditorStore((state) => state.removeAudioEffect);
  const swapAudioEffect = useEditorStore((state) => state.swapAudioEffect);
  const updateAudioEffects = useEditorStore((state) => state.updateAudioEffects);

  const audioEffects = layer.audioEffects || {};
  const activeOrder: AudioEffectKey[] = audioEffects.effectsOrder || [];

  const unaddedEffects = CANONICAL_AUDIO_EFFECTS.filter(
    (key) => !activeOrder.includes(key),
  );
  const allAdded = unaddedEffects.length === 0;

  return (
    <div className="section-audio-effects space-y-2 mb-3">
      {/* Header Row */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase font-mono tracking-wider text-[#8e9198]">
          Effects
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
                  data-testid="button-add-audio-effect"
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
                <span>Add Audio Effect</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-[#20232a] my-1" />
              {unaddedEffects.map((key) => (
                <DropdownMenuItem
                  key={key}
                  className="cursor-pointer hover:bg-[#1a2c3d] hover:text-[#38bdf8] px-2 py-1 rounded-[3px] text-[9.5px] text-[#cbd5e1]"
                  onClick={() => addAudioEffect(layer.id, key)}
                  data-testid={`menu-add-audio-effect-${key}`}
                >
                  {AUDIO_EFFECT_LABELS[key]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          )}
        </DropdownMenu>
      </div>

      {/* Added Audio Effects Rows */}
      {activeOrder.length === 0 ? (
        <div className="text-[9px] text-[#63666d] bg-[#14161a] border border-[#22252c] rounded p-2 text-center">
          No audio effects added
        </div>
      ) : (
        <div className="space-y-1.5">
          {activeOrder.map((key) => {
            const effectData = (audioEffects as any)[key] || {};
            const isEnabled = effectData.enabled !== false;

            return (
              <div
                key={key}
                className="bg-[#16181c] border border-[#252830] rounded p-1.5 flex items-center justify-between text-[9.5px]"
                data-testid={`audio-effect-row-${key}`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  {/* Settings Popover */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="p-1 rounded bg-[#1e2026] hover:bg-[#282b34] text-[#38bdf8] transition-colors"
                        title={`${AUDIO_EFFECT_LABELS[key]} settings`}
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
                        {AUDIO_EFFECT_LABELS[key]} Controls
                      </div>

                      {/* Filter */}
                      {key === "filter" && (
                        <div className="space-y-2 text-[9px]">
                          <div>
                            <div className="flex justify-between text-[#81838a] mb-1">
                              <span>Highpass (Hz)</span>
                              <span className="font-mono text-white">{effectData.highpassHz ?? 80} Hz</span>
                            </div>
                            <input
                              type="range"
                              min="20"
                              max="20000"
                              step="50"
                              className="w-full h-1 bg-[#282a30] rounded appearance-none accent-[#38bdf8]"
                              value={effectData.highpassHz ?? 80}
                              onChange={(e) =>
                                updateAudioEffects(layer.id, {
                                  filter: { ...effectData, highpassHz: parseFloat(e.target.value) },
                                })
                              }
                            />
                          </div>
                          <div>
                            <div className="flex justify-between text-[#81838a] mb-1">
                              <span>Lowpass (Hz)</span>
                              <span className="font-mono text-white">{effectData.lowpassHz ?? 16000} Hz</span>
                            </div>
                            <input
                              type="range"
                              min="20"
                              max="20000"
                              step="50"
                              className="w-full h-1 bg-[#282a30] rounded appearance-none accent-[#38bdf8]"
                              value={effectData.lowpassHz ?? 16000}
                              onChange={(e) =>
                                updateAudioEffects(layer.id, {
                                  filter: { ...effectData, lowpassHz: parseFloat(e.target.value) },
                                })
                              }
                            />
                          </div>
                        </div>
                      )}

                      {/* Compressor */}
                      {key === "compressor" && (
                        <div className="space-y-2 text-[9px]">
                          <div>
                            <div className="flex justify-between text-[#81838a] mb-1">
                              <span>Threshold</span>
                              <span className="font-mono text-white">{effectData.thresholdDb ?? -18} dB</span>
                            </div>
                            <input
                              type="range"
                              min="-60"
                              max="0"
                              step="1"
                              className="w-full h-1 bg-[#282a30] rounded appearance-none accent-[#38bdf8]"
                              value={effectData.thresholdDb ?? -18}
                              onChange={(e) =>
                                updateAudioEffects(layer.id, {
                                  compressor: { ...effectData, thresholdDb: parseFloat(e.target.value) },
                                })
                              }
                            />
                          </div>
                          <div>
                            <div className="flex justify-between text-[#81838a] mb-1">
                              <span>Ratio</span>
                              <span className="font-mono text-white">{effectData.ratio ?? 4}:1</span>
                            </div>
                            <input
                              type="range"
                              min="1"
                              max="20"
                              step="0.5"
                              className="w-full h-1 bg-[#282a30] rounded appearance-none accent-[#38bdf8]"
                              value={effectData.ratio ?? 4}
                              onChange={(e) =>
                                updateAudioEffects(layer.id, {
                                  compressor: { ...effectData, ratio: parseFloat(e.target.value) },
                                })
                              }
                            />
                          </div>
                        </div>
                      )}

                      {/* Distortion */}
                      {key === "distortion" && (
                        <div className="space-y-2 text-[9px]">
                          <div>
                            <span className="text-[#81838a] block mb-0.5">Style</span>
                            <select
                              className="w-full bg-[#1c1e24] border border-[#2a2d36] rounded p-1 text-[9px] text-white"
                              value={effectData.style || "tube"}
                              onChange={(e) =>
                                updateAudioEffects(layer.id, {
                                  distortion: { ...effectData, style: e.target.value as any },
                                })
                              }
                            >
                              <option value="tape">Tape</option>
                              <option value="tube">Tube</option>
                              <option value="console">Console</option>
                              <option value="fuzz">Fuzz</option>
                            </select>
                          </div>
                          <div>
                            <div className="flex justify-between text-[#81838a] mb-1">
                              <span>Drive</span>
                              <span className="font-mono text-white">
                                {Math.round((effectData.drive ?? 0.3) * 100)}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.05"
                              className="w-full h-1 bg-[#282a30] rounded appearance-none accent-[#38bdf8]"
                              value={effectData.drive ?? 0.3}
                              onChange={(e) =>
                                updateAudioEffects(layer.id, {
                                  distortion: { ...effectData, drive: parseFloat(e.target.value) },
                                })
                              }
                            />
                          </div>
                        </div>
                      )}

                      {/* Delay */}
                      {key === "delay" && (
                        <div className="space-y-2 text-[9px]">
                          <div>
                            <span className="text-[#81838a] block mb-0.5">Sync Division</span>
                            <select
                              className="w-full bg-[#1c1e24] border border-[#2a2d36] rounded p-1 text-[9px] text-white"
                              value={effectData.sync || "eighth"}
                              onChange={(e) =>
                                updateAudioEffects(layer.id, {
                                  delay: { ...effectData, sync: e.target.value as any },
                                })
                              }
                            >
                              <option value="quarter">1/4 Quarter</option>
                              <option value="dottedEighth">1/8 Dotted</option>
                              <option value="eighth">1/8 Eighth</option>
                              <option value="tripletEighth">1/8 Triplet</option>
                              <option value="sixteenth">1/16 Sixteenth</option>
                            </select>
                          </div>
                          <div>
                            <div className="flex justify-between text-[#81838a] mb-1">
                              <span>Feedback</span>
                              <span className="font-mono text-white">
                                {Math.round((effectData.feedback ?? 0.3) * 100)}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="0.9"
                              step="0.05"
                              className="w-full h-1 bg-[#282a30] rounded appearance-none accent-[#38bdf8]"
                              value={effectData.feedback ?? 0.3}
                              onChange={(e) =>
                                updateAudioEffects(layer.id, {
                                  delay: { ...effectData, feedback: parseFloat(e.target.value) },
                                })
                              }
                            />
                          </div>
                        </div>
                      )}

                      {/* Reverb */}
                      {key === "reverb" && (
                        <div className="space-y-2 text-[9px]">
                          <div>
                            <span className="text-[#81838a] block mb-0.5">Preset Environment</span>
                            <select
                              className="w-full bg-[#1c1e24] border border-[#2a2d36] rounded p-1 text-[9px] text-white"
                              value={effectData.preset || "hall"}
                              onChange={(e) =>
                                updateAudioEffects(layer.id, {
                                  reverb: { ...effectData, preset: e.target.value as any },
                                })
                              }
                            >
                              <option value="room">Room (900ms)</option>
                              <option value="hall">Hall (2600ms)</option>
                              <option value="plate">Plate (1800ms)</option>
                              <option value="cavern">Cavern (6000ms)</option>
                            </select>
                          </div>
                          <div>
                            <div className="flex justify-between text-[#81838a] mb-1">
                              <span>Mix</span>
                              <span className="font-mono text-white">
                                {Math.round((effectData.mix ?? 0.3) * 100)}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.05"
                              className="w-full h-1 bg-[#282a30] rounded appearance-none accent-[#38bdf8]"
                              value={effectData.mix ?? 0.3}
                              onChange={(e) =>
                                updateAudioEffects(layer.id, {
                                  reverb: { ...effectData, mix: parseFloat(e.target.value) },
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
                      swapAudioEffect(layer.id, key, e.target.value as AudioEffectKey)
                    }
                    data-testid={`select-swap-audio-effect-${key}`}
                  >
                    <option value={key}>{AUDIO_EFFECT_LABELS[key]}</option>
                    {unaddedEffects.map((optKey) => (
                      <option key={optKey} value={optKey}>
                        {AUDIO_EFFECT_LABELS[optKey]}
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
                      updateAudioEffects(layer.id, {
                        [key]: { ...effectData, enabled: !isEnabled },
                      })
                    }
                    data-testid={`toggle-audio-effect-${key}`}
                  >
                    {isEnabled ? <Eye size={11} /> : <EyeOff size={11} />}
                  </button>

                  {/* Delete Button */}
                  <button
                    type="button"
                    className="p-1 rounded text-[#64748b] hover:text-[#f87171] hover:bg-[#202227] transition-colors"
                    title="Remove effect"
                    onClick={() => removeAudioEffect(layer.id, key)}
                    data-testid={`delete-audio-effect-${key}`}
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

