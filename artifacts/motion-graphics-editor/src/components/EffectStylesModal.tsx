import React, { useState } from "react";
import { Sparkles, SlidersHorizontal, Plus, Trash2, Check } from "lucide-react";
import {
  useEditorStore,
  type EffectPreset,
} from "../store/editor-store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const BUILTIN_EFFECT_STYLES: Omit<EffectPreset, "id">[] = [
  {
    name: "Cinematic Film Grade",
    category: "Cinematic",
    sceneEffects: {
      colorGrade: { enabled: true, exposure: 0.1, contrast: 1.15, saturation: 0.9 },
      vignette: { enabled: true, intensity: 0.35 },
      filmGrain: { enabled: true, intensity: 0.12, size: 1.0 },
      chromaticAberration: { enabled: true, offset: 4 },
      effectsOrder: ["colorGrade", "vignette", "filmGrain", "chromaticAberration"],
    },
  },
  {
    name: "Cyberpunk Neon Glitch",
    category: "Stylized",
    sceneEffects: {
      bloom: { enabled: true, intensity: 1.8, threshold: 0.6 },
      glitch: { enabled: true, intensity: 0.45, speed: 1.5 },
      chromaticAberration: { enabled: true, offset: 12 },
      colorGrade: { enabled: true, exposure: 0.2, contrast: 1.3, saturation: 1.4 },
      effectsOrder: ["bloom", "glitch", "chromaticAberration", "colorGrade"],
    },
  },
  {
    name: "Soft Dreamy Glow",
    category: "Soft",
    sceneEffects: {
      bloom: { enabled: true, intensity: 1.2, threshold: 0.5 },
      depthOfField: { enabled: true, bokehScale: 3.0, aperture: 1.8, focusRange: 80 },
      vignette: { enabled: true, intensity: 0.25 },
      effectsOrder: ["bloom", "depthOfField", "vignette"],
    },
  },
];

export function EffectStylesModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const activeSceneId = useEditorStore((state) => state.activeSceneId);
  const scenes = useEditorStore((state) => state.scenes);
  const effectPresets = useEditorStore((state) => state.effectPresets) || [];
  const saveEffectPreset = useEditorStore((state) => state.saveEffectPreset);
  const removeEffectPreset = useEditorStore((state) => state.removeEffectPreset);
  const applyEffectPreset = useEditorStore((state) => state.applyEffectPreset);
  const updateSceneEffects = useEditorStore((state) => state.updateSceneEffects);

  const activeScene = scenes.find((s) => s.id === activeSceneId) || scenes[0];

  const [presetName, setPresetName] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const allPresets = [...BUILTIN_EFFECT_STYLES.map((p, idx) => ({ ...p, id: `builtin-${idx}` })), ...effectPresets];

  const filteredPresets = selectedCategory === "all"
    ? allPresets
    : allPresets.filter((p) => (p.category || "Custom").toLowerCase() === selectedCategory.toLowerCase());

  const handleSaveCurrent = () => {
    if (!presetName.trim() || !activeScene?.sceneEffects) return;
    saveEffectPreset({
      name: presetName.trim(),
      category: "Custom",
      sceneEffects: activeScene.sceneEffects,
    });
    setPresetName("");
  };

  const handleApplyPreset = (preset: EffectPreset) => {
    updateSceneEffects(activeSceneId, preset.sceneEffects);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] bg-[#14161a] border border-[#26282e] text-[#d8d9dc] p-5">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold flex items-center gap-1.5 text-white">
            <SlidersHorizontal size={14} className="text-[#38bdf8]" />
            <span>Effect Styles & Scene Presets</span>
          </DialogTitle>
          <DialogDescription className="text-[10px] text-[#81838a]">
            Browse saved scene-effect style bundles or capture current active shot settings into a reusable preset.
          </DialogDescription>
        </DialogHeader>

        {/* Save Current Scene Style Box */}
        <div className="bg-[#181a1f] border border-[#252830] rounded p-3 space-y-2">
          <span className="text-[9.5px] font-medium text-[#38bdf8] flex items-center gap-1">
            <Sparkles size={11} />
            <span>Save Current Shot's Effect Style</span>
          </span>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Style preset name..."
              className="flex-1 bg-[#121417] border border-[#26282e] rounded px-2 py-1 text-[9.5px] text-white outline-none focus:border-[#38bdf8]"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
            />
            <button
              type="button"
              className="px-3 py-1 bg-[#0284c7] hover:bg-[#0369a1] text-white text-[9.5px] font-medium rounded transition-colors"
              onClick={handleSaveCurrent}
            >
              Save Style
            </button>
          </div>
        </div>

        {/* Filter Categories */}
        <div className="flex gap-1.5 pt-1">
          {["all", "cinematic", "stylized", "soft", "custom"].map((cat) => (
            <button
              key={cat}
              type="button"
              className={`px-2 py-0.5 rounded text-[8.5px] capitalize font-medium transition-colors ${
                selectedCategory === cat
                  ? "bg-[#252830] text-white border border-[#38bdf8]"
                  : "bg-[#16181c] text-[#81838a] border border-[#23252c] hover:text-white"
              }`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Preset Cards List */}
        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
          {filteredPresets.map((preset) => (
            <div
              key={preset.id}
              className="bg-[#181a1f] border border-[#252830] hover:border-[#38bdf8]/50 rounded p-2.5 flex items-center justify-between transition-colors"
            >
              <div className="space-y-0.5">
                <div className="text-[10px] font-semibold text-white flex items-center gap-1.5">
                  <span>{preset.name}</span>
                  <span className="text-[7.5px] px-1 py-0.2 rounded bg-[#20232a] text-[#81838a] border border-[#292c34]">
                    {preset.category || "Custom"}
                  </span>
                </div>
                <div className="text-[8.5px] text-[#81838a] font-mono">
                  {preset.sceneEffects.effectsOrder?.join(", ") || "Active effects"}
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="px-2.5 py-1 text-[9px] bg-[#1e222b] hover:bg-[#0284c7] text-[#38bdf8] hover:text-white rounded border border-[#2d323e] transition-colors font-medium"
                  onClick={() => handleApplyPreset(preset as EffectPreset)}
                >
                  Apply
                </button>
                {preset.id.startsWith("effect-preset-") && (
                  <button
                    type="button"
                    className="p-1 text-[#64748b] hover:text-[#f87171] transition-colors"
                    onClick={() => removeEffectPreset(preset.id)}
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

