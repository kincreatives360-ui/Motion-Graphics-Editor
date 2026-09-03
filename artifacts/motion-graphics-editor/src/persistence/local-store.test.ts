import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import {
  saveDocument,
  loadDocument,
  getLastOpenedProjectName,
  setLastOpenedProjectName,
  clearLastOpenedProjectName,
  computeContentHash,
  _resetDBForTesting,
  getDB,
  LAST_OPENED_PROJECT_KEY,
} from "./local-store";
import type { EditorDocument, Scene, Layer } from "../store/editor-store";

function createMockDocument(
  projectName: string,
  imageSrc?: string,
): EditorDocument {
  const layers: Layer[] = [];
  if (imageSrc) {
    layers.push({
      id: "layer-img-1",
      name: "Image Layer",
      type: "image",
      transform: { x: 0, y: 0, width: 200, height: 200, rotation: 0, depth: 0 },
      opacity: 1,
      visible: true,
      locked: false,
      image: {
        src: imageSrc,
        naturalWidth: 800,
        naturalHeight: 600,
      },
    });
  }

  const scene: Scene = {
    id: "scene-1",
    name: "Main Scene",
    durationFrames: 120,
    fps: 30,
    layers,
    animationBlocks: [],
    camera: { x: 0, y: 0, z: 0, fov: 60, focusDistance: 1000 },
  };

  return {
    projectName,
    aspectRatio: "16:9",
    scenes: [scene],
    activeSceneId: "scene-1",
    selectedLayerIds: [],
    assets: [],
  };
}

