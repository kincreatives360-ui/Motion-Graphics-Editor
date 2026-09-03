import { useState, useRef, useEffect } from "react";
import {
  ChevronDown,
  CircleHelp,
  CirclePlay,
  Download,
  Hand,
  MousePointer2,
  Pause,
  Plus,
  Search,
  Share2,
  SlidersHorizontal,
  SunMedium,
  TextCursorInput,
  ZoomIn,
} from "lucide-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEditorStore, useEditorUIStore, type ToolId } from "./store/editor-store";
import { CanvasStage } from "./canvas/CanvasStage";
import { LayerTree } from "./components/LayerTree";
import { AssetsPanel } from "./components/AssetsPanel";
import { Inspector } from "./components/Inspector";
import { Timeline } from "./components/Timeline";
import { PresetsSheet } from "./components/PresetsSheet";
import { ExportModal } from "./components/ExportModal";
import { useEditorShortcuts } from "./hooks/useEditorShortcuts";
import { SELECT_GROUP_TOOLS } from "./components/ToolSelectDropdown";

type BackgroundMode = "Color" | "Image" | "Shader";

function IconButton({
  label,
  testId,
  children,
  onClick,
  className = "",
}: {
  label: string;
  testId: string;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      className={`icon-button ${className}`}
      type="button"
      aria-label={label}
      title={label}
      data-testid={testId}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function LeftPanel() {
  const [tab, setTab] = useState<"File" | "Assets">("File");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const addLayer = useEditorStore((state) => state.addLayer);

  return (
    <aside className="left-panel" aria-label="Project files and assets">
      <div className="topbar">
        <button className="project-select" type="button" data-testid="button-project-menu" title="Project menu">
          <span>Canvas</span>
          <ChevronDown size={11} strokeWidth={1.8} />
        </button>
        <IconButton
          label="Create new item"
          testId="button-add-item"
          onClick={() => addLayer()}
        >
          <Plus size={14} strokeWidth={1.7} />
        </IconButton>
      </div>
      <div className="asset-tabs" role="tablist" aria-label="Project navigator">
        <button
          className={`asset-tab ${tab === "File" ? "active" : ""}`}
          type="button"
          role="tab"
          aria-selected={tab === "File"}
          data-testid="tab-file"
          onClick={() => setTab("File")}
        >
          File
        </button>
        <button
          className={`asset-tab ${tab === "Assets" ? "active" : ""}`}
          type="button"
          role="tab"
          aria-selected={tab === "Assets"}
          data-testid="tab-assets"
          onClick={() => setTab("Assets")}
        >
          Assets
        </button>
        <IconButton
          label={searchOpen ? "Close search" : "Search"}
          testId="button-search"
          className="search-button"
          onClick={() => {
            setSearchOpen((value) => !value);
            if (searchOpen) setSearchQuery("");
          }}
        >
          <Search size={12} strokeWidth={1.7} />
        </IconButton>
      </div>
      {searchOpen && (
        <div style={{ padding: "7px 8px 0" }}>
          <input
            autoFocus
            className="text-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${tab.toLowerCase()}`}
            aria-label={`Search ${tab}`}
            data-testid="input-search"
          />
        </div>
      )}
      {tab === "File" ? (
        <LayerTree />
      ) : (
        <AssetsPanel searchQuery={searchOpen ? searchQuery : ""} />
      )}
    </aside>
  );
}

function Stage() {
  const activeTool = useEditorUIStore((state) => state.activeTool);
  const setActiveTool = useEditorUIStore((state) => state.setActiveTool);
  const playing = useEditorUIStore((state) => state.playing);
  const setPlaying = useEditorUIStore((state) => state.setPlaying);
  const setExportModalOpen = useEditorUIStore((state) => state.setExportModalOpen);

  const [selectDropdownOpen, setSelectDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);

  // Close dropdown on outside click or escape
  useEffect(() => {
    if (!selectDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        triggerButtonRef.current &&
        !triggerButtonRef.current.contains(target)
      ) {
        setSelectDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectDropdownOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectDropdownOpen]);

  const currentSelectTool =
    SELECT_GROUP_TOOLS.find((t) => t.id === activeTool) ||
    SELECT_GROUP_TOOLS[0];
  const isSelectGroupActive = SELECT_GROUP_TOOLS.some((t) => t.id === activeTool);
  const CurrentIcon = currentSelectTool.Icon;

  const otherTools: Array<{ id: ToolId; label: string; icon: React.ReactNode }> = [
    { id: "shape", label: "Add shape", icon: <SunMedium size={13} strokeWidth={1.6} /> },
    { id: "text", label: "Add text", icon: <TextCursorInput size={13} strokeWidth={1.6} /> },
  ];

  return (
    <section className="center-stage" aria-label="Composition stage">
      <CanvasStage />
      <div className="stage-tools" role="toolbar" aria-label="Canvas tools">
        {/* Dropdown trigger button (button:nth-of-type(1)) */}
        <button
          ref={triggerButtonRef}
          id="button-tool-select-dropdown"
          className={`tool-button select-dropdown-trigger ${isSelectGroupActive ? "active" : ""} ${selectDropdownOpen ? "dropdown-open" : ""}`}
          type="button"
          aria-haspopup="menu"
          aria-expanded={selectDropdownOpen}
          aria-label={`${currentSelectTool.label} (${currentSelectTool.shortcut}) - Select tool mode`}
          title={`${currentSelectTool.label} (${currentSelectTool.shortcut}) - Click to toggle tool menu`}
          data-testid="button-tool-scene"
          onClick={() => {
            if (!isSelectGroupActive) {
              setActiveTool(currentSelectTool.id);
            }
            setSelectDropdownOpen((prev) => !prev);
          }}
        >
          <CurrentIcon className="w-3.5 h-3.5 flex-shrink-0" />
          <svg
            className="tool-dropdown-caret"
            width="5"
            height="3"
            viewBox="0 0 5 3"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M0 0l2.5 3 2.5-3z" />
          </svg>
        </button>

        {/* Dropdown menu matching screenshot */}
        {selectDropdownOpen && (
          <div
            ref={dropdownRef}
            id="menu-tool-select-dropdown"
            className="tool-select-dropdown-menu"
            role="menu"
            aria-label="Selection and navigation tools"
          >
            {SELECT_GROUP_TOOLS.map((item) => {
              const isSelected = activeTool === item.id;
              const ItemIcon = item.Icon;
              return (
                <button
                  key={item.id}
                  id={`menuitem-tool-${item.id}`}
                  role="menuitem"
                  type="button"
                  className={`tool-dropdown-item ${isSelected ? "active" : ""}`}
                  onClick={() => {
                    setActiveTool(item.id);
                    setSelectDropdownOpen(false);
                  }}
                >
                  <div className="tool-dropdown-item-left">
                    <span className="tool-dropdown-item-icon">
                      <ItemIcon className="w-4 h-4" />
                    </span>
                    <span className="tool-dropdown-item-label">{item.label}</span>
                  </div>
                  <span className="tool-dropdown-item-shortcut">{item.shortcut}</span>
                </button>
              );
            })}
          </div>
        )}

        {otherTools.map(({ id, label, icon }) => (
          <button
            key={id}
            className={`tool-button ${activeTool === id ? "active" : ""}`}
            type="button"
            aria-label={label}
            title={label}
            data-testid={`button-tool-${id}`}
            onClick={() => {
              setActiveTool(id);
              setSelectDropdownOpen(false);
            }}
          >
            {icon}
          </button>
        ))}
        <div className="tool-divider" />
        <button
          className="tool-button play"
          type="button"
          aria-label={playing ? "Pause preview" : "Play preview"}
          title={playing ? "Pause preview" : "Play preview"}
          data-testid="button-play-preview"
          onClick={() => setPlaying((value) => !value)}
        >
          {playing ? <Pause size={13} strokeWidth={1.7} /> : <CirclePlay size={13} strokeWidth={1.7} />}
        </button>
        <button
          className="tool-button play"
          type="button"
          aria-label="Export scene (WebM / GIF)"
          title="Export scene (WebM / GIF)"
          data-testid="button-audio-preview"
          onClick={() => setExportModalOpen(true)}
        >
          <Download size={12} strokeWidth={1.7} />
        </button>
      </div>
    </section>
  );
}

function Editor() {
  useEditorShortcuts();
  const exportModalOpen = useEditorUIStore((state) => state.exportModalOpen);
  const setExportModalOpen = useEditorUIStore((state) => state.setExportModalOpen);

  return (
    <main className="editor">
      <LeftPanel />
      <Stage />
      <Timeline />
      <Inspector />
      <PresetsSheet />
      <ExportModal open={exportModalOpen} onOpenChange={setExportModalOpen} />
    </main>
  );
}

function App() {
  return (
    <TooltipProvider>
      <Editor />
      <Toaster />
    </TooltipProvider>
  );
}

export default App;