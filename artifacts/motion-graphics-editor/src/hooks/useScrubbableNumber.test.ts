import { describe, it, expect } from "vitest";
import {
  deriveSensitivity,
  snapAndClampValue,
  computeScrubValue,
} from "./useScrubbableNumber";

describe("useScrubbableNumber logic", () => {
  describe("deriveSensitivity", () => {
    it("respects customSensitivity when provided", () => {
      const s = deriveSensitivity({ customSensitivity: 2.5 });
      expect(s).toBe(2.5);
    });

    it("scales sensitivity appropriately for 0-1 ranges (e.g. Opacity)", () => {
      const s = deriveSensitivity({ min: 0, max: 1 });
      expect(s).toBe(0.005);
    });

    it("scales sensitivity appropriately for mid-range (0-10)", () => {
      const s = deriveSensitivity({ min: 0, max: 10, step: 0.1 });
      expect(s).toBeGreaterThanOrEqual(0.03);
    });

    it("scales sensitivity appropriately for wide ranges (0-1000px)", () => {
      const s = deriveSensitivity({ min: 0, max: 1000, step: 1 });
      expect(s).toBe(2);
    });

    it("provides balanced default for unbounded values", () => {
      const s = deriveSensitivity({ step: 1 });
      expect(s).toBe(0.5);
    });
  });

  describe("snapAndClampValue", () => {
    it("clamps to min", () => {
      expect(snapAndClampValue(-10, 0, 100, 1)).toBe(0);
    });

    it("clamps to max", () => {
      expect(snapAndClampValue(150, 0, 100, 1)).toBe(100);
    });

    it("snaps to integer step", () => {
      expect(snapAndClampValue(23.7, 0, 100, 5)).toBe(25);
      expect(snapAndClampValue(22.1, 0, 100, 5)).toBe(20);
    });

    it("snaps to decimal step cleanly without floating point inaccuracies", () => {
      expect(snapAndClampValue(0.254, 0, 1, 0.05)).toBe(0.25);
      expect(snapAndClampValue(0.28, 0, 1, 0.05)).toBe(0.3);
    });
  });

  describe("computeScrubValue", () => {
    it("computes standard delta without modifiers", () => {
      const val = computeScrubValue({
        startValue: 100,
        deltaX: 10,
        min: 0,
        max: 500,
        step: 1,
        customSensitivity: 1,
      });
      expect(val).toBe(110);
    });

    it("multiplies sensitivity with Shift key for fast scrub", () => {
      const val = computeScrubValue({
        startValue: 100,
        deltaX: 10,
        shiftKey: true,
        min: 0,
        max: 500,
        step: 1,
        customSensitivity: 1,
      });
      expect(val).toBe(150);
    });

    it("divides sensitivity with Alt key for precision scrub", () => {
      const val = computeScrubValue({
        startValue: 100,
        deltaX: 10,
        altKey: true,
        min: 0,
        max: 500,
        step: 0.1,
        customSensitivity: 1,
      });
      expect(val).toBe(101);
    });

    it("properly handles negative deltas (scrub left)", () => {
      const val = computeScrubValue({
        startValue: 50,
        deltaX: -20,
        min: 0,
        max: 100,
        step: 1,
        customSensitivity: 0.5,
      });
      expect(val).toBe(40);
    });
  });
});
