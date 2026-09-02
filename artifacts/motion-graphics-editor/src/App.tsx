import { useState } from "react";
import {
  ChevronDown,
  CircleHelp,
  CirclePlay,
  Download,
  Grid2X2,
  Hand,
  MousePointer2,
  MoveDiagonal2,
  Pause,
  Plus,
  Search,
  Share2,
  SlidersHorizontal,
  SunMedium,
  TextCursorInput,
  ZoomIn,
} from "lucide-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEditorStore, type ToolId } from "./store/editor-store";
import { CanvasStage } from "./canvas/CanvasStage";
import { LayerTree } from "./components/LayerTree";
import { useEditorShortcuts } from "./hooks/useEditorShortcuts";

const queryClient = new QueryClient();

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
          onClick={() => setSearchOpen((value) => !value)}
        >
          <Search size={12} strokeWidth={1.7} />
        </IconButton>
      </div>
      {searchOpen && (
        <div style={{ padding: "7px 8px 0" }}>
          <input
            autoFocus
            className="text-input"
            placeholder={`Search ${tab.toLowerCase()}`}
            aria-label={`Search ${tab}`}
            data-testid="input-search"
          />
        </div>
      )}
      {tab === "File" ? (
        <LayerTree />
      ) : (
        <div className="panel-empty" data-testid="text-empty-assets">
          No assets.
        </div>
      )}
    </aside>
  );
}

function Inspector() {
  const saveStatus = useEditorStore((state) => state.saveStatus);
  const projectName = useEditorStore((state) => state.projectName);
  const setProjectName = useEditorStore((state) => state.setProjectName);
  const aspectRatio = useEditorStore((state) => state.aspectRatio);
  const setAspectRatio = useEditorStore((state) => state.setAspectRatio);

  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>("Color");
  const [lens, setLens] = useState("F 50 mm");
  const [shared, setShared] = useState(false);

  const ratioValue =
    aspectRatio === "9:16"
      ? "Portrait 9:16"
      : aspectRatio === "1:1"
      ? "Square 1:1"
      : "Landscape 16:9";

  const handleRatioChange = (val: string) => {
    if (val.includes("9:16")) {
      setAspectRatio("9:16");
    } else if (val.includes("1:1")) {
      setAspectRatio("1:1");
    } else {
      setAspectRatio("16:9");
    }
  };

  return (
    <aside className="right-panel" aria-label="Project inspector">
      <div className="inspector-topbar">
        <div className="avatar" data-testid="avatar-user" aria-label="User avatar">A</div>
        <div className="inspector-actions">
          <IconButton label="Inspector settings" testId="button-inspector-settings">
            <SlidersHorizontal size={12} strokeWidth={1.7} />
          </IconButton>
          <IconButton label="Export project" testId="button-export">
            <Share2 size={12} strokeWidth={1.7} />
          </IconButton>
          <button
            className="share-button"
            type="button"
            data-testid="button-share"
            onClick={() => setShared(true)}
            onBlur={() => setShared(false)}
          >
            Share
          </button>
        </div>
      </div>
      <div className="inspector-body">
        <span className="section-label">Project</span>
        <label className="field">
          <span className="field-label">Name</span>
          <input
            className="text-input"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            data-testid="input-project-name"
          />
        </label>
        <label className="field">
          <span className="field-label">Aspect Ratio</span>
          <span className="select-wrap">
            <select
              className="select-input"
              value={ratioValue}
              onChange={(event) => handleRatioChange(event.target.value)}
              data-testid="select-aspect-ratio"
            >
              <option>Landscape 16:9</option>
              <option>Portrait 9:16</option>
              <option>Square 1:1</option>
            </select>
          </span>
        </label>
        <label className="field">
          <span className="field-label">Lens</span>
          <input
            className="text-input"
            value={lens}
            onChange={(event) => setLens(event.target.value)}
            data-testid="input-lens"
          />
        </label>
        <div className="field">
          <span className="field-label">Background</span>
          <div className="background-tabs" role="tablist" aria-label="Background type">
            {(["Color", "Image", "Shader"] as BackgroundMode[]).map((mode) => (
              <button
                key={mode}
                className={`background-tab ${backgroundMode === mode ? "active" : ""}`}
                type="button"
                role="tab"
                aria-selected={backgroundMode === mode}
                data-testid={`tab-background-${mode.toLowerCase()}`}
                onClick={() => setBackgroundMode(mode)}
              >
                {mode}
              </button>
            ))}
          </div>
          <span className="field-label">Color</span>
          <button className="color-input" type="button" data-testid="button-background-color" title="Choose background color">
            <span className="color-swatch" />
            <span>000102</span>
          </button>
        </div>
      </div>
      <div className="inspector-footer flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconButton
            label="Presets"
            testId="button-open-presets"
            onClick={() => {
              console.log("Open presets");
            }}
          >
            <SlidersHorizontal size={12} strokeWidth={1.7} />
          </IconButton>
          <span
            data-testid="status-local-save"
            className="text-[9px] text-[#718096] flex items-center gap-1 select-none font-medium"
            title={saveStatus === "saving" ? "Saving to local database..." : "Document saved locally"}
          >
            {saveStatus === "saving" ? (
              <>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                <span>Saving…</span>
              </>
            ) : (
              <>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500/80" />
                <span>Saved locally</span>
              </>
            )}
          </span>
        </div>
        <button
          className="help-button"
          type="button"
          aria-label="Help"
          data-testid="button-help"
        >
          <CircleHelp size={12} strokeWidth={1.8} />
        </button>
      </div>
      {shared && (
        <div
          role="status"
          data-testid="status-editor-prompt"
          style={{
            position: "absolute",
            bottom: 34,
            left: 8,
            right: 8,
            padding: "7px 8px",
            border: "1px solid #2f3940",
            borderRadius: 4,
            background: "#182126",
            color: "#a7cfe2",
            fontSize: 9,
          }}
        >
          Share link ready
        </div>
      )}
    </aside>
  );
}