describe("local-store persistence", () => {
  beforeEach(async () => {
    _resetDBForTesting();
    clearLastOpenedProjectName();
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("motion-graphics-editor-db");
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });

  it("extracts inline image data URLs into content-addressed assets store", async () => {
    const fakeDataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const doc = createMockDocument("Test Project With Image", fakeDataUrl);

    await saveDocument(doc);

    const expectedHash = await computeContentHash(fakeDataUrl);
    const db = await getDB();

    // 1. Check live document in IndexedDB: layer.image.src should be asset reference, not raw base64
    const rawStoredDoc = await db.get("documents", "Test Project With Image");
    expect(rawStoredDoc).toBeDefined();
    const storedLayer = rawStoredDoc!.scenes[0].layers[0];
    expect(storedLayer.image?.src).toBe(`asset:${expectedHash}`);
    expect(storedLayer.image?.assetId).toBe(expectedHash);
    expect(storedLayer.image?.src).not.toContain("data:image/png");

    // 2. Check history store: snapshot should also reference asset by ID
    const historyEntries = await db.getAll("history");
    expect(historyEntries.length).toBe(1);
    const historyLayer = historyEntries[0].document.scenes[0].layers[0];
    expect(historyLayer.image?.src).toBe(`asset:${expectedHash}`);
    expect(historyLayer.image?.assetId).toBe(expectedHash);

    // 3. Check assets store: content-addressed dataUrl must be stored under the hash
    const rawAsset = await db.get("assets", expectedHash);
    expect(rawAsset).toBe(fakeDataUrl);

    // 4. Check loadDocument(): resolves asset ID back to raw dataUrl seamlessly
    const loadedDoc = await loadDocument("Test Project With Image");
    expect(loadedDoc).toBeDefined();
    const loadedLayer = loadedDoc!.scenes[0].layers[0];
    expect(loadedLayer.image?.src).toBe(fakeDataUrl);
    expect(loadedLayer.image?.naturalWidth).toBe(800);
  });

  it("deduplicates asset across multiple history saves without duplicating in assets store", async () => {
    const fakeDataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M9QzwAEjDAGAC8cA32L/bWIAAAAAElFTkSuQmCC";
    const doc = createMockDocument("Multi Save Project", fakeDataUrl);

    // Save multiple times to trigger multiple history snapshots
    for (let i = 0; i < 5; i++) {
      await saveDocument({
        ...doc,
        scenes: [
          {
            ...doc.scenes[0],
            durationFrames: 100 + i,
          },
        ],
      });
    }

    const db = await getDB();
    const allAssets = await db.getAll("assets");
    // Even with 5 saves, exactly 1 asset entry exists in the content-addressed store
    expect(allAssets.length).toBe(1);
    expect(allAssets[0]).toBe(fakeDataUrl);

    const historyEntries = await db.getAll("history");
    expect(historyEntries.length).toBe(5);
    for (const entry of historyEntries) {
      expect(entry.document.scenes[0].layers[0].image?.src.startsWith("asset:")).toBe(true);
    }
  });

  it("tracks and prefers lastOpenedProjectName on cold boot with multiple projects", async () => {
    const docA = createMockDocument("Project Alpha");
    const docB = createMockDocument("Project Beta");

    // Save Alpha then Beta
    await saveDocument(docA);
    expect(getLastOpenedProjectName()).toBe("Project Alpha");

    await saveDocument(docB);
    expect(getLastOpenedProjectName()).toBe("Project Beta");

    // Calling loadDocument() with NO argument should load Project Beta (the last opened/saved)
    const loadedLatest = await loadDocument();
    expect(loadedLatest).toBeDefined();
    expect(loadedLatest?.projectName).toBe("Project Beta");

    // Explicitly loading Project Alpha should update lastOpenedProjectName
    const loadedAlpha = await loadDocument("Project Alpha");
    expect(loadedAlpha?.projectName).toBe("Project Alpha");
    expect(getLastOpenedProjectName()).toBe("Project Alpha");

    // Calling loadDocument() with NO argument should now prefer Project Alpha
    const loadedAfterAlpha = await loadDocument();
    expect(loadedAfterAlpha?.projectName).toBe("Project Alpha");
  });

  it("falls back to getAllKeys()[0] if no lastOpenedProjectName is set", async () => {
    const docX = createMockDocument("Project X");
    const docY = createMockDocument("Project Y");

    await saveDocument(docX);
    await saveDocument(docY);

    // Simulate cleared lastOpened tracker
    clearLastOpenedProjectName();

    const fallbackDoc = await loadDocument();
    expect(fallbackDoc).toBeDefined();
    // It should successfully pick a project without throwing
    expect(["Project X", "Project Y"]).toContain(fallbackDoc?.projectName);
  });

  it("extracts and resolves assets in doc.assets array as well as layers", async () => {
    const fakeDataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const doc = createMockDocument("Project With Assets Array");
    doc.assets = [
      {
        id: "asset-1",
        name: "Test Asset",
        dataUrl: fakeDataUrl,
        width: 100,
        height: 100,
        createdAt: 12345,
      },
    ];

    await saveDocument(doc);

    const db = await getDB();
    const stored = await db.get("documents", "Project With Assets Array");
    expect(stored?.assets?.[0].dataUrl.startsWith("asset:")).toBe(true);

    const loaded = await loadDocument("Project With Assets Array");
    expect(loaded?.assets?.[0].dataUrl).toBe(fakeDataUrl);
  });

  it("handles backward-compatibility for documents stored with raw data URLs", async () => {
    const fakeDataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const legacyDoc = createMockDocument("Legacy Project", fakeDataUrl);

    // Directly put into IndexedDB without extraction
    const db = await getDB();
    await db.put("documents", legacyDoc, "Legacy Project");

    // loadDocument should return the document with raw dataUrl intact
    const loaded = await loadDocument("Legacy Project");
    expect(loaded?.scenes[0].layers[0].image?.src).toBe(fakeDataUrl);

    // When re-saved, it should migrate to content-addressed storage
    await saveDocument(loaded!);
    const updatedRaw = await db.get("documents", "Legacy Project");
    expect(updatedRaw?.scenes[0].layers[0].image?.src.startsWith("asset:")).toBe(true);
  });

  it("returns null for non-existent document or empty database", async () => {
    expect(await loadDocument()).toBeNull();
    expect(await loadDocument("Non Existent")).toBeNull();
  });
});
