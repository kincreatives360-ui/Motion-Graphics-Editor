import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  applyBloom,
  applyFilmGrain,
  applyVignette,
  applyChromaticAberration,
  applyColorGrade,
  applyGlitch,
  applyGhost,
  applyEdgeFade,
  resetCachedPostProcessingCanvases,
} from "./post-processing";

beforeEach(() => {
  resetCachedPostProcessingCanvases();
});

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

describe("applyFilmGrain post-processing", () => {
  it("safely handles 0-dimension canvas or near-zero intensity without error", () => {
    const main = { width: 0, height: 0, getContext: vi.fn() } as unknown as HTMLCanvasElement;
    expect(() => applyFilmGrain(main, 0.08, 1.0)).not.toThrow();

    const normal = { width: 100, height: 100, getContext: vi.fn() } as unknown as HTMLCanvasElement;
    expect(() => applyFilmGrain(normal, 0.001, 1.0)).not.toThrow();
  });

  it("applies film grain with intensity and scaled size", () => {
    const patternObj = { setTransform: vi.fn() };
    const fakePatternCanvas = {
      width: 128,
      height: 128,
      getContext: vi.fn().mockReturnValue({
        createImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(128 * 128 * 4) }),
        putImageData: vi.fn(),
      }),
    };

    const origDoc = globalThis.document;
    const origMatrix = globalThis.DOMMatrix;

    class FakeDOMMatrix {
      scale(s: number) {
        return this;
      }
    }

    // @ts-expect-error Mocking DOM for node test
    globalThis.document = {
      createElement: vi.fn().mockReturnValue(fakePatternCanvas),
    };
    // @ts-expect-error Mocking DOMMatrix
    globalThis.DOMMatrix = FakeDOMMatrix;

    try {
      const mctx = {
        save: vi.fn(),
        globalCompositeOperation: "source-over",
        globalAlpha: 1,
        fillStyle: null,
        fillRect: vi.fn(),
        restore: vi.fn(),
        createPattern: vi.fn().mockReturnValue(patternObj),
      };
      const main = {
        width: 200,
        height: 150,
        getContext: vi.fn().mockReturnValue(mctx),
      } as unknown as HTMLCanvasElement;

      applyFilmGrain(main, 0.2, 2.0);

      expect(mctx.save).toHaveBeenCalled();
      expect(mctx.globalCompositeOperation).toBe("soft-light");
      expect(mctx.globalAlpha).toBeCloseTo(0.3); // 0.2 * 1.5
      expect(mctx.fillRect).toHaveBeenCalledWith(0, 0, 200, 150);
      expect(mctx.restore).toHaveBeenCalled();
    } finally {
      globalThis.document = origDoc;
      globalThis.DOMMatrix = origMatrix;
    }
  });
});

describe("applyVignette post-processing", () => {
  it("safely handles 0-dimension canvas or near-zero strength", () => {
    const main = { width: 0, height: 0, getContext: vi.fn() } as unknown as HTMLCanvasElement;
    expect(() => applyVignette(main, 0.5)).not.toThrow();

    const normal = { width: 100, height: 100, getContext: vi.fn() } as unknown as HTMLCanvasElement;
    expect(() => applyVignette(normal, 0.005)).not.toThrow();
  });

  it("renders radial vignette gradient over canvas", () => {
    const fakeGradient = { addColorStop: vi.fn() };
    const mctx = {
      save: vi.fn(),
      createRadialGradient: vi.fn().mockReturnValue(fakeGradient),
      fillStyle: null,
      fillRect: vi.fn(),
      restore: vi.fn(),
    };
    const main = {
      width: 400,
      height: 300,
      getContext: vi.fn().mockReturnValue(mctx),
    } as unknown as HTMLCanvasElement;

    applyVignette(main, 0.6);

    expect(mctx.save).toHaveBeenCalled();
    expect(mctx.createRadialGradient).toHaveBeenCalled();
    expect(fakeGradient.addColorStop).toHaveBeenCalledTimes(3);
    expect(mctx.fillRect).toHaveBeenCalledWith(0, 0, 400, 300);
    expect(mctx.restore).toHaveBeenCalled();
  });
});

