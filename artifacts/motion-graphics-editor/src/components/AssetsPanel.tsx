import React, { useRef, useState } from "react";
import {
  Image as ImageIcon,
  Upload,
  Plus,
  Trash2,
  ExternalLink,
} from "lucide-react";
import {
  useEditorStore,
  type ProjectAsset,
} from "../store/editor-store";
import { importImageFile, addAssetToCanvas } from "../lib/svg-importer";

interface AssetsPanelProps {
  searchQuery?: string;
}

export function AssetsPanel({ searchQuery = "" }: AssetsPanelProps) {
  const assets = useEditorStore((s) => s.assets) || [];
  const removeAsset = useEditorStore((s) => s.removeAsset);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPanelDragOver, setIsPanelDragOver] = useState(false);

  const filteredAssets = searchQuery.trim()
    ? assets.filter((a) =>
        a.name.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : assets;

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (
        file.type.startsWith("image/") ||
        /\.(png|jpe?g|svg|webp|gif|avif)$/i.test(file.name)
      ) {
        await importImageFile(file);
      }
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsPanelDragOver(false);
    if (e.dataTransfer.files) {
      await handleFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    if (!isPanelDragOver) setIsPanelDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsPanelDragOver(false);
  };

  const handleAssetDragStart = (e: React.DragEvent, asset: ProjectAsset) => {
    e.dataTransfer.setData(
      "application/x-editor-asset",
      JSON.stringify(asset),
    );
    e.dataTransfer.effectAllowed = "copy";

    // Set preview drag image if supported
    const img = e.currentTarget.querySelector("img");
    if (img && e.dataTransfer.setDragImage) {
      e.dataTransfer.setDragImage(img, 24, 24);
    }
  };

  return (
    <div
      className={`flex flex-col h-full overflow-hidden relative ${
        isPanelDragOver ? "bg-[#0b1219]" : ""
      }`}
      data-testid="assets-panel"
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Hidden file input for manual upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.svg"
        multiple
        aria-label="Upload image asset file"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {/* Top action toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1b2029] bg-[#0c1015]/60">
        <span className="text-[10px] font-semibold text-[#8b9bb4] uppercase tracking-wider">
          Library ({assets.length})
        </span>
        <button
          type="button"
          data-testid="button-upload-asset"
          aria-label="Import image asset from disk"
          className="flex items-center gap-1 px-2 py-0.5 text-[10.5px] font-medium rounded bg-[#18212e] text-[#38bdf8] hover:bg-[#202e42] hover:text-[#7dd3fc] border border-[#38bdf8]/30 transition-all cursor-pointer shadow-xs active:scale-95"
          onClick={() => fileInputRef.current?.click()}
          title="Import image asset from disk"
        >
          <Upload size={10.5} strokeWidth={2} aria-hidden="true" />
          <span>Import</span>
        </button>
      </div>

      {/* Dragging over whole panel indicator */}
      {isPanelDragOver && (
        <div className="absolute inset-0 z-20 pointer-events-none border-2 border-dashed border-[#38bdf8] bg-[#0284c7]/15 flex flex-col items-center justify-center gap-1 backdrop-blur-xs">
          <Upload size={20} className="text-[#38bdf8] animate-bounce" aria-hidden="true" />
          <span className="text-[11px] font-medium text-[#f0f9ff]">
            Drop to import assets
          </span>
        </div>
      )}

      {/* Content area: Grid or Empty State */}
      <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-[#222936]">
        {filteredAssets.length === 0 ? (
          <div
            className="panel-empty flex flex-col items-center justify-center p-4 text-center h-48 border border-dashed border-[#232a36] rounded-md bg-[#0b0e13] my-2"
            data-testid="text-empty-assets"
          >
            <div className="w-9 h-9 rounded-full bg-[#161c26] border border-[#263040] flex items-center justify-center text-[#64748b] mb-2.5">
              <ImageIcon size={18} strokeWidth={1.6} aria-hidden="true" />
            </div>
            <span className="text-[11px] font-medium text-[#94a3b8] mb-1">
              {assets.length === 0
                ? "No assets imported"
                : "No matching assets"}
            </span>
            <p className="text-[9.5px] text-[#55657e] max-w-[170px] leading-relaxed mb-3">
              {assets.length === 0
                ? "Drag image files onto the canvas or click import below."
                : "Try a different search term."}
            </p>
            {assets.length === 0 && (
              <button
                type="button"
                aria-label="Choose image file from disk"
                className="px-2.5 py-1 text-[10.5px] rounded bg-[#161f2c] text-[#38bdf8] hover:bg-[#1e2c40] border border-[#38bdf8]/30 transition-colors font-medium flex items-center gap-1.5 cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <Plus size={11} strokeWidth={2} aria-hidden="true" />
                <span>Choose Image</span>
              </button>
            )}
          </div>
        ) : (
          <div
            className="grid grid-cols-2 gap-2"
            data-testid="asset-thumbnail-grid"
          >
            {filteredAssets.map((asset) => (
              <div
                key={asset.id}
                draggable
                tabIndex={0}
                role="article"
                aria-label={`${asset.name}, ${asset.width} by ${asset.height} pixels. Press Enter to add to canvas`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    addAssetToCanvas(asset);
                  }
                }}
                onDragStart={(e) => handleAssetDragStart(e, asset)}
                data-testid={`asset-card-${asset.id}`}
                className="group relative flex flex-col bg-[#0e131a] border border-[#1f2735] hover:border-[#38bdf8]/70 rounded overflow-hidden cursor-grab active:cursor-grabbing transition-all hover:shadow-md"
                title={`${asset.name} (${asset.width}×${asset.height}) - Drag onto canvas to insert`}
              >
                {/* Thumbnail viewport */}
                <div className="h-20 w-full bg-[#070a0e] flex items-center justify-center p-1.5 overflow-hidden relative">
                  <img
                    src={asset.dataUrl}
                    alt={asset.name}
                    className="max-h-full max-w-full object-contain pointer-events-none select-none"
                    loading="lazy"
                  />

                  {/* Hover action overlay */}
                  <div className="absolute inset-0 bg-[#070b10]/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 backdrop-blur-[1px]">
                    <button
                      type="button"
                      data-testid={`button-insert-asset-${asset.id}`}
                      aria-label={`Add ${asset.name} to canvas`}
                      className="p-1 rounded bg-[#0284c7] hover:bg-[#0369a1] text-white transition-transform hover:scale-105 shadow-sm cursor-pointer"
                      title="Add to canvas"
                      onClick={(e) => {
                        e.stopPropagation();
                        addAssetToCanvas(asset);
                      }}
                    >
                      <Plus size={13} strokeWidth={2.2} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      data-testid={`button-delete-asset-${asset.id}`}
                      aria-label={`Remove ${asset.name} from project library`}
                      className="p-1 rounded bg-[#202734] hover:bg-rose-900/60 hover:text-rose-300 text-[#94a3b8] transition-colors shadow-sm cursor-pointer"
                      title="Remove from project library"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeAsset(asset.id);
                      }}
                    >
                      <Trash2 size={12} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {/* Card footer details */}
                <div className="px-1.5 py-1 bg-[#0b0f14] border-t border-[#18202c] flex flex-col">
                  <span
                    className="text-[9.5px] font-medium text-[#cbd5e1] truncate leading-tight group-hover:text-[#38bdf8] transition-colors"
                    title={asset.name}
                  >
                    {asset.name}
                  </span>
                  <span className="text-[8px] text-[#55657e] font-mono mt-0.5">
                    {asset.width} × {asset.height}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Subtle Drag Tip at the bottom */}
      {filteredAssets.length > 0 && (
        <div className="px-2.5 py-1.5 border-t border-[#18202c] bg-[#080c10] text-[8.5px] text-[#55657e] flex items-center justify-between">
          <span>Drag card onto canvas to insert</span>
          <span className="text-[#38bdf8]">PNG / JPG / SVG</span>
        </div>
      )}
    </div>
  );
}
