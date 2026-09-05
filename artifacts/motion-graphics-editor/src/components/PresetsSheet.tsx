import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "./ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { useEditorStore, useEditorUIStore } from "../store/editor-store";
import {
  BUILT_IN_ANIMATION_PRESETS,
  BUILT_IN_SCENE_TEMPLATES,
  REMOCN_SHADERS,
  renderRemocnShaderToCanvas2D,
  type AnimationPreset,
  type SceneTemplate,
  type RemocnShaderDefinition,
} from "../presets/preset-library";
import {
  getUserPresets,
  deleteUserPreset,
  type UserPreset,
} from "../persistence/local-store";
import {
  SlidersHorizontal,
  Sparkles,
  Layers,
  Check,
  Trash2,
  Plus,
  Camera as CameraIcon,
  LogIn,
  LogOut,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  LayoutTemplate,
  Waves,
  Eye,
  Zap,
} from "lucide-react";

/**
 * Animated Canvas Mini-Preview for Remocn Shaders
 */
function ShaderPreviewCanvas({ shader }: { shader: RemocnShaderDefinition }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let animId: number;
    let frame = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      frame++;
      renderRemocnShaderToCanvas2D(ctx, shader.id, canvas.width, canvas.height, frame, 30);
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [shader.id]);

  return (
    <canvas
      ref={canvasRef}
      width={160}
      height={90}
      className="w-full h-24 rounded-md object-cover border border-[#262a34] bg-[#0d0f14]"
    />
  );
}

