import React from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type BlockPreset } from "../store/animation-blocks";

export interface EffectPickerSlot {
  layerId: string;
  frame: number;
  leftPx: number;
  topPx: number;
}

export interface EffectPickerPopoverProps {
  effectPickerSlot: EffectPickerSlot | null;
  activeSceneId: string;
  activeSceneDuration: number;
  handleAddBlock: (
    sceneId: string,
    layerId: string | null,
    preset: BlockPreset,
    sceneDuration: number,
    customStart?: number,
  ) => void;
  setEffectPickerSlot: (slot: EffectPickerSlot | null) => void;
  setHoveredEmptySlot: (slot: EffectPickerSlot | null) => void;
}

export function EffectPickerPopover({
  effectPickerSlot,
  activeSceneId,
  activeSceneDuration,
  handleAddBlock,
  setEffectPickerSlot,
  setHoveredEmptySlot,
}: EffectPickerPopoverProps) {
  return effectPickerSlot ? (
    <div
      className="fixed z-50 bg-card border border-border shadow-2xl rounded-lg p-2 text-foreground w-56 animate-in fade-in zoom-in-95 duration-100"
      style={{
        left: `${Math.min(
          window.innerWidth - 240,
          Math.max(20, effectPickerSlot.leftPx - (window.scrollX || 0) + 180),
        )}px`,
        top: `${Math.max(10, effectPickerSlot.topPx - 140)}px`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-border px-1 text-[10px] font-mono text-primary font-semibold uppercase tracking-wider">
        <span className="flex items-center gap-1">
          <Sparkles size={11} />
          <span>Choose Effect</span>
        </span>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          className="text-muted-foreground hover:text-foreground text-sm leading-none"
          onClick={() => setEffectPickerSlot(null)}
        >
          ×
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {BLOCK_PRESETS.filter((p) => p.id !== "camera-move").slice(0, 6).map((preset) => (
          <Button
            variant="secondary"
            type="button"
            className="p-1.5 rounded bg-secondary/40 hover:bg-primary hover:text-primary-foreground border border-border hover:border-primary text-[10px] font-medium text-left truncate transition-colors"
            onClick={() => {
              handleAddBlock(
                activeSceneId,
                effectPickerSlot.layerId,
                preset.id,
                activeSceneDuration,
                effectPickerSlot.frame,
              );
              setEffectPickerSlot(null);
              setHoveredEmptySlot(null);
            }}
          >
            {preset.label}
          </Button>
        ))}
      </div>
    </div>
  ) : null;
}