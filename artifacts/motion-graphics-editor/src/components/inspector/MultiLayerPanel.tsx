import React from "react";
import { Layers } from "lucide-react";
import { useEditorStore } from "../../store/editor-store";
import { Button } from "@/components/ui/button";

interface MultiLayerPanelProps {
  selectedLayerIds: string[];
}

export function MultiLayerPanel({ selectedLayerIds }: MultiLayerPanelProps) {
  const selectLayers = useEditorStore((s) => s.selectLayers);

  return (
    <div data-testid="multi-selection-view">
      <span className="section-label">Multiple Selection</span>
      <div className="bg-[#17191d] border border-[#24272e] rounded p-2.5 mb-3">
        <div className="text-[10.5px] font-semibold text-[#e2e4e8] mb-1 flex items-center gap-1.5">
          <Layers size={13} className="text-[#38bdf8]" />
          <span>{selectedLayerIds.length} Layers Selected</span>
        </div>
        <p className="text-[9px] text-[#787b84] leading-relaxed mb-2.5">
          Move, scale, or group selected items together on the canvas.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="w-full py-1 text-[9px] font-medium bg-[#202227] hover:bg-[#272a31] text-[#cfd0d5] border border-[#2d3038] rounded transition-colors"
          data-testid="button-deselect-layers"
          onClick={() => selectLayers([])}
        >
          Clear Selection
        </Button>
      </div>
    </div>
  );
}