export function PresetsSheet() {
  const presetsOpen = useEditorUIStore((state) => state.presetsOpen);
  const closePresets = useEditorUIStore((state) => state.closePresets);
  const presetsTab = useEditorUIStore((state) => state.presetsTab);
  const setPresetsTab = useEditorUIStore((state) => state.setPresetsTab);

  const activeSceneId = useEditorStore((state) => state.activeSceneId);
  const scenes = useEditorStore((state) => state.scenes);
  const currentFrame = useEditorUIStore((state) => state.currentFrame);
  const selectedLayerIds = useEditorStore((state) => state.selectedLayerIds);
  const applyAnimationPreset = useEditorStore((state) => state.applyAnimationPreset);
  const applySceneTemplate = useEditorStore((state) => state.applySceneTemplate);
  const addLayer = useEditorStore((state) => state.addLayer);

  const activeScene = useMemo(
    () => scenes.find((s) => s.id === activeSceneId),
    [scenes, activeSceneId],
  );

  const [userPresets, setUserPresets] = useState<UserPreset[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [animCategory, setAnimCategory] = useState<
    "all" | "remocn" | "entrance" | "exit" | "camera" | "user"
  >("all");
  const [shaderCategory, setShaderCategory] = useState<
    "all" | "gradient" | "organic" | "lighting" | "geometric" | "distortion"
  >("all");
  const [appliedPresetId, setAppliedPresetId] = useState<string | null>(null);

  // Template insertion confirmation state
  const [templateConfirmOpen, setTemplateConfirmOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<SceneTemplate | null>(null);

  // Refresh user presets from local-store
  const reloadUserPresets = async () => {
    try {
      const stored = await getUserPresets();
      setUserPresets(stored);
    } catch (e) {
      console.error("Failed to load user presets:", e);
    }
  };

  useEffect(() => {
    if (presetsOpen) {
      reloadUserPresets();
    }
  }, [presetsOpen]);

  // Combine built-in + user animation presets
  const userAnimationPresets = useMemo<AnimationPreset[]>(() => {
    return userPresets
      .filter((p): p is { type: "animation" } & AnimationPreset => p.type === "animation")
      .map((p) => ({
        ...p,
        category: "user" as const,
        isUserCreated: true,
      }));
  }, [userPresets]);

  const allAnimationPresets = useMemo(() => {
    return [...BUILT_IN_ANIMATION_PRESETS, ...userAnimationPresets];
  }, [userAnimationPresets]);

  const filteredAnimationPresets = useMemo(() => {
    return allAnimationPresets.filter((preset) => {
      if (animCategory === "remocn") {
        if (!preset.id.startsWith("remocn-") && !preset.name.includes("Remocn")) return false;
      } else if (animCategory !== "all" && preset.category !== animCategory) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          preset.name.toLowerCase().includes(q) ||
          preset.description.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [allAnimationPresets, animCategory, searchQuery]);

  const filteredShaders = useMemo(() => {
    return REMOCN_SHADERS.filter((shader) => {
      if (shaderCategory !== "all" && shader.category !== shaderCategory) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          shader.name.toLowerCase().includes(q) ||
          shader.description.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [shaderCategory, searchQuery]);

  // Combine built-in + user scene templates
  const userTemplates = useMemo<SceneTemplate[]>(() => {
    return userPresets
      .filter((p): p is { type: "template" } & SceneTemplate => p.type === "template")
      .map((p) => ({
        ...p,
        category: "user" as const,
        isUserCreated: true,
      }));
  }, [userPresets]);

  const allTemplates = useMemo(() => {
    return [...BUILT_IN_SCENE_TEMPLATES, ...userTemplates];
  }, [userTemplates]);

  const filteredTemplates = useMemo(() => {
    if (!searchQuery.trim()) return allTemplates;
    const q = searchQuery.toLowerCase();
    return allTemplates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q),
    );
  }, [allTemplates, searchQuery]);

  const handleApplyAnimation = (preset: AnimationPreset) => {
    applyAnimationPreset(preset);
    setAppliedPresetId(preset.id);
    setTimeout(() => {
      setAppliedPresetId((prev) => (prev === preset.id ? null : prev));
    }, 1400);
  };

  const handleApplyShaderAsLayer = (shader: RemocnShaderDefinition) => {
    // Add a new full-bleed shape layer configured with this shader aesthetic
    addLayer(activeSceneId, {
      name: `${shader.name} Shader Background`,
      type: "shape",
      shape: { kind: "rect", fill: shader.colors[0] || "#090d16" },
      transform: {
        x: 960,
        y: 540,
        width: 1920,
        height: 1080,
        rotation: 0,
        depth: 1000,
      },
      opacity: 0.95,
      visible: true,
      locked: false,
    });
    setAppliedPresetId(shader.id);
    setTimeout(() => {
      setAppliedPresetId((prev) => (prev === shader.id ? null : prev));
    }, 1400);
  };

  const handleTemplateCardClick = (template: SceneTemplate) => {
    const hasLayers = (activeScene?.layers?.length || 0) > 0;
    if (!hasLayers) {
      applySceneTemplate(template, "merge");
      setAppliedPresetId(template.id);
      setTimeout(() => setAppliedPresetId(null), 1400);
    } else {
      setSelectedTemplate(template);
      setTemplateConfirmOpen(true);
    }
  };

  const handleConfirmTemplateAction = (mode: "new" | "merge") => {
    if (!selectedTemplate) return;
    applySceneTemplate(selectedTemplate, mode);
    setTemplateConfirmOpen(false);
    setSelectedTemplate(null);
  };

  const handleDeleteUserPreset = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteUserPreset(id);
    await reloadUserPresets();
  };

  return (
    <>
      <Sheet open={presetsOpen} onOpenChange={(open) => !open && closePresets()}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-md bg-[#121418] border-l border-[#22262e] text-[#f1f3f7] p-0 flex flex-col h-full shadow-2xl z-50 overflow-hidden"
          data-testid="sheet-presets-library"
        >
          {/* Header */}
          <div className="p-4 border-b border-[#20232b] bg-[#16181e]/80 backdrop-blur-sm">
            <SheetHeader className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-[#38bdf8]/10 text-[#38bdf8] flex items-center justify-center border border-[#38bdf8]/20">
                  <SlidersHorizontal size={13} strokeWidth={2} />
                </div>
                <SheetTitle className="text-sm font-semibold tracking-tight text-white flex items-center gap-1.5">
                  Presets & Shaders (remocn)
                </SheetTitle>
              </div>
              <SheetDescription className="text-[10px] text-[#8c919c] leading-relaxed">
                Production-grade animation presets, GLSL shaders, and scene layouts from remocn.
              </SheetDescription>
            </SheetHeader>

            {/* shadcn Tabs Primitives */}
            <Tabs
              value={presetsTab}
              onValueChange={(val) => setPresetsTab(val as "animations" | "shaders" | "templates")}
              className="w-full mt-3"
            >
              <TabsList className="grid grid-cols-3 bg-[#1a1c22] border border-[#252830] p-0.5 rounded-lg h-8 w-full">
                <TabsTrigger
                  value="animations"
                  data-testid="tab-presets-animations"
                  className="text-[10px] h-7 data-[state=active]:bg-[#252a34] data-[state=active]:text-white data-[state=active]:shadow-sm rounded-md font-medium text-[#828690] flex items-center gap-1.5 transition-all"
                >
                  <Sparkles size={11} className="text-[#38bdf8]" />
                  <span>Animate</span>
                </TabsTrigger>
                <TabsTrigger
                  value="shaders"
                  data-testid="tab-presets-shaders"
                  className="text-[10px] h-7 data-[state=active]:bg-[#252a34] data-[state=active]:text-white data-[state=active]:shadow-sm rounded-md font-medium text-[#828690] flex items-center gap-1.5 transition-all"
                >
                  <Waves size={11} className="text-[#a855f7]" />
                  <span>Shaders</span>
                </TabsTrigger>
                <TabsTrigger
                  value="templates"
                  data-testid="tab-presets-templates"
                  className="text-[10px] h-7 data-[state=active]:bg-[#252a34] data-[state=active]:text-white data-[state=active]:shadow-sm rounded-md font-medium text-[#828690] flex items-center gap-1.5 transition-all"
                >
                  <LayoutTemplate size={11} className="text-[#10b981]" />
                  <span>Templates</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Search Bar */}
            <div className="relative mt-2.5">
              <Search
                size={12}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5c616c]"
                aria-hidden="true"
              />
              <Input
                type="text"
                placeholder={
                  presetsTab === "animations"
                    ? "Filter animation blocks by name..."
                    : presetsTab === "shaders"
                    ? "Filter remocn shaders..."
                    : "Search scene templates..."
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search presets and shaders"
                className="w-full bg-[#171920] border-[#252831] text-[10px] text-[#e2e4e9] placeholder:text-[#5c616c] pl-7 pr-3 h-8 focus-visible:ring-1 focus-visible:ring-[#38bdf8]/60"
                data-testid="input-presets-search"
              />
            </div>

            {/* Category Filter Chips for Animations */}
            {presetsTab === "animations" && (
              <div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto pb-0.5 no-scrollbar" role="toolbar">
                {(
                  [
                    { id: "all", label: "All" },
                    { id: "remocn", label: "Remocn Presets" },
                    { id: "entrance", label: "Entrances" },
                    { id: "exit", label: "Exits" },
                    { id: "camera", label: "Camera" },
                    { id: "user", label: `My Presets (${userAnimationPresets.length})` },
                  ] as const
                ).map((c) => (
                  <Button
                    key={c.id}
                    type="button"
                    variant={animCategory === c.id ? "default" : "outline"}
                    size="sm"
                    className={`text-[9px] px-2.5 py-0.5 h-6 rounded-full whitespace-nowrap transition-colors border ${
                      animCategory === c.id
                        ? "bg-[#38bdf8]/15 text-[#38bdf8] border-[#38bdf8]/40 hover:bg-[#38bdf8]/25"
                        : "bg-[#181a20] text-[#7a7f8c] border-[#252832] hover:text-[#c4c7d0] hover:bg-[#20232b]"
                    }`}
                    onClick={() => setAnimCategory(c.id)}
                    data-testid={`filter-category-${c.id}`}
                  >
                    {c.label}
                  </Button>
                ))}
              </div>
            )}

            {/* Category Filter Chips for Shaders */}
            {presetsTab === "shaders" && (
              <div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto pb-0.5 no-scrollbar" role="toolbar">
                {(
                  [
                    { id: "all", label: "All" },
                    { id: "gradient", label: "Gradients" },
                    { id: "organic", label: "Organic" },
                    { id: "lighting", label: "Lighting" },
                    { id: "geometric", label: "Geometric" },
                    { id: "distortion", label: "Distortion" },
                  ] as const
                ).map((c) => (
                  <Button
                    key={c.id}
                    type="button"
                    variant={shaderCategory === c.id ? "default" : "outline"}
                    size="sm"
                    className={`text-[9px] px-2.5 py-0.5 h-6 rounded-full whitespace-nowrap transition-colors border ${
                      shaderCategory === c.id
                        ? "bg-[#a855f7]/15 text-[#c084fc] border-[#a855f7]/40 hover:bg-[#a855f7]/25"
                        : "bg-[#181a20] text-[#7a7f8c] border-[#252832] hover:text-[#c4c7d0] hover:bg-[#20232b]"
                    }`}
                    onClick={() => setShaderCategory(c.id)}
                    data-testid={`filter-shader-${c.id}`}
                  >
                    {c.label}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* Body Content */}
          <ScrollArea className="flex-1 p-4">
            {/* ANIMATIONS TAB CONTENT */}
            {presetsTab === "animations" && (
              <div className="space-y-3">
                {/* Target context header */}
                <div
                  className={`p-2.5 rounded-lg border text-[9.5px] flex items-center gap-2 ${
                    selectedLayerIds.length > 0
                      ? "bg-[#0c2233]/40 border-[#0284c7]/40 text-[#bae6fd]"
                      : "bg-[#241c10]/40 border-[#b45309]/30 text-[#fde68a]"
                  }`}
                  data-testid="presets-target-indicator"
                >
                  {selectedLayerIds.length > 0 ? (
                    <>
                      <CheckCircle2 size={13} className="text-[#38bdf8] shrink-0" />
                      <div className="flex-1 leading-tight">
                        <span className="font-semibold text-white">
                          {selectedLayerIds.length} layer{selectedLayerIds.length > 1 ? "s" : ""} selected
                        </span>
                        {" • "}
                        <span>Clicking a card inserts animation blocks at frame {currentFrame}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertCircle size={13} className="text-[#f59e0b] shrink-0" />
                      <div className="flex-1 leading-tight">
                        <span>Select layers on the canvas to apply layer presets. Camera moves apply globally.</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Animation Preset Cards Grid */}
                {filteredAnimationPresets.length === 0 ? (
                  <div className="text-center py-10 px-4">
                    <p className="text-[11px] text-[#717682] mb-1">No animation presets match your filter</p>
                    <p className="text-[9.5px] text-[#555a64]">Try a different search query or category</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredAnimationPresets.map((preset) => {
                      const isApplied = appliedPresetId === preset.id;
                      const isCamera = preset.category === "camera";
                      const canApply = selectedLayerIds.length > 0 || isCamera;
                      const isRemocn = preset.id.startsWith("remocn-") || preset.name.includes("Remocn");

                      return (
                        <div
                          key={preset.id}
                          role="button"
                          tabIndex={canApply ? 0 : -1}
                          aria-label={`${preset.name}, ${preset.category || "custom"} animation preset. ${preset.description}`}
                          data-testid={`preset-card-${preset.id}`}
                          onClick={() => canApply && handleApplyAnimation(preset)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              if (canApply) handleApplyAnimation(preset);
                            }
                          }}
                          className={`group relative p-3 rounded-lg border transition-all text-left flex flex-col gap-1.5 ${
                            canApply
                              ? "cursor-pointer hover:border-[#38bdf8]/50 hover:bg-[#181c24] bg-[#16181e] border-[#22252e]"
                              : "opacity-60 cursor-not-allowed bg-[#14151a] border-[#1e2027]"
                          }`}
                        >
                          {/* Header row */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-[11px] text-white group-hover:text-[#38bdf8] transition-colors">
                                {preset.name}
                              </span>
                              {isRemocn && (
                                <Badge variant="secondary" className="text-[7.5px] px-1 py-0 bg-[#a855f7]/20 text-[#c084fc] border-[#a855f7]/30">
                                  remocn
                                </Badge>
                              )}
                              {preset.isUserCreated ? (
                                <Badge variant="outline" className="text-[7.5px] px-1 py-0 bg-[#8b5cf6]/20 text-[#c4b5fd] border-[#8b5cf6]/30">
                                  User
                                </Badge>
                              ) : isCamera ? (
                                <Badge variant="outline" className="text-[7.5px] px-1 py-0 bg-[#10b981]/20 text-[#6ee7b7] border-[#10b981]/30 flex items-center gap-0.5">
                                  <CameraIcon size={7} /> Camera
                                </Badge>
                              ) : preset.category === "entrance" ? (
                                <Badge variant="outline" className="text-[7.5px] px-1 py-0 bg-[#38bdf8]/15 text-[#7dd3fc] border-[#38bdf8]/30 flex items-center gap-0.5">
                                  <LogIn size={7} /> In
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[7.5px] px-1 py-0 bg-[#f43f5e]/15 text-[#fda4af] border-[#f43f5e]/30 flex items-center gap-0.5">
                                  <LogOut size={7} /> Out
                                </Badge>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5">
                              {preset.isUserCreated && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Delete user preset"
                                  onClick={(e) => handleDeleteUserPreset(e, preset.id)}
                                  className="h-6 w-6 text-[#64748b] hover:text-[#f87171] hover:bg-[#232731]"
                                  data-testid={`button-delete-preset-${preset.id}`}
                                >
                                  <Trash2 size={11} />
                                </Button>
                              )}

                              <Button
                                size="sm"
                                disabled={!canApply}
                                className={`text-[9px] font-medium px-2 h-6 rounded transition-colors flex items-center gap-1 ${
                                  isApplied
                                    ? "bg-[#10b981] text-white hover:bg-[#10b981]"
                                    : "bg-[#20242e] text-[#cfd3dc] group-hover:bg-[#0284c7] group-hover:text-white"
                                }`}
                                data-testid={`button-apply-preset-${preset.id}`}
                              >
                                {isApplied ? (
                                  <>
                                    <Check size={9} strokeWidth={2.5} />
                                    <span>Applied</span>
                                  </>
                                ) : (
                                  <span>Apply</span>
                                )}
                              </Button>
                            </div>
                          </div>

                          {/* Description */}
                          <p className="text-[9.5px] text-[#8c919d] leading-relaxed line-clamp-2">
                            {preset.description}
                          </p>

                          {/* Block tags */}
                          <div className="flex flex-wrap items-center gap-1 mt-0.5">
                            {preset.blocks.map((block, idx) => (
                              <span
                                key={idx}
                                className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-[#1f222a] border border-[#2b2f3a] text-[#a0a5b2]"
                              >
                                {block.preset} ({block.durationFrames}f, {block.easing})
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* SHADERS TAB CONTENT (remocn) */}
            {presetsTab === "shaders" && (
              <div className="space-y-3">
                <div className="p-2.5 rounded-lg border bg-[#161224]/70 border-[#4c1d95]/40 text-[9.5px] text-[#d8b4fe] flex items-center gap-2">
                  <Waves size={14} className="text-[#c084fc] shrink-0" />
                  <span>
                    Remocn WebGL & GLSL Shaders. Click <strong>Add as Layer</strong> to spawn a responsive animated background layer.
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredShaders.map((shader) => {
                    const isApplied = appliedPresetId === shader.id;

                    return (
                      <div
                        key={shader.id}
                        className="group p-3 rounded-lg border border-[#232731] bg-[#16181f] hover:border-[#a855f7]/50 hover:bg-[#181b24] transition-all flex flex-col gap-2"
                        data-testid={`shader-card-${shader.id}`}
                      >
                        {/* Live Canvas Mini-Preview */}
                        <ShaderPreviewCanvas shader={shader} />

                        {/* Title & Category */}
                        <div className="flex items-center justify-between mt-1">
                          <span className="font-semibold text-[11px] text-white group-hover:text-[#c084fc] transition-colors">
                            {shader.name}
                          </span>
                          <Badge variant="outline" className="text-[7.5px] px-1.5 py-0 bg-[#a855f7]/15 text-[#c084fc] border-[#a855f7]/30 capitalize">
                            {shader.category}
                          </Badge>
                        </div>

                        {/* Description */}
                        <p className="text-[9px] text-[#8c919d] leading-relaxed line-clamp-2">
                          {shader.description}
                        </p>

                        {/* Color swatches */}
                        <div className="flex items-center gap-1 mt-0.5">
                          {shader.colors.map((color, idx) => (
                            <div
                              key={idx}
                              className="w-3 h-3 rounded-full border border-white/20 shadow-xs"
                              style={{ backgroundColor: color }}
                              title={color}
                            />
                          ))}
                        </div>

                        {/* Actions */}
                        <Button
                          size="sm"
                          onClick={() => handleApplyShaderAsLayer(shader)}
                          className={`w-full text-[9px] font-medium h-6 mt-1 rounded transition-colors flex items-center justify-center gap-1.5 ${
                            isApplied
                              ? "bg-[#10b981] text-white hover:bg-[#10b981]"
                              : "bg-[#20242e] text-[#cfd3dc] group-hover:bg-[#7c3aed] group-hover:text-white"
                          }`}
                          data-testid={`button-apply-shader-${shader.id}`}
                        >
                          {isApplied ? (
                            <>
                              <Check size={9} strokeWidth={2.5} />
                              <span>Layer Created</span>
                            </>
                          ) : (
                            <>
                              <Plus size={10} />
                              <span>Add as Background Layer</span>
                            </>
                          )}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TEMPLATES TAB CONTENT */}
            {presetsTab === "templates" && (
              <div className="space-y-3">
                <div className="p-2.5 rounded-lg border bg-[#171920] border-[#252832] text-[9.5px] text-[#9ca1ad] flex items-center justify-between">
                  <span>
                    Click any scene template to add as a new scene or merge into current layout.
                  </span>
                </div>

                {filteredTemplates.length === 0 ? (
                  <div className="text-center py-10 px-4">
                    <p className="text-[11px] text-[#717682] mb-1">No templates found</p>
                    <p className="text-[9.5px] text-[#555a64]">Save a scene layout from the Layer Tree to see it here</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredTemplates.map((template) => {
                      const isApplied = appliedPresetId === template.id;

                      return (
                        <div
                          key={template.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`${template.name}, ${template.category || "Layout"} template, ${template.layers.length} layers, ${template.animationBlocks.length} animations. ${template.description}`}
                          data-testid={`template-card-${template.id}`}
                          onClick={() => handleTemplateCardClick(template)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleTemplateCardClick(template);
                            }
                          }}
                          className="group relative p-3.5 rounded-lg border border-[#232731] bg-[#16181f] hover:border-[#38bdf8]/50 hover:bg-[#181c25] transition-all cursor-pointer text-left flex flex-col gap-2"
                        >
                          {/* Header */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-[11.5px] text-white group-hover:text-[#38bdf8] transition-colors">
                                {template.name}
                              </span>
                              {template.isUserCreated ? (
                                <Badge variant="outline" className="text-[8px] uppercase tracking-wider px-1.5 py-0 bg-[#8b5cf6]/20 text-[#c4b5fd] border-[#8b5cf6]/30">
                                  My Template
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[8px] uppercase tracking-wider px-1.5 py-0 bg-[#0284c7]/20 text-[#38bdf8] border-[#0284c7]/30 capitalize">
                                  {template.category || "Layout"}
                                </Badge>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5">
                              {template.isUserCreated && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Delete user template"
                                  onClick={(e) => handleDeleteUserPreset(e, template.id)}
                                  className="h-6 w-6 text-[#64748b] hover:text-[#f87171] hover:bg-[#232731]"
                                  data-testid={`button-delete-template-${template.id}`}
                                >
                                  <Trash2 size={11} />
                                </Button>
                              )}

                              <Button
                                size="sm"
                                className={`text-[9px] font-medium px-2 h-6 rounded transition-colors flex items-center gap-1 ${
                                  isApplied
                                    ? "bg-[#10b981] text-white hover:bg-[#10b981]"
                                    : "bg-[#20242e] text-[#cfd3dc] group-hover:bg-[#0284c7] group-hover:text-white"
                                }`}
                                data-testid={`button-insert-template-${template.id}`}
                              >
                                {isApplied ? (
                                  <>
                                    <Check size={9} strokeWidth={2.5} />
                                    <span>Inserted</span>
                                  </>
                                ) : (
                                  <span>Insert</span>
                                )}
                              </Button>
                            </div>
                          </div>

                          {/* Description */}
                          <p className="text-[9.5px] text-[#8c919d] leading-relaxed">
                            {template.description}
                          </p>

                          {/* Metadata row */}
                          <div className="flex items-center gap-3 pt-1 border-t border-[#1f222a] text-[8.5px] text-[#717684]">
                            <span className="flex items-center gap-1">
                              <Layers size={10} className="text-[#38bdf8]" />
                              <span>{template.layers.length} layers</span>
                            </span>
                            <span className="flex items-center gap-1">
                              <Sparkles size={10} className="text-[#f59e0b]" />
                              <span>{template.animationBlocks.length} animations</span>
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock size={10} className="text-[#a855f7]" />
                              <span>
                                {template.durationFrames}f ({(template.durationFrames / (template.fps || 30)).toFixed(1)}s)
                              </span>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Template Merge / Add Confirmation Dialog */}
      <Dialog open={templateConfirmOpen} onOpenChange={setTemplateConfirmOpen}>
        <DialogContent
          className="bg-[#15181e] border border-[#272b35] text-white max-w-sm"
          data-testid="dialog-template-conflict"
        >
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <LayoutTemplate size={14} className="text-[#38bdf8]" />
              Apply "{selectedTemplate?.name}"
            </DialogTitle>
            <DialogDescription className="text-[10px] text-[#9ca1ad] leading-relaxed pt-1">
              Your active scene already has {activeScene?.layers.length || 0} layer
              {(activeScene?.layers.length || 0) > 1 ? "s" : ""}. Choose how you'd like to insert this template:
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-2.5 py-2">
            <Button
              type="button"
              className="w-full text-left p-2.5 rounded-lg border border-[#2b303c] bg-[#1a1d24] hover:bg-[#222732] hover:border-[#38bdf8]/50 transition-colors group"
              onClick={() => handleConfirmTemplateAction("new")}
              data-testid="button-template-new-scene"
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[11px] font-medium text-white group-hover:text-[#38bdf8]">
                  Add as New Scene
                </span>
                <Plus size={12} className="text-[#38bdf8]" />
              </div>
              <p className="text-[9px] text-[#7f8490]">
                Creates a new clean scene in this project preserving your current composition.
              </p>
            </Button>

            <Button
              type="button"
              className="w-full text-left p-2.5 rounded-lg border border-[#2b303c] bg-[#1a1d24] hover:bg-[#222732] hover:border-[#38bdf8]/50 transition-colors group"
              onClick={() => handleConfirmTemplateAction("merge")}
              data-testid="button-template-merge"
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[11px] font-medium text-white group-hover:text-[#38bdf8]">
                  Merge into Current Scene
                </span>
                <Layers size={12} className="text-[#38bdf8]" />
              </div>
              <p className="text-[9px] text-[#7f8490]">
                Appends the template layers and keyframed animations alongside existing items.
              </p>
            </Button>
          </div>

          <DialogFooter className="pt-2 border-t border-[#20232b]">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-[10px] text-[#9ca1ad] hover:text-white"
              onClick={() => setTemplateConfirmOpen(false)}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