describe("applyChromaticAberration post-processing", () => {
  it("safely handles 0-dimension canvas or sub-pixel offset", () => {
    const main = { width: 0, height: 0, getContext: vi.fn() } as unknown as HTMLCanvasElement;
    expect(() => applyChromaticAberration(main, 5)).not.toThrow();

    const normal = { width: 100, height: 100, getContext: vi.fn() } as unknown as HTMLCanvasElement;
    expect(() => applyChromaticAberration(normal, 0.1)).not.toThrow();
  });

  it("offsets and screens color channels onto canvas", () => {
    const mctx = {
      save: vi.fn(),
      globalCompositeOperation: "source-over",
      globalAlpha: 1,
      drawImage: vi.fn(),
      restore: vi.fn(),
    };
    const main = {
      width: 500,
      height: 400,
      getContext: vi.fn().mockReturnValue(mctx),
    } as unknown as HTMLCanvasElement;

    applyChromaticAberration(main, 6);

    expect(mctx.save).toHaveBeenCalled();
    expect(mctx.globalCompositeOperation).toBe("screen");
    expect(mctx.globalAlpha).toBe(0.15);
    expect(mctx.drawImage).toHaveBeenCalledWith(main, -6, 0);
    expect(mctx.drawImage).toHaveBeenCalledWith(main, 6, 0);
    expect(mctx.restore).toHaveBeenCalled();
  });
});

describe("applyColorGrade post-processing", () => {
  it("safely handles 0-dimension canvas or default values", () => {
    const main = { width: 0, height: 0, getContext: vi.fn() } as unknown as HTMLCanvasElement;
    expect(() => applyColorGrade(main, 0, 1, 1)).not.toThrow();

    const normal = { width: 100, height: 100, getContext: vi.fn() } as unknown as HTMLCanvasElement;
    expect(() => applyColorGrade(normal, 0, 1, 1)).not.toThrow();
  });

  it("applies exposure, contrast, and saturation filters", () => {
    const tempCtx = {
      filter: "none",
      globalCompositeOperation: "source-over",
      globalAlpha: 1,
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    };
    const tempCanvas = {
      width: 200,
      height: 150,
      getContext: vi.fn().mockReturnValue(tempCtx),
    };

    const origDoc = globalThis.document;
    // @ts-expect-error Mock document
    globalThis.document = {
      createElement: vi.fn().mockReturnValue(tempCanvas),
    };

    try {
      let filterAtDraw = "";
      const mctx = {
        save: vi.fn(),
        setTransform: vi.fn(),
        filter: "none",
        clearRect: vi.fn(),
        drawImage: vi.fn().mockImplementation(() => {
          filterAtDraw = mctx.filter;
        }),
        restore: vi.fn(),
      };
      const main = {
        width: 200,
        height: 150,
        getContext: vi.fn().mockReturnValue(mctx),
      } as unknown as HTMLCanvasElement;

      applyColorGrade(main, 1.0, 1.2, 1.5);

      expect(tempCtx.drawImage).toHaveBeenCalledWith(main, 0, 0);
      expect(mctx.save).toHaveBeenCalled();
      expect(filterAtDraw).toContain("brightness(");
      expect(filterAtDraw).toContain("contrast(1.200)");
      expect(filterAtDraw).toContain("saturate(1.500)");
      expect(mctx.drawImage).toHaveBeenCalledWith(tempCanvas, 0, 0);
      expect(mctx.restore).toHaveBeenCalled();
    } finally {
      globalThis.document = origDoc;
    }
  });
});

describe("applyGlitch post-processing", () => {
  it("safely handles 0-dimension canvas or near-zero intensity", () => {
    const main = { width: 0, height: 0, getContext: vi.fn() } as unknown as HTMLCanvasElement;
    expect(() => applyGlitch(main, 0.5, 1)).not.toThrow();

    const normal = { width: 100, height: 100, getContext: vi.fn() } as unknown as HTMLCanvasElement;
    expect(() => applyGlitch(normal, 0.005, 1)).not.toThrow();
  });

  it("applies horizontal slice displacements", () => {
    const tempCtx = {
      filter: "none",
      globalCompositeOperation: "source-over",
      globalAlpha: 1,
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    };
    const tempCanvas = {
      width: 300,
      height: 200,
      getContext: vi.fn().mockReturnValue(tempCtx),
    };

    const origDoc = globalThis.document;
    // @ts-expect-error Mock document
    globalThis.document = {
      createElement: vi.fn().mockReturnValue(tempCanvas),
    };

    try {
      const mctx = {
        save: vi.fn(),
        setTransform: vi.fn(),
        beginPath: vi.fn(),
        rect: vi.fn(),
        clip: vi.fn(),
        drawImage: vi.fn(),
        restore: vi.fn(),
      };
      const main = {
        width: 300,
        height: 200,
        getContext: vi.fn().mockReturnValue(mctx),
      } as unknown as HTMLCanvasElement;

      applyGlitch(main, 0.6, 1.2);

      expect(mctx.save).toHaveBeenCalled();
      expect(mctx.drawImage).toHaveBeenCalled();
      expect(mctx.restore).toHaveBeenCalled();
    } finally {
      globalThis.document = origDoc;
    }
  });
});

