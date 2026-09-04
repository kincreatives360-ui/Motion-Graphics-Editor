import { useState, useRef, useCallback } from "react";
import type React from "react";

export interface UseScrubbableNumberOptions {
  /** Current value of the number */
  value: number;
  /** Callback triggered when value changes through scrub */
  onChange: (newValue: number) => void;
  /** Minimum permitted value */
  min?: number;
  /** Maximum permitted value */
  max?: number;
  /** Step increment for snapping (defaults to 1, or 0.01 if span <= 1) */
  step?: number;
  /**
   * Custom sensitivity: value change per pixel dragged.
   * If omitted, automatically derived based on step and (max - min) range.
   */
  sensitivity?: number;
  /** Multiplier when Shift key is pressed (defaults to 5x) */
  shiftMultiplier?: number;
  /** Multiplier when Alt/Option key is pressed (defaults to 0.1x) */
  altMultiplier?: number;
  /** Minimum pixel movement required to distinguish a scrub drag from a normal click (default: 3px) */
  dragThreshold?: number;
  /** Optional callback when scrubbing starts */
  onScrubStart?: () => void;
  /** Optional callback when scrubbing finishes */
  onScrubEnd?: () => void;
  /** Disable scrub gesture */
  disabled?: boolean;
}

export interface UseScrubbableNumberReturn {
  /** Pointer event handlers to spread on the trigger element */
  scrubProps: {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void;
    style: React.CSSProperties;
  };
  /** Whether scrubbing is actively in progress */
  isScrubbing: boolean;
}

/**
 * Reusable scrub-to-adjust hook for numeric values.
 * Provides a Photoshop / After Effects / Figma style drag-to-adjust gesture.
 *
 * Features:
 * - Pointer capture (`setPointerCapture`) for smooth drags outside element bounds
 * - Automatic proportional sensitivity scaling across wide spans (e.g. 0-1000) and small spans (e.g. 0-1)
 * - Modifier key scaling: Shift for fast adjustment, Alt/Option for precision fine-tuning
 * - Snap to step and clamp to min/max
 * - Tolerance threshold so a stationary or micro-click falls through cleanly to native click/focus
 * - Visual `ew-resize` cursor affordance
 */
/**
 * Derives default sensitivity (value change per pixel of drag) based on step and bounds.
 */
export function deriveSensitivity({
  min,
  max,
  step,
  customSensitivity,
}: {
  min?: number;
  max?: number;
  step?: number;
  customSensitivity?: number;
}): number {
  if (customSensitivity !== undefined && customSensitivity > 0) {
    return customSensitivity;
  }

  const effectiveStep =
    step !== undefined && step > 0
      ? step
      : min !== undefined && max !== undefined && max - min <= 2
        ? 0.01
        : 1;

  if (min !== undefined && max !== undefined && max > min) {
    const span = max - min;
    if (span <= 1) {
      return 0.005;
    }
    if (span <= 10) {
      return Math.max(effectiveStep, span / 300);
    }
    return Math.max(effectiveStep * 0.5, span / 500);
  }

  return effectiveStep * 0.5;
}

/**
 * Snaps a raw number to the step increment and clamps between min and max.
 */
export function snapAndClampValue(
  rawVal: number,
  min?: number,
  max?: number,
  step?: number
): number {
  let clamped = rawVal;
  if (min !== undefined) clamped = Math.max(min, clamped);
  if (max !== undefined) clamped = Math.min(max, clamped);

  const effectiveStep =
    step !== undefined && step > 0
      ? step
      : min !== undefined && max !== undefined && max - min <= 2
        ? 0.01
        : 1;

  if (effectiveStep > 0) {
    const stepPrecision = effectiveStep.toString().split(".")[1]?.length ?? 0;
    const snapped = Math.round(clamped / effectiveStep) * effectiveStep;
    return parseFloat(snapped.toFixed(Math.min(stepPrecision + 1, 6)));
  }
  return clamped;
}

