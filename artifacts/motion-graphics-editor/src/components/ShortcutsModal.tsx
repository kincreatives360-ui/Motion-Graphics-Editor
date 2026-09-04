import React, { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Keyboard,
  Search,
  Sparkles,
  MousePointer,
  Play,
  Layers,
  FlipHorizontal,
  Clock,
  Settings,
  X,
} from "lucide-react";

interface ShortcutItem {
  action: string;
  keys: string[];
  description?: string;
  category: "Tools" | "Playback" | "Canvas & Layers" | "Align & Flip" | "Timeline" | "General";
}

const SHORTCUTS_DATA: ShortcutItem[] = [
  // Tools
  { action: "Select Tool", keys: ["V"], description: "Standard cursor for selection & inspection", category: "Tools" },
  { action: "Move Tool", keys: ["G"], description: "Screen-space translation ignoring 3D tilt", category: "Tools" },
  { action: "Tilt Tool", keys: ["Y"], description: "Orbit camera in 3D perspective space", category: "Tools" },
  { action: "Hand Tool", keys: ["H"], description: "Pan canvas viewport", category: "Tools" },
  { action: "Cut (Scissors) Tool", keys: ["C"], description: "Split clips and blocks directly", category: "Tools" },
  { action: "Animate Mode Toggle", keys: ["⇧", "A"], description: "Edits on canvas/inspector become animation keyframes", category: "Tools" },
  { action: "Text Tool", keys: ["T"], description: "Click to place or drag to size a text layer", category: "Tools" },
  { action: "Rectangle Tool", keys: ["R"], description: "Click to place or drag to size a rectangle", category: "Tools" },
  { action: "Ellipse Tool", keys: ["O"], description: "Click to place or drag to size an ellipse", category: "Tools" },
  { action: "Line Tool", keys: ["L"], description: "Click to place or drag to size a line", category: "Tools" },
  { action: "Arrow Tool", keys: ["⇧", "L"], description: "Click to place or drag to size an arrow", category: "Tools" },
  { action: "Deselect All", keys: ["Esc"], description: "Clear current layer & camera selection", category: "Tools" },

  // Playback
  { action: "Play / Pause", keys: ["Space"], description: "Tap Space to toggle playback", category: "Playback" },
  { action: "Pan Canvas", keys: ["Space + Drag"], description: "Hold Space and drag canvas to pan", category: "Playback" },
  { action: "Go to Start", keys: ["Home", "/", "0"], description: "Jump playhead to beginning of scene (frame 0)", category: "Playback" },
  { action: "Go to End", keys: ["End"], description: "Jump playhead to end of active scene", category: "Playback" },
  { action: "Previous / Next Scene", keys: ["↑", "/", "↓"], description: "Switch between scenes in the project", category: "Playback" },
  { action: "Nudge Playhead", keys: ["←", "/", "→"], description: "Step 1 frame backward / forward", category: "Playback" },
  { action: "Jump Playhead", keys: ["⇧", "←", "/", "⇧", "→"], description: "Step 10 frames backward / forward", category: "Playback" },

  // Canvas and Layers
  { action: "Select All in Scene", keys: ["⌘", "A"], description: "Select all top-level layers in the active scene", category: "Canvas & Layers" },
  { action: "Duplicate Selection", keys: ["⌘", "D"], description: "Clone selected layers with offset", category: "Canvas & Layers" },
  { action: "Copy Layers", keys: ["⌘", "C"], description: "Copy selected layers to clipboard", category: "Canvas & Layers" },
  { action: "Paste Layers", keys: ["⌘", "V"], description: "Paste layers or clipboard SVG/images into scene", category: "Canvas & Layers" },
  { action: "Group Layers", keys: ["⌘", "G"], description: "Nest selected layers into a group container", category: "Canvas & Layers" },
  { action: "Ungroup Layers", keys: ["⌘", "⇧", "G"], description: "Disband group and preserve transformed children", category: "Canvas & Layers" },
  { action: "Bring Forward", keys: ["]"], description: "Move layer one step up in stacking order", category: "Canvas & Layers" },
  { action: "Send Backward", keys: ["["], description: "Move layer one step down in stacking order", category: "Canvas & Layers" },
  { action: "Bring to Front", keys: ["⌘", "]"], description: "Move layer to the very top of stack", category: "Canvas & Layers" },
  { action: "Send to Back", keys: ["⌘", "["], description: "Move layer to the bottom of stack", category: "Canvas & Layers" },
  { action: "Nudge Position", keys: ["Arrows"], description: "Nudge 1px (Hold Shift for 10px)", category: "Canvas & Layers" },
  { action: "Set Opacity 10%–90%", keys: ["1", "–", "9"], description: "Quickly set selected layers opacity to 10%–90%", category: "Canvas & Layers" },
  { action: "Set Opacity 100%", keys: ["0"], description: "Restore selected layers to full 100% opacity", category: "Canvas & Layers" },
  { action: "Hide / Show Selection", keys: ["⌘", "⇧", "H"], description: "Toggle visibility of selected layers", category: "Canvas & Layers" },
  { action: "Delete Selected", keys: ["Delete", "/", "Backspace"], description: "Remove selected layers from scene", category: "Canvas & Layers" },

  // Align and Flip
  { action: "Align Left", keys: ["⌥", "A"], description: "Align selected layers left edge to bounds or canvas", category: "Align & Flip" },
  { action: "Align Right", keys: ["⌥", "D"], description: "Align selected layers right edge to bounds or canvas", category: "Align & Flip" },
  { action: "Align Top", keys: ["⌥", "W"], description: "Align selected layers top edge to bounds or canvas", category: "Align & Flip" },
  { action: "Align Bottom", keys: ["⌥", "S"], description: "Align selected layers bottom edge to bounds or canvas", category: "Align & Flip" },
  { action: "Align Center Horizontal", keys: ["⌥", "H"], description: "Align centers horizontally", category: "Align & Flip" },
  { action: "Align Center Vertical", keys: ["⌥", "V"], description: "Align centers vertically", category: "Align & Flip" },
  { action: "Flip Horizontal", keys: ["⇧", "H"], description: "Mirror horizontally (mirrors group around center)", category: "Align & Flip" },
  { action: "Flip Vertical", keys: ["⇧", "V"], description: "Mirror vertically (mirrors group around center)", category: "Align & Flip" },

  // Timeline
  { action: "Split at Playhead", keys: ["⌘", "B"], description: "Cut intersecting animation blocks at current frame", category: "Timeline" },
  { action: "Trim In-Point", keys: ["Q"], description: "Trim block start boundary to current playhead", category: "Timeline" },
  { action: "Trim Out-Point", keys: ["W"], description: "Trim block end boundary to current playhead", category: "Timeline" },
  { action: "Zoom Timeline In", keys: ["⌘", "+"], description: "Increase timeline time scale (+10%)", category: "Timeline" },
  { action: "Zoom Timeline Out", keys: ["⌘", "-"], description: "Decrease timeline time scale (-10%)", category: "Timeline" },
  { action: "Fit Timeline to View", keys: ["⇧", "Z"], description: "Fit timeline zoom level to 50%", category: "Timeline" },
  { action: "Move Along Timeline", keys: ["⇧", "Scroll"], description: "Scroll horizontally through the timeline tracks", category: "Timeline" },

  // General
  { action: "Undo", keys: ["⌘", "Z"], description: "Step backward in document history", category: "General" },
  { action: "Redo", keys: ["⌘", "⇧", "Z", "/", "⌘", "Y"], description: "Step forward in document history", category: "General" },
  { action: "Quick Search", keys: ["⌘", "K"], description: "Search assets or layers in left panel", category: "General" },
];

