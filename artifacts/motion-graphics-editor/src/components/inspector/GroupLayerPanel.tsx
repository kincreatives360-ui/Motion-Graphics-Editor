import React from "react";
import { Layers } from "lucide-react";
import { type Layer } from "../../store/editor-store";
import {
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

interface GroupLayerPanelProps {
  layer: Layer;
}

export function GroupLayerPanel({ layer }: GroupLayerPanelProps) {
  return (
    <AccordionItem value="appearance" className="border-b border-[#202227]" data-testid="section-group-props">
      <AccordionTrigger className="py-2.5 text-[11px] font-semibold tracking-wider text-[#999ba0] uppercase hover:text-[#d8d9dc] hover:no-underline">
        <div className="flex items-center gap-1.5">
          <Layers size={12} className="text-[#38bdf8]" />
          <span>Group Hierarchy</span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="pb-3 pt-0 text-left">
        <div className="text-[9px] text-[#8e9198] bg-[#1a1b1e] p-2 rounded border border-[#2a2c30]">
          Child layers are transformed relative to canvas coordinates enclosed in this group container.
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