/**
 * Computes next scrubbed value from a deltaX and modifier keys.
 */
export function computeScrubValue({
  startValue,
  deltaX,
  shiftKey,
  altKey,
  min,
  max,
  step,
  customSensitivity,
  shiftMultiplier = 5,
  altMultiplier = 0.1,
}: {
  startValue: number;
  deltaX: number;
  shiftKey?: boolean;
  altKey?: boolean;
  min?: number;
  max?: number;
  step?: number;
  customSensitivity?: number;
  shiftMultiplier?: number;
  altMultiplier?: number;
}): number {
  const sensitivity = deriveSensitivity({ min, max, step, customSensitivity });
  let multiplier = 1;
  if (shiftKey) multiplier *= shiftMultiplier;
  if (altKey) multiplier *= altMultiplier;

  const deltaValue = deltaX * sensitivity * multiplier;
  return snapAndClampValue(startValue + deltaValue, min, max, step);
}

/**
 * Reusable scrub-to-adjust hook for numeric values.
 * Provides a Photoshop / After Effects / Figma style drag-to-adjust gesture.
 *
 * Features:
 * - Pointer capture (`setPointerCapture`) for smooth drags outside element bounds
 * - Automatic proportional sensitivity scaling across wide spans (e.g. 0-1000) and small spans (e.g. 0-1)
 * - Modifier key scaling: Shift for fast adjustment, Alt/Option for precision fine-tuning
 * - Snap to step and clamp to min/max
 * - Tolerance threshold so a stationary or micro-click falls through cleanly to native click/focus
 * - Visual `ew-resize` cursor affordance
 */
export function useScrubbableNumber({
  value,
  onChange,
  min,
  max,
  step,
  sensitivity: customSensitivity,
  shiftMultiplier = 5,
  altMultiplier = 0.1,
  dragThreshold = 3,
  onScrubStart,
  onScrubEnd,
  disabled = false,
}: UseScrubbableNumberOptions): UseScrubbableNumberReturn {
  const [isScrubbing, setIsScrubbing] = useState(false);

  const sensitivity = deriveSensitivity({ min, max, step, customSensitivity });

  const stateRef = useRef<{
    isPointerDown: boolean;
    hasCrossedThreshold: boolean;
    pointerId: number | null;
    targetElement: HTMLElement | null;
    startX: number;
    startY: number;
    startValue: number;
    currentValue: number;
  }>({
    isPointerDown: false,
    hasCrossedThreshold: false,
    pointerId: null,
    targetElement: null,
    startX: 0,
    startY: 0,
    startValue: value,
    currentValue: value,
  });

  // Keep latest value in ref for immediate access in callbacks
  stateRef.current.currentValue = value;

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (disabled || e.button !== 0) return; // Only primary mouse button

      const target = e.currentTarget as HTMLElement;
      stateRef.current = {
        isPointerDown: true,
        hasCrossedThreshold: false,
        pointerId: e.pointerId,
        targetElement: target,
        startX: e.clientX,
        startY: e.clientY,
        startValue: stateRef.current.currentValue,
        currentValue: stateRef.current.currentValue,
      };

      try {
        target.setPointerCapture(e.pointerId);
      } catch {
        // Fallback for environments where setPointerCapture may not be supported
      }
    },
    [disabled]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const state = stateRef.current;
      if (!state.isPointerDown) return;

      const deltaX = e.clientX - state.startX;
      const deltaY = e.clientY - state.startY;
      const distance = Math.hypot(deltaX, deltaY);

      if (!state.hasCrossedThreshold) {
        if (distance >= dragThreshold) {
          state.hasCrossedThreshold = true;
          setIsScrubbing(true);
          onScrubStart?.();
        } else {
          return;
        }
      }

      const nextValue = computeScrubValue({
        startValue: state.startValue,
        deltaX,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        min,
        max,
        step,
        customSensitivity: sensitivity,
        shiftMultiplier,
        altMultiplier,
      });

      if (nextValue !== state.currentValue) {
        state.currentValue = nextValue;
        onChange(nextValue);
      }
    },
    [
      dragThreshold,
      shiftMultiplier,
      altMultiplier,
      sensitivity,
      min,
      max,
      step,
      onChange,
      onScrubStart,
    ]
  );

  const handlePointerUpOrCancel = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const state = stateRef.current;
      if (!state.isPointerDown) return;

      if (state.targetElement && state.pointerId !== null) {
        try {
          if (state.targetElement.hasPointerCapture(state.pointerId)) {
            state.targetElement.releasePointerCapture(state.pointerId);
          }
        } catch {
          // Ignore release errors
        }
      }

      const wasScrubbing = state.hasCrossedThreshold;
      state.isPointerDown = false;
      state.hasCrossedThreshold = false;
      state.pointerId = null;
      state.targetElement = null;

      if (wasScrubbing) {
        setIsScrubbing(false);
        onScrubEnd?.();
      }
    },
    [onScrubEnd]
  );

  return {
    scrubProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: handlePointerUpOrCancel,
      onPointerCancel: handlePointerUpOrCancel,
      style: {
        cursor: disabled ? undefined : "ew-resize",
        userSelect: isScrubbing ? "none" : undefined,
        touchAction: "none",
      },
    },
    isScrubbing,
  };
}