const CATEGORIES = [
  { id: "All", label: "All Shortcuts", icon: Sparkles },
  { id: "Tools", label: "Tools", icon: MousePointer },
  { id: "Playback", label: "Playback", icon: Play },
  { id: "Canvas & Layers", label: "Canvas & Layers", icon: Layers },
  { id: "Align & Flip", label: "Align & Flip", icon: FlipHorizontal },
  { id: "Timeline", label: "Timeline", icon: Clock },
  { id: "General", label: "General", icon: Settings },
] as const;

interface ShortcutsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutsModal({ open, onOpenChange }: ShortcutsModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  const filteredShortcuts = useMemo(() => {
    return SHORTCUTS_DATA.filter((item) => {
      const matchesCategory =
        selectedCategory === "All" || item.category === selectedCategory;
      if (!matchesCategory) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const actionMatches = item.action.toLowerCase().includes(q);
      const descMatches = item.description?.toLowerCase().includes(q);
      const keyMatches = item.keys.some((k) => k.toLowerCase().includes(q));
      const catMatches = item.category.toLowerCase().includes(q);
      return actionMatches || descMatches || keyMatches || catMatches;
    });
  }, [searchQuery, selectedCategory]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] w-[92vw] max-w-3xl max-h-[85vh] flex flex-col bg-[#0f1115] border border-[#232730] text-[#cfd3dc] p-0 shadow-[0_25px_60px_rgba(0,0,0,0.85)] rounded-lg overflow-hidden outline-none"
        data-testid="modal-shortcuts"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1c2028] bg-[#14171d]/80 backdrop-blur-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-[#0284c7]/20 border border-[#38bdf8]/40 flex items-center justify-center text-[#38bdf8] shadow-sm">
              <Keyboard size={15} />
            </div>
            <div>
              <DialogTitle className="text-sm font-semibold text-white tracking-wide">
                Keyboard Shortcuts & Reference
              </DialogTitle>
              <DialogDescription className="text-[11px] text-[#8492a6] mt-0.5">
                Full list of in-app shortcuts grouped by workflow. Use Cmd on macOS or Ctrl on Windows.
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="px-6 py-3 border-b border-[#1a1d24] bg-[#111318] flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Search Field */}
          <div className="relative w-full sm:w-72">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#64748b] pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search shortcuts (e.g., 'align', 'trim', 'V')..."
              className="w-full bg-[#181b22] border border-[#262a34] rounded-md pl-8 pr-7 py-1.5 text-[11px] text-white placeholder-[#64748b] focus:outline-none focus:border-[#0284c7] transition-colors"
              data-testid="input-shortcuts-search"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#64748b] hover:text-white"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                    isSelected
                      ? "bg-[#0284c7] text-white font-semibold shadow-sm"
                      : "bg-[#181b22] hover:bg-[#202530] text-[#94a3b8] hover:text-white border border-[#242832]"
                  }`}
                >
                  <Icon size={10} />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Shortcuts List Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5 scrollbar-studio max-h-[55vh]">
          {filteredShortcuts.length === 0 ? (
            <div className="py-12 text-center text-[12px] text-[#64748b]">
              No shortcuts found matching "{searchQuery}"
            </div>
          ) : (
            (() => {
              // Group items by category if "All" is selected
              const groups: Record<string, ShortcutItem[]> = {};
              filteredShortcuts.forEach((item) => {
                if (!groups[item.category]) groups[item.category] = [];
                groups[item.category].push(item);
              });

              return Object.entries(groups).map(([catTitle, items]) => (
                <div key={catTitle} className="space-y-2">
                  <div className="text-[10px] uppercase font-mono tracking-wider font-semibold text-[#38bdf8] flex items-center gap-2 border-b border-[#1c2028] pb-1">
                    <span>{catTitle}</span>
                    <span className="text-[9px] font-sans font-normal text-[#64748b] lowercase tracking-normal">
                      ({items.length})
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {items.map((item) => (
                      <div
                        key={item.action}
                        className="flex items-center justify-between p-2 rounded-md bg-[#13161c] hover:bg-[#181c24] border border-[#1e232c] transition-colors gap-3"
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="text-[11.5px] font-medium text-[#e2e8f0] truncate">
                            {item.action}
                          </span>
                          {item.description && (
                            <span className="text-[9.5px] text-[#718096] truncate">
                              {item.description}
                            </span>
                          )}
                        </div>

                        {/* Keys Badge Group */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {item.keys.map((k, idx) => {
                            if (k === "/" || k === "–" || k === "+") {
                              return (
                                <span
                                  key={idx}
                                  className="text-[9px] text-[#64748b] font-mono select-none px-0.5"
                                >
                                  {k}
                                </span>
                              );
                            }
                            return (
                              <kbd
                                key={idx}
                                className="px-1.5 py-0.5 rounded bg-[#1c222c] border border-[#2d3748] text-[#38bdf8] font-mono text-[10px] font-semibold shadow-xs select-none"
                              >
                                {k}
                              </kbd>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ));
            })()
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-[#1c2028] bg-[#121419] text-[10px] text-[#718096]">
          <div className="flex items-center gap-2">
            <span>Tip: Press</span>
            <kbd className="px-1.5 py-0.5 rounded bg-[#1c222c] border border-[#2d3748] text-[#38bdf8] font-mono text-[9px] font-semibold">
              Esc
            </kbd>
            <span>at any time to close dialogs or deselect layers.</span>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-3 py-1 bg-[#1e232d] hover:bg-[#282f3c] text-white rounded text-[11px] font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

