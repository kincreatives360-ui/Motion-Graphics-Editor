import React from "react";
import { type ToolId } from "../store/editor-store";

// Clean vector icons matching Woblo / Raylight and the reference screenshot
export function SelectIcon({ className = "w-4 h-4" }: { className?: string }) {
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
      <path d="M4 4l7.07 17 2.51-7.39L21 11.07z" />
      <path d="M13.5 13.5L19 19" />
    </svg>
  );
}

export function HandIcon({ className = "w-4 h-4" }: { className?: string }) {
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
      <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
      <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2" />
      <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.83L7 13" />
    </svg>
  );
}

export function TiltIcon({ className = "w-4 h-4" }: { className?: string }) {
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
      <line x1="3" y1="12" x2="21" y2="12" />
      <ellipse cx="12" cy="12" rx="4.2" ry="9" />
      <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-20 12 12)" />
    </svg>
  );
}

export function MoveIcon({ className = "w-4 h-4" }: { className?: string }) {
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
      {/* Hand pointing up */}
      <path d="M10 13V5a1.5 1.5 0 0 0-3 0v8" />
      <path d="M7 9.5a1.5 1.5 0 0 0-3 0v4.5C4 17.5 6 20.5 9.5 20.5h2c3 0 4.5-2 4.5-5v-4.5a1.5 1.5 0 0 0-3 0V13" />
      <path d="M10 11.5a1.5 1.5 0 0 0 3 0V11" />
      {/* Plus symbol at top right */}
      <path d="M18.5 4v6" />
      <path d="M15.5 7h6" />
    </svg>
  );
}

export function ScissorsIcon({ className = "w-4 h-4" }: { className?: string }) {
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
      <circle cx="6" cy="6" r="3" />
      <path d="M8.12 8.12 12 12" />
      <path d="M20 4 8.12 15.88" />
      <circle cx="6" cy="18" r="3" />
      <path d="M14.8 14.8 20 20" />
    </svg>
  );
}

export interface ToolDropdownOption {
  id: ToolId;
  label: string;
  shortcut: string;
  Icon: React.ComponentType<{ className?: string }>;
}

export const SELECT_GROUP_TOOLS: ToolDropdownOption[] = [
  { id: "scene", label: "Select", shortcut: "V", Icon: SelectIcon },
  { id: "hand", label: "Hand", shortcut: "H", Icon: HandIcon },
  { id: "tilt", label: "Tilt", shortcut: "Y", Icon: TiltIcon },
  { id: "move", label: "Move", shortcut: "G", Icon: MoveIcon },
  { id: "scissors", label: "Scissors", shortcut: "C", Icon: ScissorsIcon },
];