function Stage() {
  const activeTool = useEditorStore((state) => state.activeTool);
  const setActiveTool = useEditorStore((state) => state.setActiveTool);
  const playing = useEditorStore((state) => state.playing);
  const setPlaying = useEditorStore((state) => state.setPlaying);

  const tools: Array<{ id: ToolId; label: string; icon: React.ReactNode }> = [
    { id: "scene", label: "Scene select", icon: <MousePointer2 size={13} strokeWidth={1.6} /> },
    { id: "hand", label: "Pan canvas", icon: <Hand size={13} strokeWidth={1.6} /> },
    { id: "shape", label: "Add shape", icon: <SunMedium size={13} strokeWidth={1.6} /> },
    { id: "text", label: "Add text", icon: <TextCursorInput size={13} strokeWidth={1.6} /> },
    { id: "node", label: "Add node", icon: <MoveDiagonal2 size={13} strokeWidth={1.6} /> },
    { id: "grid", label: "Toggle guides", icon: <Grid2X2 size={13} strokeWidth={1.6} /> },
  ];

  return (
    <section className="center-stage" aria-label="Composition stage">
      <CanvasStage />
      <div className="stage-tools" role="toolbar" aria-label="Canvas tools">
        {tools.map(({ id, label, icon }) => (
          <button
            key={id}
            className={`tool-button ${activeTool === id ? "active" : ""}`}
            type="button"
            aria-label={label}
            title={label}
            data-testid={`button-tool-${id}`}
            onClick={() => setActiveTool(id)}
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
        <button className="tool-button play" type="button" aria-label="Audio preview" title="Audio preview" data-testid="button-audio-preview">
          <Download size={12} strokeWidth={1.7} />
        </button>
        <button className="upgrade" type="button" data-testid="button-upgrade">Upgrade</button>
      </div>
    </section>
  );
}

function Timeline() {
  const [zoom, setZoom] = useState("54");
  const [playing, setPlaying] = useState(false);

  return (
    <section className="timeline" aria-label="Timeline">
      <div className="timeline-top">
        <button
          className="timeline-playhead-button"
          type="button"
          aria-label={playing ? "Pause timeline" : "Play timeline"}
          title={playing ? "Pause timeline" : "Play timeline"}
          data-testid="button-timeline-play"
          onClick={() => setPlaying((value) => !value)}
        >
          {playing ? <Pause size={12} strokeWidth={1.7} /> : <CirclePlay size={12} strokeWidth={1.7} />}
        </button>
        <label className="zoom-control" aria-label="Timeline zoom">
          <input
            className="timeline-range"
            type="range"
            min="0"
            max="100"
            value={zoom}
            onChange={(event) => setZoom(event.target.value)}
            data-testid="input-timeline-zoom"
          />
        </label>
      </div>
      <div className="timeline-body">
        <span className="time-zero" data-testid="text-time-zero">0:00</span>
        <div className="playhead" data-testid="timeline-playhead" />
        <button className="shot-lane" type="button" data-testid="button-add-shot">Click to add shot</button>
      </div>
    </section>
  );
}

function Editor() {
  useEditorShortcuts();

  return (
    <main className="editor">
      <LeftPanel />
      <Stage />
      <Timeline />
      <Inspector />
    </main>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Editor />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;