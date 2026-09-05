import React from "react";
import { ImageIcon } from "lucide-react";
import { type Layer } from "../../store/editor-store";
import {
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";

interface ImageLayerPanelProps {
  layer: Layer;
}

export function ImageLayerPanel({ layer }: ImageLayerPanelProps) {
  return (
    <AccordionItem value="appearance" className="border-b border-[#202227]" data-testid="section-image-props">
      <AccordionTrigger className="py-2.5 text-[11px] font-semibold tracking-wider text-[#999ba0] uppercase hover:text-[#d8d9dc] hover:no-underline">
        <div className="flex items-center gap-1.5">
          <ImageIcon size={12} className="text-[#38bdf8]" />
          <span>Image Source</span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="pb-3 pt-0 text-left">
        <div className="field mb-2">
          <span className="field-label">Natural Dimensions</span>
          <div
            data-testid="text-image-dimensions"
            className="text-[9.5px] text-[#a0a3a8] font-mono bg-[#1a1b1e] px-2 py-1.5 rounded border border-[#2a2c30] flex items-center justify-between"
          >
            <span>Size</span>
            <span>
              {layer.image?.naturalWidth || Math.round(layer.transform.width)} ×{" "}
              {layer.image?.naturalHeight || Math.round(layer.transform.height)} px
            </span>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full mt-1 py-1.5 px-2 text-[9.5px] font-medium bg-[#212328] hover:bg-[#2a2d34] text-[#cfd0d4] rounded border border-[#2f323a] transition-colors flex items-center justify-center gap-1.5"
          data-testid="button-replace-image"
          onClick={() => {
            console.log("Replace image stub clicked");
          }}
        >
          <ImageIcon size={11} />
          <span>Replace image</span>
        </Button>
      </AccordionContent>
    </AccordionItem>
  );
}
