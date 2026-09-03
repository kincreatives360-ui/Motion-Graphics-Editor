import { useEditorStore, type Layer, type ProjectAsset } from "../store/editor-store";

/**
 * Check if a clipboard string contains valid SVG markup
 */
export function isSvgContent(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const trimmed = text.trim();
  return (
    (trimmed.startsWith("<svg") || trimmed.includes("<svg")) &&
    trimmed.includes("</svg>")
  );
}

interface ParsedElementData {
  layer: Layer;
  textContent?: string;
}

/**
 * Parse SVG markup (such as copied from Figma via "Copy as SVG") into editor layers
 */
export function parseSvgToLayers(
  svgString: string,
): { groupId: string; groupName: string; layers: Layer[] } | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, "image/svg+xml");
    const svgEl = doc.querySelector("svg");
    if (!svgEl) return null;

    // Attach temporary container in DOM to measure bounding boxes accurately with browser engine
    let measureContainer: HTMLDivElement | null = null;
    let measureSvg: SVGSVGElement | null = null;
    try {
      measureContainer = document.createElement("div");
      measureContainer.style.cssText =
        "position:absolute;left:-99999px;top:-99999px;visibility:hidden;pointer-events:none;width:0;height:0;overflow:hidden;";
      document.body.appendChild(measureContainer);
      measureSvg = svgEl.cloneNode(true) as SVGSVGElement;
      measureContainer.appendChild(measureSvg);
    } catch {
      // DOM measurement fallback
    }

    const elementsToProcess: Element[] = [];

    // Collect renderable graphical elements
    function walk(node: Element) {
      const tag = node.tagName.toLowerCase();
      if (
        tag === "rect" ||
        tag === "circle" ||
        tag === "ellipse" ||
        tag === "path" ||
        tag === "polygon" ||
        tag === "polyline" ||
        tag === "text" ||
        tag === "image"
      ) {
        elementsToProcess.push(node);
      } else if (tag === "g" || tag === "svg") {
        for (let i = 0; i < node.children.length; i++) {
          walk(node.children[i]);
        }
      }
    }

    // If svg has a top-level group or direct children
    for (let i = 0; i < svgEl.children.length; i++) {
      walk(svgEl.children[i]);
    }

    if (elementsToProcess.length === 0) {
      if (measureContainer && measureContainer.parentNode) {
        measureContainer.parentNode.removeChild(measureContainer);
      }
      return null;
    }

    const parsedElements: ParsedElementData[] = [];
    const measureNodes = measureSvg ? Array.from(measureSvg.querySelectorAll("*")) : [];

    for (let idx = 0; idx < elementsToProcess.length; idx++) {
      const el = elementsToProcess[idx];
      const tag = el.tagName.toLowerCase();
      const measureEl = measureNodes[idx] as SVGGraphicsElement | undefined;

      // Extract geometry and bounding box
      let bbox = { x: 0, y: 0, width: 100, height: 100 };
      let rotation = 0;

      if (measureEl && typeof measureEl.getBBox === "function") {
        try {
          const b = measureEl.getBBox();
          if (b && (b.width > 0 || b.height > 0)) {
            bbox = { x: b.x, y: b.y, width: Math.max(1, b.width), height: Math.max(1, b.height) };
          }
          // Check for transform matrix or attribute
          if (typeof measureEl.getCTM === "function" && measureSvg) {
            const ctm = measureEl.getCTM();
            const rootCtm = measureSvg.getCTM();
            if (ctm) {
              const rel = rootCtm ? rootCtm.inverse().multiply(ctm) : ctm;
              bbox.x = rel.a * bbox.x + rel.c * bbox.y + rel.e;
              bbox.y = rel.b * bbox.x + rel.d * bbox.y + rel.f;
              const scaleX = Math.sqrt(rel.a * rel.a + rel.b * rel.b);
              const scaleY = Math.sqrt(rel.c * rel.c + rel.d * rel.d);
              bbox.width *= scaleX;
              bbox.height *= scaleY;
              rotation = Math.round(Math.atan2(rel.b, rel.a) * (180 / Math.PI));
            }
          }
        } catch {
          // BBox fallback
        }
      }

      // Attribute-based fallbacks
      const parseAttr = (name: string, def = 0) => {
        const val = el.getAttribute(name);
        if (!val) return def;
        const num = parseFloat(val);
        return isNaN(num) ? def : num;
      };

      // Extract color & styling
      let fill = el.getAttribute("fill") || el.getAttribute("style")?.match(/fill:\s*([^;]+)/)?.[1] || "";
      if (fill === "none") {
        fill = "transparent";
      } else if (!fill) {
        fill = el.getAttribute("stroke") ? "transparent" : "#38bdf8";
      }

      let stroke = el.getAttribute("stroke") || el.getAttribute("style")?.match(/stroke:\s*([^;]+)/)?.[1] || undefined;
      if (stroke === "none") stroke = undefined;
      const strokeWidth = parseAttr("stroke-width", 1);
      const opacity = parseAttr("opacity", 1);

      // Parse inline transform attribute if present
      const transformAttr = el.getAttribute("transform") || "";
      if (transformAttr) {
        const translateMatch = transformAttr.match(/translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)/);
        if (translateMatch) {
          bbox.x += parseFloat(translateMatch[1]);
          bbox.y += parseFloat(translateMatch[2]);
        }
        const rotateMatch = transformAttr.match(/rotate\(\s*([-\d.]+)/);
        if (rotateMatch) {
          rotation = parseFloat(rotateMatch[1]);
        }
      }

      const layerId = `layer-svg-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`;
      let layer: Layer | null = null;
      let textContent: string | undefined;

      if (tag === "rect") {
        const x = el.hasAttribute("x") ? parseAttr("x", bbox.x) : bbox.x;
        const y = el.hasAttribute("y") ? parseAttr("y", bbox.y) : bbox.y;
        const width = el.hasAttribute("width") ? parseAttr("width", bbox.width) : bbox.width;
        const height = el.hasAttribute("height") ? parseAttr("height", bbox.height) : bbox.height;
        const rx = parseAttr("rx", parseAttr("ry", 0));

        layer = {
          id: layerId,
          parentId: null,
          type: "shape",
          name: el.getAttribute("id") || `Rectangle ${idx + 1}`,
          transform: {
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(width),
            height: Math.round(height),
            rotation,
            depth: 0,
          },
          opacity,
          visible: true,
          locked: false,
          shape: {
            kind: "rect",
            fill,
            stroke,
            strokeWidth,
            radius: rx,
          },
        };
      } else if (tag === "circle") {
        const cx = parseAttr("cx", bbox.x + bbox.width / 2);
        const cy = parseAttr("cy", bbox.y + bbox.height / 2);
        const r = parseAttr("r", bbox.width / 2);

        layer = {
          id: layerId,
          parentId: null,
          type: "shape",
          name: el.getAttribute("id") || `Circle ${idx + 1}`,
          transform: {
            x: Math.round(cx - r),
            y: Math.round(cy - r),
            width: Math.round(r * 2),
            height: Math.round(r * 2),
            rotation,
            depth: 0,
          },
          opacity,
          visible: true,
          locked: false,
          shape: {
            kind: "ellipse",
            fill,
            stroke,
            strokeWidth,
          },
        };
      } else if (tag === "ellipse") {
        const cx = parseAttr("cx", bbox.x + bbox.width / 2);
        const cy = parseAttr("cy", bbox.y + bbox.height / 2);
        const rx = parseAttr("rx", bbox.width / 2);
        const ry = parseAttr("ry", bbox.height / 2);

        layer = {
          id: layerId,
          parentId: null,
          type: "shape",
          name: el.getAttribute("id") || `Ellipse ${idx + 1}`,
          transform: {
            x: Math.round(cx - rx),
            y: Math.round(cy - ry),
            width: Math.round(rx * 2),
            height: Math.round(ry * 2),
            rotation,
            depth: 0,
          },
          opacity,
          visible: true,
          locked: false,
          shape: {
            kind: "ellipse",
            fill,
            stroke,
            strokeWidth,
          },
        };
      } else if (tag === "path" || tag === "polygon" || tag === "polyline") {
        let pathData = el.getAttribute("d") || "";
        if (!pathData && (tag === "polygon" || tag === "polyline")) {
          const points = el.getAttribute("points")?.trim();
          if (points) {
            const coords = points.split(/[\s,]+/).filter(Boolean);
            if (coords.length >= 4) {
              pathData = `M ${coords[0]} ${coords[1]}`;
              for (let c = 2; c < coords.length; c += 2) {
                pathData += ` L ${coords[c]} ${coords[c + 1]}`;
              }
              if (tag === "polygon") pathData += " Z";
            }
          }
        }

        layer = {
          id: layerId,
          parentId: null,
          type: "shape",
          name: el.getAttribute("id") || `Path ${idx + 1}`,
          transform: {
            x: Math.round(bbox.x),
            y: Math.round(bbox.y),
            width: Math.round(Math.max(4, bbox.width)),
            height: Math.round(Math.max(4, bbox.height)),
            rotation,
            depth: 0,
          },
          opacity,
          visible: true,
          locked: false,
          shape: {
            kind: "path",
            fill,
            stroke,
            strokeWidth,
            path: pathData,
            pathOriginX: bbox.x,
            pathOriginY: bbox.y,
          },
        };
      } else if (tag === "text") {
        const content = el.textContent?.trim() || "Text";
        textContent = content;
        const fontSize = parseAttr("font-size", 16);
        const fontFamily = el.getAttribute("font-family") || "Inter, system-ui, sans-serif";
        const textAnchor = el.getAttribute("text-anchor") || "start";
        const align: "left" | "center" | "right" =
          textAnchor === "middle" ? "center" : textAnchor === "end" ? "right" : "left";

        layer = {
          id: layerId,
          parentId: null,
          type: "text",
          name: content.length > 20 ? content.slice(0, 20) + "…" : content,
          transform: {
            x: Math.round(bbox.x),
            y: Math.round(bbox.y),
            width: Math.round(Math.max(20, bbox.width)),
            height: Math.round(Math.max(16, bbox.height)),
            rotation,
            depth: 0,
          },
          opacity,
          visible: true,
          locked: false,
          text: {
            content,
            fontSize,
            fontFamily,
            color: fill && fill !== "transparent" ? fill : "#ffffff",
            align,
          },
        };
      } else if (tag === "image") {
        const href = el.getAttribute("href") || el.getAttribute("xlink:href") || "";
        layer = {
          id: layerId,
          parentId: null,
          type: "image",
          name: el.getAttribute("id") || `Image ${idx + 1}`,
          transform: {
            x: Math.round(bbox.x),
            y: Math.round(bbox.y),
            width: Math.round(Math.max(10, bbox.width)),
            height: Math.round(Math.max(10, bbox.height)),
            rotation,
            depth: 0,
          },
          opacity,
          visible: true,
          locked: false,
          image: {
            src: href,
            naturalWidth: bbox.width,
            naturalHeight: bbox.height,
          },
        };
      }

      if (layer) {
        parsedElements.push({ layer, textContent });
      }
    }

    // Clean up measurement container
    if (measureContainer && measureContainer.parentNode) {
      measureContainer.parentNode.removeChild(measureContainer);
    }

    if (parsedElements.length === 0) return null;

    // Determine group name: first text content or "Pasted SVG"
    const firstText = parsedElements.find((item) => item.textContent)?.textContent;
    const groupName = firstText
      ? firstText.length > 25
        ? firstText.slice(0, 25) + "…"
        : firstText
      : "Pasted SVG";

    // Compute enclosing group bounds
    const childLayers = parsedElements.map((p) => p.layer);
    const minX = Math.min(...childLayers.map((l) => l.transform.x));
    const minY = Math.min(...childLayers.map((l) => l.transform.y));
    const maxX = Math.max(...childLayers.map((l) => l.transform.x + l.transform.width));
    const maxY = Math.max(...childLayers.map((l) => l.transform.y + l.transform.height));

    const groupId = `layer-group-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const groupLayer: Layer = {
      id: groupId,
      parentId: null,
      type: "group",
      name: groupName,
      transform: {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
        rotation: 0,
        depth: 0,
      },
      opacity: 1,
      visible: true,
      locked: false,
    };

    // Assign parentId to all child layers
    const groupedChildren = childLayers.map((l) => ({
      ...l,
      parentId: groupId,
    }));

    return {
      groupId,
      groupName,
      layers: [groupLayer, ...groupedChildren],
    };
  } catch (err) {
    console.error("Failed to parse SVG markup:", err);
    return null;
  }
}

/**
 * Import an image file (PNG, JPG, SVG, WebP, etc.) as an image layer on the active scene
 * Sized to natural dimensions scaled to fit the canvas, centered.
 */
export function importImageFile(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) {
        resolve(null);
        return;
      }

      const img = new Image();
      img.onload = () => {
        const store = useEditorStore.getState();
        const activeScene = store.scenes.find((s) => s.id === store.activeSceneId);
        if (!activeScene) {
          resolve(null);
          return;
        }

        const naturalWidth = img.naturalWidth || 800;
        const naturalHeight = img.naturalHeight || 600;

        // Register in project assets library
        const assetName = file.name
          ? file.name.replace(/\.[^/.]+$/, "")
          : "Imported Image";

        store.addAsset({
          name: assetName,
          dataUrl,
          width: naturalWidth,
          height: naturalHeight,
        });

        // Determine canvas dimensions
        const aspectRatio = store.aspectRatio || "16:9";
        const nativeWidth =
          aspectRatio === "9:16" ? 1080 : aspectRatio === "1:1" ? 1080 : 1920;
        const nativeHeight =
          aspectRatio === "9:16" ? 1920 : aspectRatio === "1:1" ? 1080 : 1080;

        // Size to natural dimensions scaled to fit the canvas
        const maxW = nativeWidth * 0.75;
        const maxH = nativeHeight * 0.75;
        const scale = Math.min(1, maxW / naturalWidth, maxH / naturalHeight);
        const width = Math.round(naturalWidth * scale);
        const height = Math.round(naturalHeight * scale);

        // Centered on canvas
        const x = Math.round((nativeWidth - width) / 2);
        const y = Math.round((nativeHeight - height) / 2);

        const newLayerId = store.addLayer(activeScene.id, {
          type: "image",
          name: assetName,
          transform: {
            x,
            y,
            width,
            height,
            rotation: 0,
            depth: 0,
          },
          opacity: 1,
          visible: true,
          locked: false,
          image: {
            src: dataUrl,
            naturalWidth,
            naturalHeight,
          },
        });

        store.selectLayers([newLayerId]);
        resolve(newLayerId);
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/**
 * Add an existing asset from the Assets tab to the canvas as an image layer
 */
export function addAssetToCanvas(asset: ProjectAsset): string | null {
  const store = useEditorStore.getState();
  const activeScene = store.scenes.find((s) => s.id === store.activeSceneId);
  if (!activeScene) return null;

  const aspectRatio = store.aspectRatio || "16:9";
  const nativeWidth =
    aspectRatio === "9:16" ? 1080 : aspectRatio === "1:1" ? 1080 : 1920;
  const nativeHeight =
    aspectRatio === "9:16" ? 1920 : aspectRatio === "1:1" ? 1080 : 1080;

  const naturalWidth = asset.width || 800;
  const naturalHeight = asset.height || 600;
  const maxW = nativeWidth * 0.75;
  const maxH = nativeHeight * 0.75;
  const scale = Math.min(1, maxW / naturalWidth, maxH / naturalHeight);
  const width = Math.round(naturalWidth * scale);
  const height = Math.round(naturalHeight * scale);

  const x = Math.round((nativeWidth - width) / 2);
  const y = Math.round((nativeHeight - height) / 2);

  const newLayerId = store.addLayer(activeScene.id, {
    type: "image",
    name: asset.name,
    transform: {
      x,
      y,
      width,
      height,
      rotation: 0,
      depth: 0,
    },
    opacity: 1,
    visible: true,
    locked: false,
    image: {
      src: asset.dataUrl,
      naturalWidth,
      naturalHeight,
    },
  });

  store.selectLayers([newLayerId]);
  return newLayerId;
}