export interface ScrubbableReadoutProps extends UseScrubbableNumberOptions {
  className?: string;
  title?: string;
  formatValue?: (val: number) => React.ReactNode;
  children?: React.ReactNode;
  "data-testid"?: string;
}

/**
 * Reusable scrubbable numeric readout component that wraps any slider value display.
 * Allows scrubbing the number directly with Shift (fast) and Alt (precision) support.
 */
export function ScrubbableReadout({
  value,
  onChange,
  min,
  max,
  step,
  sensitivity,
  shiftMultiplier,
  altMultiplier,
  dragThreshold,
  onScrubStart,
  onScrubEnd,
  disabled,
  className = "",
  title,
  formatValue,
  children,
  "data-testid": testId,
}: ScrubbableReadoutProps) {
  const { scrubProps } = useScrubbableNumber({
    value,
    onChange,
    min,
    max,
    step,
    sensitivity,
    shiftMultiplier,
    altMultiplier,
    dragThreshold,
    onScrubStart,
    onScrubEnd,
    disabled,
  });

  return (
    <span
      {...scrubProps}
      className={`hover:text-[#38bdf8] transition-colors select-none ${className}`}
      title={title || "Drag horizontal to scrub (Shift: fast, Alt: precision)"}
      data-testid={testId}
    >
      {children ?? (formatValue ? formatValue(value) : value)}
    </span>
  );
}

export interface ScrubbableLabelProps extends UseScrubbableNumberOptions {
  className?: string;
  title?: string;
  children: React.ReactNode;
  "data-testid"?: string;
}

/**
 * Reusable scrubbable label component to wrap input label titles or affixes.
 * Allows scrubbing by dragging on the label while keeping the input element directly clickable/editable.
 */
export function ScrubbableLabel({
  value,
  onChange,
  min,
  max,
  step,
  sensitivity,
  shiftMultiplier,
  altMultiplier,
  dragThreshold,
  onScrubStart,
  onScrubEnd,
  disabled,
  className = "",
  title,
  children,
  "data-testid": testId,
}: ScrubbableLabelProps) {
  const { scrubProps } = useScrubbableNumber({
    value,
    onChange,
    min,
    max,
    step,
    sensitivity,
    shiftMultiplier,
    altMultiplier,
    dragThreshold,
    onScrubStart,
    onScrubEnd,
    disabled,
  });

  return (
    <span
      {...scrubProps}
      className={`hover:text-[#38bdf8] transition-colors select-none ${className}`}
      title={title || "Drag horizontal to scrub (Shift: fast, Alt: precision)"}
      data-testid={testId}
    >
      {children}
    </span>
  );
}

