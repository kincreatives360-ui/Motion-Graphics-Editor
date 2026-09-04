import React, { useState, useRef, useEffect } from "react";
import { useEditorUIStore, type ToolId } from "../store/editor-store";

export function RectIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  );
}

export function EllipseIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

export function LineIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="4" y1="20" x2="20" y2="4" />
    </svg>
  );
}

export function ArrowIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="4" y1="12" x2="20" y2="12" />
      <polyline points="14 6 20 12 14 18" />
    </svg>
  );
}

export interface ShapeToolOption {
  id: ToolId;
  label: string;
  shortcut: string;
  Icon: React.ComponentType<{ className?: string }>;
}

export const SHAPE_TOOLS: ShapeToolOption[] = [
  { id: "rectangle", label: "Rectangle", shortcut: "R", Icon: RectIcon },
  { id: "ellipse", label: "Ellipse", shortcut: "O", Icon: EllipseIcon },
  { id: "line", label: "Line", shortcut: "L", Icon: LineIcon },
  { id: "arrow", label: "Arrow", shortcut: "⇧L", Icon: ArrowIcon },
];

export function ShapeSelectDropdown() {
  const activeTool = useEditorUIStore((state) => state.activeTool);
  const setActiveTool = useEditorUIStore((state) => state.setActiveTool);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [lastSelectedTool, setLastSelectedTool] = useState<ToolId>("rectangle");

  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isShapeActive =
    activeTool === "rectangle" ||
    activeTool === "ellipse" ||
    activeTool === "line" ||
    activeTool === "arrow" ||
    activeTool === "shape";

  const currentOption =
    SHAPE_TOOLS.find((t) => t.id === activeTool) ||
    SHAPE_TOOLS.find((t) => t.id === lastSelectedTool) ||
    SHAPE_TOOLS[0];

  const CurrentIcon = currentOption.Icon;

  // Track the most recently chosen shape tool
  useEffect(() => {
    if (
      activeTool === "rectangle" ||
      activeTool === "ellipse" ||
      activeTool === "line" ||
      activeTool === "arrow"
    ) {
      setLastSelectedTool(activeTool);
    }
  }, [activeTool]);

  // Click outside and escape handling
  useEffect(() => {
    if (!dropdownOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        triggerButtonRef.current &&
        !triggerButtonRef.current.contains(target)
      ) {
        setDropdownOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDropdownOpen(false);
      }
    };

    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [dropdownOpen]);

  return (
    <div className="relative inline-flex items-center">
      <button
        ref={triggerButtonRef}
        id="button-shape-select-dropdown"
        className={`tool-button select-dropdown-trigger ${isShapeActive ? "active" : ""} ${
          dropdownOpen ? "dropdown-open" : ""
        }`}
        type="button"
        aria-haspopup="menu"
        aria-expanded={dropdownOpen}
        aria-label={`${currentOption.label} (${currentOption.shortcut}) - Shape tool`}
        title={`${currentOption.label} (${currentOption.shortcut}) - Click to toggle shape menu`}
        data-testid="button-tool-shapes"
        onClick={() => {
          if (!isShapeActive) {
            setActiveTool(currentOption.id);
          }
          setDropdownOpen((prev) => !prev);
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

      {dropdownOpen && (
        <div
          ref={dropdownRef}
          id="menu-shape-select-dropdown"
          className="tool-select-dropdown-menu"
          role="menu"
          aria-label="Shape creation tools"
        >
          {SHAPE_TOOLS.map((item) => {
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
                  setLastSelectedTool(item.id);
                  setDropdownOpen(false);
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
    </div>
  );
}

