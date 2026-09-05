import React, { useState } from "react";
import {
  GripVertical,
  Plus,
  Settings,
  Eye,
  EyeOff,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

export interface EffectTypeOption<TType extends string = string> {
  type: TType;
  name: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  disabled?: boolean;
  disabledTooltip?: string;
}

export interface EffectItemBase {
  id: string;
  type: string;
  enabled: boolean;
  visible: boolean;
}

export interface EffectStackPanelProps<TEffect extends EffectItemBase> {
  title?: string;
  effects: TEffect[];
  effectsOrder?: string[];
  availableTypes: EffectTypeOption<TEffect["type"]>[];
  onAddEffect: (type: TEffect["type"]) => void;
  onRemoveEffect: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onReorder: (newOrder: string[]) => void;
  renderSettings: (effect: TEffect) => React.ReactNode;
  testIdPrefix?: string;
  emptyStateText?: string;
}

export function EffectStackPanel<TEffect extends EffectItemBase>({
  title = "Scene effects",
  effects,
  effectsOrder,
  availableTypes,
  onAddEffect,
  onRemoveEffect,
  onToggleVisible,
  onReorder,
  renderSettings,
  testIdPrefix = "scene-effect",
  emptyStateText = "No effects added. Click + to add an effect.",
}: EffectStackPanelProps<TEffect>) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<"before" | "after" | null>(null);

  // Derive sorted effects according to effectsOrder
  const sortedEffects = React.useMemo(() => {
    if (!effectsOrder || effectsOrder.length === 0) {
      return effects;
    }
    const orderMap = new Map<string, number>();
    effectsOrder.forEach((id, idx) => orderMap.set(id, idx));

    return [...effects].sort((a, b) => {
      const idxA = orderMap.has(a.id) ? orderMap.get(a.id)! : 9999;
      const idxB = orderMap.has(b.id) ? orderMap.get(b.id)! : 9999;
      return idxA - idxB;
    });
  }, [effects, effectsOrder]);

  // Determine which effect types haven't been added yet
  const unaddedTypes = React.useMemo(() => {
    const presentTypes = new Set(effects.map((e) => e.type));
    return availableTypes.filter((t) => !presentTypes.has(t.type));
  }, [effects, availableTypes]);

  const allAdded = unaddedTypes.length === 0;

  // HTML5 Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const isTopHalf = offsetY < rect.height * 0.5;

    setDropTargetId(targetId);
    setDropPosition(isTopHalf ? "before" : "after");
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDropTargetId(null);
    setDropPosition(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) {
      handleDragEnd();
      return;
    }

    const currentOrder = sortedEffects.map((e) => e.id);
    const sourceIdx = currentOrder.indexOf(draggedId);
    const destIdx = currentOrder.indexOf(targetId);

    if (sourceIdx === -1 || destIdx === -1) {
      handleDragEnd();
      return;
    }

    const newOrder = [...currentOrder];
    const [removed] = newOrder.splice(sourceIdx, 1);
    const insertIdx = dropPosition === "after" ? newOrder.indexOf(targetId) + 1 : newOrder.indexOf(targetId);
    newOrder.splice(insertIdx, 0, removed);

    onReorder(newOrder);
    handleDragEnd();
  };

  return (
    <div className="w-full flex flex-col gap-2" data-testid={`${testIdPrefix}-stack-panel`}>
      {/* Header row: small-caps label + Add button */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold tracking-wider text-[#999ba0] uppercase">
          {title}
        </span>

        {allAdded ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled
                className="h-5 w-5 rounded flex items-center justify-center text-[#555861] bg-[#1a1c22] border border-[#26282e] cursor-not-allowed opacity-50 transition-colors"
                data-testid={`${testIdPrefix}-add-button-disabled`}
              >
                <Plus size={11} strokeWidth={2} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-[10px] bg-[#16181d] text-[#c0c2c8] border-[#292c34]">
              All effects added.
            </TooltipContent>
          </Tooltip>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-5 w-5 rounded flex items-center justify-center text-[#8e9199] hover:text-[#ffffff] bg-[#1a1c22] hover:bg-[#252830] border border-[#292c34] transition-colors cursor-pointer"
                data-testid={`${testIdPrefix}-add-button`}
                title="Add effect"
              >
                <Plus size={11} strokeWidth={2} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 bg-[#14161b] border-[#292c34] p-1">
              {unaddedTypes.map((opt) => {
                const Icon = opt.icon;
                if (opt.disabled) {
                  return (
                    <Tooltip key={opt.type}>
                      <TooltipTrigger asChild>
                        <div
                          className="flex items-center gap-2 px-2 py-1.5 text-[10px] text-[#555861] rounded cursor-not-allowed opacity-60 select-none"
                          data-testid={`${testIdPrefix}-add-option-${opt.type}-disabled`}
                        >
                          <Icon size={12} className="text-[#555861] shrink-0" />
                          <span className="font-medium">{opt.name}</span>
                        </div>
                      </TooltipTrigger>
                      {opt.disabledTooltip && (
                        <TooltipContent side="left" className="text-[9.5px] max-w-[200px] bg-[#16181d] text-[#c0c2c8] border-[#292c34]">
                          {opt.disabledTooltip}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  );
                }
                return (
                  <DropdownMenuItem
                    key={opt.type}
                    onClick={() => onAddEffect(opt.type)}
                    className="flex items-center gap-2 px-2 py-1.5 text-[10px] text-[#c5c8d0] hover:text-white focus:text-white hover:bg-[#20232b] focus:bg-[#20232b] rounded cursor-pointer transition-colors"
                    data-testid={`${testIdPrefix}-add-option-${opt.type}`}
                  >
                    <Icon size={12} className="text-[#38bdf8] shrink-0" />
                    <span className="font-medium">{opt.name}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Effect rows list */}
      <div className="flex flex-col gap-1.5" onDragOver={(e) => e.preventDefault()} onDragEnd={handleDragEnd}>
        {sortedEffects.length === 0 ? (
          <div className="text-[9.5px] text-[#6b6e76] italic py-2 px-2.5 text-center bg-[#141519] border border-[#202227] rounded">
            {emptyStateText}
          </div>
        ) : (
          sortedEffects.map((effect) => {
            const typeConfig = availableTypes.find((t) => t.type === effect.type);
            const EffectIcon = typeConfig?.icon;
            const isDragging = draggedId === effect.id;
            const isDropTarget = dropTargetId === effect.id;

            return (
              <div
                key={effect.id}
                draggable
                onDragStart={(e) => handleDragStart(e, effect.id)}
                onDragOver={(e) => handleDragOver(e, effect.id)}
                onDrop={(e) => handleDrop(e, effect.id)}
                className={`relative flex items-center justify-between px-2 py-1.5 rounded bg-[#16181d] border transition-all ${
                  isDragging
                    ? "opacity-40 border-dashed border-[#0284c7]"
                    : "border-[#24272e] hover:border-[#323640]"
                } ${
                  isDropTarget && dropPosition === "before"
                    ? "border-t-[#38bdf8] border-t-2"
                    : isDropTarget && dropPosition === "after"
                    ? "border-b-[#38bdf8] border-b-2"
                    : ""
                }`}
                data-testid={`${testIdPrefix}-row-${effect.type}`}
              >
                {/* Left: Drag grip, Icon, Effect Name */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <div
                    className="text-[#555861] hover:text-[#999ba0] cursor-grab active:cursor-grabbing shrink-0"
                    title="Drag to reorder"
                  >
                    <GripVertical size={11} />
                  </div>
                  {EffectIcon && <EffectIcon size={12} className="text-[#38bdf8] shrink-0" />}
                  <span
                    className={`text-[10px] font-medium truncate select-none ${
                      effect.visible ? "text-[#d8d9dc]" : "text-[#656870] line-through"
                    }`}
                  >
                    {typeConfig?.name || effect.type}
                  </span>
                </div>

                {/* Right actions: Settings Gear (Popover), Eye (Visibility), Trash (Remove) */}
                <div className="flex items-center gap-0.5 shrink-0 ml-1">
                  {/* Settings Popover */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 rounded flex items-center justify-center text-[#7e818a] hover:text-[#ffffff] hover:bg-[#22252e] transition-colors cursor-pointer"
                        title="Effect settings"
                        data-testid={`${testIdPrefix}-settings-button-${effect.type}`}
                      >
                        <Settings size={11} />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      side="left"
                      align="start"
                      sideOffset={8}
                      className="w-64 p-3 bg-[#14161b] border border-[#292c34] text-[#d8d9dc] shadow-xl rounded-md z-50"
                      data-testid={`${testIdPrefix}-settings-popover-${effect.type}`}
                    >
                      <div className="flex items-center gap-1.5 mb-2.5 pb-1.5 border-b border-[#22242a]">
                        {EffectIcon && <EffectIcon size={12} className="text-[#38bdf8]" />}
                        <span className="text-[10.5px] font-semibold text-[#e2e4e9]">
                          {typeConfig?.name || effect.type} Settings
                        </span>
                      </div>
                      {renderSettings(effect)}
                    </PopoverContent>
                  </Popover>

                  {/* Visibility Eye Toggle */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onToggleVisible(effect.id)}
                    className={`h-5 w-5 rounded flex items-center justify-center transition-colors cursor-pointer ${
                      effect.visible
                        ? "text-[#7e818a] hover:text-[#38bdf8] hover:bg-[#22252e]"
                        : "text-[#dc2626] hover:text-[#ef4444] bg-[#dc2626]/10"
                    }`}
                    title={effect.visible ? "Hide effect" : "Show effect"}
                    data-testid={`${testIdPrefix}-eye-button-${effect.type}`}
                  >
                    {effect.visible ? <Eye size={11} /> : <EyeOff size={11} />}
                  </Button>

                  {/* Remove Trash Button */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onRemoveEffect(effect.id)}
                    className="h-5 w-5 rounded flex items-center justify-center text-[#7e818a] hover:text-[#ef4444] hover:bg-[#dc2626]/15 transition-colors cursor-pointer"
                    title="Remove effect"
                    data-testid={`${testIdPrefix}-remove-button-${effect.type}`}
                  >
                    <Trash2 size={11} />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
