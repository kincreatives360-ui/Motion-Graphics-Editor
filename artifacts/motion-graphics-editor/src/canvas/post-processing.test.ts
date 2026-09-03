import { describe, it, expect, vi, beforeEach } from "vitest";
import { applyBloom } from "./post-processing";

describe("applyBloom post-processing", () => {
  it("safely handles 0-dimension canvas without error", () => {
    const main = { width: 0, height: 0, getContext: vi.fn() } as unknown as HTMLCanvasElement;
    const off = { width: 0, height: 0, getContext: vi.fn() } as unknown as HTMLCanvasElement;
    expect(() => applyBloom(main, off)).not.toThrow();
  });

  it("skips blur pass when no pixels meet the luminance threshold", () => {
    const fakeData = new Uint8ClampedArray(4 * 10 * 10); // all zeros (dark)
    const octx = {
      filter: "none",
      globalCompositeOperation: "source-over",
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      getImageData: vi.fn().mockReturnValue({ data: fakeData }),
      putImageData: vi.fn(),
    };
    const main = { width: 10, height: 10, getContext: vi.fn() } as unknown as HTMLCanvasElement;
    const off = {
      width: 10,
      height: 10,
      getContext: vi.fn().mockReturnValue(octx),
    } as unknown as HTMLCanvasElement;

    expect(() => applyBloom(main, off, 200, 16, 1.0)).not.toThrow();
    // Blur and putImageData should NOT be called since no bright pixels
    expect(octx.putImageData).not.toHaveBeenCalled();
  });

  it("processes bright pixels and composites onto main canvas", () => {
    const fakeData = new Uint8ClampedArray(4 * 10 * 10);
    // Add bright pixel at index 0
    fakeData[0] = 255;
    fakeData[1] = 255;
    fakeData[2] = 255;
    fakeData[3] = 255;

    const blurDestCtx = {
      filter: "none",
      globalCompositeOperation: "source-over",
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    };
    const blurDestCanvas = {
      width: 10,
      height: 10,
      getContext: vi.fn().mockReturnValue(blurDestCtx),
    };

    // Mock document.createElement for blur canvas in Node test
    const origDoc = globalThis.document;
    // @ts-expect-error Mocking document for node test
    globalThis.document = {
      createElement: vi.fn().mockReturnValue(blurDestCanvas),
    };

    try {
      const octx = {
        filter: "none",
        globalCompositeOperation: "source-over",
        clearRect: vi.fn(),
        drawImage: vi.fn(),
        getImageData: vi.fn().mockReturnValue({ data: fakeData }),
        putImageData: vi.fn(),
      };
      const mctx = {
        save: vi.fn(),
        setTransform: vi.fn(),
        globalAlpha: 1,
        globalCompositeOperation: "source-over",
        drawImage: vi.fn(),
        restore: vi.fn(),
      };
      const main = {
        width: 10,
        height: 10,
        getContext: vi.fn().mockReturnValue(mctx),
      } as unknown as HTMLCanvasElement;
      const off = {
        width: 10,
        height: 10,
        getContext: vi.fn().mockReturnValue(octx),
      } as unknown as HTMLCanvasElement;

      expect(() => applyBloom(main, off, 200, 16, 1.0)).not.toThrow();

      // putImageData called with bright pixels
      expect(octx.putImageData).toHaveBeenCalled();
      // blur canvas drew the off canvas as source (non-overlapping!)
      expect(blurDestCtx.drawImage).toHaveBeenCalledWith(off, 0, 0);
      expect(blurDestCtx.filter).toBe("none"); // reset after blur
      // main canvas drew the blur canvas, NOT the off canvas directly
      expect(mctx.drawImage).toHaveBeenCalledWith(blurDestCanvas, 0, 0);
      expect(mctx.globalCompositeOperation).toBe("lighter");
    } finally {
      globalThis.document = origDoc;
    }
  });
});
