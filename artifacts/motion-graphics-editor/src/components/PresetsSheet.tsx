import React, { useState, useEffect, useMemo } from "react";
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
import { useEditorStore, useEditorUIStore } from "../store/editor-store";
import {
  BUILT_IN_ANIMATION_PRESETS,
  BUILT_IN_SCENE_TEMPLATES,
  type AnimationPreset,
  type SceneTemplate,
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
  Play,
  Check,
  Trash2,
  Plus,
  Video,
  Camera as CameraIcon,
  LogIn,
  LogOut,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  LayoutTemplate,
} from "lucide-react";

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

  const activeScene = useMemo(
    () => scenes.find((s) => s.id === activeSceneId),
    [scenes, activeSceneId],
  );

  const [userPresets, setUserPresets] = useState<UserPreset[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [animCategory, setAnimCategory] = useState<
    "all" | "entrance" | "exit" | "camera" | "user"
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
      if (animCategory !== "all" && preset.category !== animCategory) {
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

  const handleTemplateCardClick = (template: SceneTemplate) => {
    const hasLayers = (activeScene?.layers?.length || 0) > 0;
    if (!hasLayers) {
      // Direct merge if scene is currently empty
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
                  Motion Presets & Templates
                </SheetTitle>
              </div>
              <SheetDescription className="text-[10px] text-[#8c919c] leading-relaxed">
                Inspectable, modular animation blocks and ready-to-insert scene layouts.
              </SheetDescription>
            </SheetHeader>

            {/* Tab Selectors: Animations vs Templates */}
            <div className="flex items-center gap-1 bg-[#1a1c22] p-0.5 rounded-lg border border-[#252830] mt-3" role="tablist" aria-label="Preset categories">
              <button
                type="button"
                role="tab"
                aria-selected={presetsTab === "animations"}
                aria-label={`Animation Presets, ${allAnimationPresets.length} available`}
                className={`flex-1 py-1.5 px-3 text-[10.5px] font-medium rounded-md transition-all flex items-center justify-center gap-1.5 ${
                  presetsTab === "animations"
                    ? "bg-[#252a34] text-white shadow-sm font-semibold"
                    : "text-[#828690] hover:text-[#c4c7d0]"
                }`}
                onClick={() => setPresetsTab("animations")}
                data-testid="tab-presets-animations"
              >
                <Sparkles size={12} className={presetsTab === "animations" ? "text-[#38bdf8]" : ""} aria-hidden="true" />
                <span>Animations ({allAnimationPresets.length})</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={presetsTab === "templates"}
                aria-label={`Scene Templates, ${allTemplates.length} available`}
                className={`flex-1 py-1.5 px-3 text-[10.5px] font-medium rounded-md transition-all flex items-center justify-center gap-1.5 ${
                  presetsTab === "templates"
                    ? "bg-[#252a34] text-white shadow-sm font-semibold"
                    : "text-[#828690] hover:text-[#c4c7d0]"
                }`}
                onClick={() => setPresetsTab("templates")}
                data-testid="tab-presets-templates"
              >
                <LayoutTemplate size={12} className={presetsTab === "templates" ? "text-[#38bdf8]" : ""} aria-hidden="true" />
                <span>Templates ({allTemplates.length})</span>
              </button>
            </div>

            {/* Search Bar */}
            <div className="relative mt-2.5">
              <Search
                size={12}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5c616c]"
                aria-hidden="true"
              />
              <input
                type="text"
                placeholder={
                  presetsTab === "animations"
                    ? "Filter animation blocks by name..."
                    : "Search scene templates..."
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label={presetsTab === "animations" ? "Filter animation presets" : "Search scene templates"}
                className="w-full bg-[#171920] border border-[#252831] rounded-md text-[10px] text-[#e2e4e9] placeholder-[#5c616c] pl-7 pr-3 py-1.5 outline-none focus:border-[#38bdf8]/60 transition-colors"
                data-testid="input-presets-search"
              />
            </div>

            {/* Category Filter Chips for Animations */}
            {presetsTab === "animations" && (
              <div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto pb-0.5 no-scrollbar" role="toolbar" aria-label="Animation categories filter">
                {(
                  [
                    { id: "all", label: "All" },
                    { id: "entrance", label: "Entrances" },
                    { id: "exit", label: "Exits" },
                    { id: "camera", label: "Camera" },
                    { id: "user", label: `My Presets (${userAnimationPresets.length})` },
                  ] as const
                ).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={animCategory === c.id}
                    aria-label={`Filter by ${c.label}`}
                    className={`text-[9px] px-2.5 py-1 rounded-full whitespace-nowrap transition-colors border ${
                      animCategory === c.id
                        ? "bg-[#38bdf8]/15 text-[#38bdf8] border-[#38bdf8]/40 font-medium"
                        : "bg-[#181a20] text-[#7a7f8c] border-[#252832] hover:text-[#c4c7d0]"
                    }`}
                    onClick={() => setAnimCategory(c.id)}
                    data-testid={`filter-category-${c.id}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* ANIMATIONS TAB CONTENT */}
            {presetsTab === "animations" && (
              <>
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
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-[11px] text-white group-hover:text-[#38bdf8] transition-colors">
                                {preset.name}
                              </span>
                              {preset.isUserCreated ? (
                                <span className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#8b5cf6]/20 text-[#c4b5fd] border border-[#8b5cf6]/30 font-medium">
                                  User
                                </span>
                              ) : isCamera ? (
                                <span className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#10b981]/20 text-[#6ee7b7] border border-[#10b981]/30 font-medium flex items-center gap-0.5">
                                  <CameraIcon size={8} aria-hidden="true" /> Camera
                                </span>
                              ) : preset.category === "entrance" ? (
                                <span className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#38bdf8]/15 text-[#7dd3fc] border border-[#38bdf8]/30 font-medium flex items-center gap-0.5">
                                  <LogIn size={8} aria-hidden="true" /> In
                                </span>
                              ) : (
                                <span className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#f43f5e]/15 text-[#fda4af] border border-[#f43f5e]/30 font-medium flex items-center gap-0.5">
                                  <LogOut size={8} aria-hidden="true" /> Out
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5">
                              {preset.isUserCreated && (
                                <button
                                  type="button"
                                  title="Delete user preset"
                                  aria-label={`Delete custom preset ${preset.name}`}
                                  onClick={(e) => handleDeleteUserPreset(e, preset.id)}
                                  className="text-[#64748b] hover:text-[#f87171] p-1 rounded hover:bg-[#232731] transition-colors"
                                  data-testid={`button-delete-preset-${preset.id}`}
                                >
                                  <Trash2 size={11} aria-hidden="true" />
                                </button>
                              )}

                              <button
                                type="button"
                                disabled={!canApply}
                                aria-label={isApplied ? `Applied preset ${preset.name}` : `Apply preset ${preset.name}`}
                                data-testid={`button-apply-preset-${preset.id}`}
                                className={`text-[9px] font-medium px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${
                                  isApplied
                                    ? "bg-[#10b981] text-white"
                                    : "bg-[#20242e] text-[#cfd3dc] group-hover:bg-[#0284c7] group-hover:text-white"
                                }`}
                              >
                                {isApplied ? (
                                  <>
                                    <Check size={9} strokeWidth={2.5} aria-hidden="true" />
                                    <span>Applied</span>
                                  </>
                                ) : (
                                  <>
                                    <span>Apply</span>
                                  </>
                                )}
                              </button>
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
              </>
            )}

            {/* TEMPLATES TAB CONTENT */}
            {presetsTab === "templates" && (
              <>
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
                                <span className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#8b5cf6]/20 text-[#c4b5fd] border border-[#8b5cf6]/30 font-medium">
                                  My Template
                                </span>
                              ) : (
                                <span className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#0284c7]/20 text-[#38bdf8] border border-[#0284c7]/30 font-medium capitalize">
                                  {template.category || "Layout"}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5">
                              {template.isUserCreated && (
                                <button
                                  type="button"
                                  title="Delete user template"
                                  aria-label={`Delete custom template ${template.name}`}
                                  onClick={(e) => handleDeleteUserPreset(e, template.id)}
                                  className="text-[#64748b] hover:text-[#f87171] p-1 rounded hover:bg-[#232731] transition-colors"
                                  data-testid={`button-delete-template-${template.id}`}
                                >
                                  <Trash2 size={11} aria-hidden="true" />
                                </button>
                              )}

                              <button
                                type="button"
                                aria-label={isApplied ? `Inserted template ${template.name}` : `Insert template ${template.name}`}
                                data-testid={`button-insert-template-${template.id}`}
                                className={`text-[9px] font-medium px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${
                                  isApplied
                                    ? "bg-[#10b981] text-white"
                                    : "bg-[#20242e] text-[#cfd3dc] group-hover:bg-[#0284c7] group-hover:text-white"
                                }`}
                              >
                                {isApplied ? (
                                  <>
                                    <Check size={9} strokeWidth={2.5} aria-hidden="true" />
                                    <span>Inserted</span>
                                  </>
                                ) : (
                                  <>
                                    <span>Insert</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Description */}
                          <p className="text-[9.5px] text-[#8c919d] leading-relaxed">
                            {template.description}
                          </p>

                          {/* Metadata row */}
                          <div className="flex items-center gap-3 pt-1 border-t border-[#1f222a] text-[8.5px] text-[#717684]">
                            <span className="flex items-center gap-1">
                              <Layers size={10} className="text-[#38bdf8]" aria-hidden="true" />
                              <span>{template.layers.length} layers</span>
                            </span>
                            <span className="flex items-center gap-1">
                              <Sparkles size={10} className="text-[#f59e0b]" aria-hidden="true" />
                              <span>{template.animationBlocks.length} animations</span>
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock size={10} className="text-[#a855f7]" aria-hidden="true" />
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
              </>
            )}
          </div>
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
            <button
              type="button"
              aria-label="Add template as a new separate scene"
              className="w-full text-left p-2.5 rounded-lg border border-[#2b303c] bg-[#1a1d24] hover:bg-[#222732] hover:border-[#38bdf8]/50 transition-colors group"
              onClick={() => handleConfirmTemplateAction("new")}
              data-testid="button-template-new-scene"
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[11px] font-medium text-white group-hover:text-[#38bdf8]">
                  Add as New Scene
                </span>
                <Plus size={12} className="text-[#38bdf8]" aria-hidden="true" />
              </div>
              <p className="text-[9px] text-[#7f8490]">
                Creates a new clean scene in this project preserving your current composition.
              </p>
            </button>

            <button
              type="button"
              aria-label="Merge template layers and animations into current scene"
              className="w-full text-left p-2.5 rounded-lg border border-[#2b303c] bg-[#1a1d24] hover:bg-[#222732] hover:border-[#38bdf8]/50 transition-colors group"
              onClick={() => handleConfirmTemplateAction("merge")}
              data-testid="button-template-merge"
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[11px] font-medium text-white group-hover:text-[#38bdf8]">
                  Merge into Current Scene
                </span>
                <Layers size={12} className="text-[#38bdf8]" aria-hidden="true" />
              </div>
              <p className="text-[9px] text-[#7f8490]">
                Appends the template layers and keyframed animations alongside existing items.
              </p>
            </button>
          </div>

          <DialogFooter className="pt-2 border-t border-[#20232b]">
            <button
              type="button"
              aria-label="Cancel template insertion"
              className="px-3 py-1 text-[10px] text-[#9ca1ad] hover:text-white rounded hover:bg-[#20232b] transition-colors"
              onClick={() => setTemplateConfirmOpen(false)}
            >
              Cancel
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
