import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { saveUserPreset, type UserPreset } from "../persistence/local-store";
import type { AnimationBlock } from "../store/animation-blocks";
import type { Layer, Camera } from "../store/editor-store";
import { Sparkles, LayoutTemplate, Check } from "lucide-react";

interface SaveAnimationPresetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blocks: AnimationBlock[];
  defaultName?: string;
  onSaved?: (preset: UserPreset) => void;
}

export function SaveAnimationPresetModal({
  open,
  onOpenChange,
  blocks,
  defaultName = "",
  onSaved,
}: SaveAnimationPresetModalProps) {
  const [name, setName] = useState(defaultName || "Custom Motion Preset");
  const [description, setDescription] = useState("Custom animated timing and easing combination");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || blocks.length === 0) return;

    setSaving(true);
    const minStart = Math.min(...blocks.map((b) => b.startFrame));

    const presetPayload: UserPreset = {
      id: `user-anim-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: "animation",
      name: name.trim(),
      description: description.trim(),
      category: "user",
      createdAt: Date.now(),
      blocks: blocks.map((b) => ({
        preset: (b.preset as any) || "fade-in",
        durationFrames: Math.max(1, b.endFrame - b.startFrame),
        offsetFrames: b.startFrame - minStart,
        easing: b.easing as any,
        customCurve: b.customCurve,
        cameraTo: (b as any).cameraTo,
      })),
    };

    await saveUserPreset(presetPayload);
    setSaving(false);
    setSaved(true);

    if (onSaved) onSaved(presetPayload);

    setTimeout(() => {
      setSaved(false);
      onOpenChange(false);
    }, 800);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-[#14161c] border border-[#262a34] text-white max-w-sm"
        data-testid="dialog-save-animation-preset"
      >
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            <Sparkles size={14} className="text-[#38bdf8]" />
            Save as Animation Preset
          </DialogTitle>
          <DialogDescription className="text-[10px] text-[#8c919d]">
            Save these {blocks.length} animation effect{blocks.length > 1 ? "s" : ""} to your reusable library.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-3 py-1">
          <div>
            <label htmlFor="save-preset-name-input" className="text-[9.5px] text-[#9ca1ad] font-medium mb-1 block">
              Preset Name
            </label>
            <input
              id="save-preset-name-input"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Preset name"
              className="w-full bg-[#1b1d24] border border-[#2a2e3a] rounded p-1.5 text-[10px] text-white outline-none focus:border-[#38bdf8]"
              data-testid="input-save-preset-name"
            />
          </div>

          <div>
            <label htmlFor="save-preset-desc-input" className="text-[9.5px] text-[#9ca1ad] font-medium mb-1 block">
              Description (Optional)
            </label>
            <input
              id="save-preset-desc-input"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-label="Preset description"
              className="w-full bg-[#1b1d24] border border-[#2a2e3a] rounded p-1.5 text-[10px] text-white outline-none focus:border-[#38bdf8]"
              data-testid="input-save-preset-description"
            />
          </div>

          {/* Blocks summary */}
          <div className="p-2 rounded bg-[#181a21] border border-[#242732] space-y-1">
            <span className="text-[8.5px] text-[#6b7280] uppercase tracking-wider font-semibold">
              Included Blocks ({blocks.length})
            </span>
            <div className="flex flex-wrap gap-1 mt-1">
              {blocks.map((b) => (
                <span
                  key={b.id}
                  className="text-[8.5px] font-mono px-1.5 py-0.5 rounded bg-[#20242f] text-[#38bdf8] border border-[#2e3444]"
                >
                  {b.preset} ({b.endFrame - b.startFrame}f, {b.easing})
                </span>
              ))}
            </div>
          </div>

          <DialogFooter className="pt-2 border-t border-[#1f222b]">
            <button
              type="button"
              aria-label="Cancel saving preset"
              className="px-3 py-1 text-[10px] text-[#9ca1ad] hover:text-white rounded hover:bg-[#20232b] transition-colors"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              aria-label="Save to animation presets"
              data-testid="button-confirm-save-preset"
              className="px-3 py-1 text-[10px] font-medium bg-[#0284c7] hover:bg-[#0369a1] text-white rounded transition-colors flex items-center gap-1 shadow-sm"
            >
              {saved ? (
                <>
                  <Check size={11} strokeWidth={2.5} />
                  <span>Saved!</span>
                </>
              ) : (
                <span>{saving ? "Saving..." : "Save to Presets"}</span>
              )}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface SaveSceneTemplateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layers: Layer[];
  animationBlocks: AnimationBlock[];
  camera?: Camera;
  durationFrames?: number;
  fps?: number;
  onSaved?: (template: UserPreset) => void;
}

export function SaveSceneTemplateModal({
  open,
  onOpenChange,
  layers,
  animationBlocks,
  camera,
  durationFrames = 180,
  fps = 30,
  onSaved,
}: SaveSceneTemplateModalProps) {
  const [name, setName] = useState("Custom Scene Layout");
  const [description, setDescription] = useState("Custom multi-layer composition with animations");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || layers.length === 0) return;

    setSaving(true);
    const templatePayload: UserPreset = {
      id: `user-tpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: "template",
      name: name.trim(),
      description: description.trim(),
      category: "user",
      durationFrames,
      fps,
      camera,
      layers: layers.map((l) => ({ ...l })),
      animationBlocks: animationBlocks.map((b) => ({ ...b })),
      createdAt: Date.now(),
    };

    await saveUserPreset(templatePayload);
    setSaving(false);
    setSaved(true);

    if (onSaved) onSaved(templatePayload);

    setTimeout(() => {
      setSaved(false);
      onOpenChange(false);
    }, 800);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-[#14161c] border border-[#262a34] text-white max-w-sm"
        data-testid="dialog-save-scene-template"
      >
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            <LayoutTemplate size={14} className="text-[#38bdf8]" />
            Save as Scene Template
          </DialogTitle>
          <DialogDescription className="text-[10px] text-[#8c919d]">
            Save {layers.length} layer{layers.length > 1 ? "s" : ""} and {animationBlocks.length} effect
            {animationBlocks.length !== 1 ? "s" : ""} as a reusable template.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-3 py-1">
          <div>
            <label htmlFor="save-template-name-input" className="text-[9.5px] text-[#9ca1ad] font-medium mb-1 block">
              Template Name
            </label>
            <input
              id="save-template-name-input"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Template name"
              className="w-full bg-[#1b1d24] border border-[#2a2e3a] rounded p-1.5 text-[10px] text-white outline-none focus:border-[#38bdf8]"
              data-testid="input-save-template-name"
            />
          </div>

          <div>
            <label htmlFor="save-template-desc-input" className="text-[9.5px] text-[#9ca1ad] font-medium mb-1 block">
              Description (Optional)
            </label>
            <input
              id="save-template-desc-input"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-label="Template description"
              className="w-full bg-[#1b1d24] border border-[#2a2e3a] rounded p-1.5 text-[10px] text-white outline-none focus:border-[#38bdf8]"
              data-testid="input-save-template-description"
            />
          </div>

          {/* Included layers summary */}
          <div className="p-2 rounded bg-[#181a21] border border-[#242732] space-y-1">
            <span className="text-[8.5px] text-[#6b7280] uppercase tracking-wider font-semibold">
              Layers Included ({layers.length})
            </span>
            <div className="flex flex-wrap gap-1 mt-1 max-h-24 overflow-y-auto">
              {layers.map((l) => (
                <span
                  key={l.id}
                  className="text-[8.5px] px-1.5 py-0.5 rounded bg-[#20242f] text-[#cfd3dc] border border-[#2e3444] truncate max-w-[120px]"
                >
                  {l.name}
                </span>
              ))}
            </div>
          </div>

          <DialogFooter className="pt-2 border-t border-[#1f222b]">
            <button
              type="button"
              aria-label="Cancel saving template"
              className="px-3 py-1 text-[10px] text-[#9ca1ad] hover:text-white rounded hover:bg-[#20232b] transition-colors"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              aria-label="Save scene template"
              data-testid="button-confirm-save-template"
              className="px-3 py-1 text-[10px] font-medium bg-[#0284c7] hover:bg-[#0369a1] text-white rounded transition-colors flex items-center gap-1 shadow-sm"
            >
              {saved ? (
                <>
                  <Check size={11} strokeWidth={2.5} />
                  <span>Saved!</span>
                </>
              ) : (
                <span>{saving ? "Saving..." : "Save Template"}</span>
              )}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