describe("applyGhost post-processing", () => {
  it("safely handles 0-dimension canvas or near-zero opacity", () => {
    const main = { width: 0, height: 0, getContext: vi.fn() } as unknown as HTMLCanvasElement;
    expect(() => applyGhost(main, 0.4, 8, 2)).not.toThrow();

    const normal = { width: 100, height: 100, getContext: vi.fn() } as unknown as HTMLCanvasElement;
    expect(() => applyGhost(normal, 0.005, 8, 2)).not.toThrow();
  });

  it("draws offset blurred duplicate with opacity", () => {
    const tempCtx = {
      filter: "none",
      globalCompositeOperation: "source-over",
      globalAlpha: 1,
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    };
    const tempCanvas = {
      width: 250,
      height: 150,
      getContext: vi.fn().mockReturnValue(tempCtx),
    };

    const origDoc = globalThis.document;
    // @ts-expect-error Mock document
    globalThis.document = {
      createElement: vi.fn().mockReturnValue(tempCanvas),
    };

    try {
      let filterAtDraw = "";
      const mctx = {
        save: vi.fn(),
        setTransform: vi.fn(),
        globalAlpha: 1,
        globalCompositeOperation: "source-over",
        filter: "none",
        drawImage: vi.fn().mockImplementation(() => {
          filterAtDraw = mctx.filter;
        }),
        restore: vi.fn(),
      };
      const main = {
        width: 250,
        height: 150,
        getContext: vi.fn().mockReturnValue(mctx),
      } as unknown as HTMLCanvasElement;

      applyGhost(main, 0.5, 12, 4);

      expect(mctx.save).toHaveBeenCalled();
      expect(mctx.globalAlpha).toBe(0.5);
      expect(mctx.globalCompositeOperation).toBe("screen");
      expect(filterAtDraw).toBe("blur(4.0px)");
      expect(mctx.drawImage).toHaveBeenCalledWith(tempCanvas, -12, -6);
      expect(mctx.restore).toHaveBeenCalled();
    } finally {
      globalThis.document = origDoc;
    }
  });
});

describe("applyEdgeFade post-processing", () => {
  it("safely handles 0-dimension canvas or all-zero fades", () => {
    const main = { width: 0, height: 0, getContext: vi.fn() } as unknown as HTMLCanvasElement;
    expect(() => applyEdgeFade(main, 0.1, 0.1, 0.1, 0.1)).not.toThrow();

    const normal = { width: 100, height: 100, getContext: vi.fn() } as unknown as HTMLCanvasElement;
    expect(() => applyEdgeFade(normal, 0, 0, 0, 0)).not.toThrow();
  });

  it("renders edge gradients for active sides", () => {
    const fakeGrad = { addColorStop: vi.fn() };
    const mctx = {
      save: vi.fn(),
      setTransform: vi.fn(),
      createLinearGradient: vi.fn().mockReturnValue(fakeGrad),
      fillStyle: null,
      fillRect: vi.fn(),
      restore: vi.fn(),
    };
    const main = {
      width: 400,
      height: 300,
      getContext: vi.fn().mockReturnValue(mctx),
    } as unknown as HTMLCanvasElement;

    applyEdgeFade(main, 0.2, 0.15, 0.25, 0.1);

    expect(mctx.save).toHaveBeenCalled();
    expect(mctx.createLinearGradient).toHaveBeenCalledTimes(4);
    expect(mctx.fillRect).toHaveBeenCalledTimes(4);
    expect(mctx.restore).toHaveBeenCalled();
  });
});
