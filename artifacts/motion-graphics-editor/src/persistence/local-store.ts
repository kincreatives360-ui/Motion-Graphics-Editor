import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { EditorDocument } from "../store/editor-store";
import type { AnimationPreset, SceneTemplate } from "../presets/preset-library";

export type UserPreset =
  | ({ type: "animation" } & AnimationPreset)
  | ({ type: "template" } & SceneTemplate);

interface EditorDB extends DBSchema {
  documents: {
    key: string;
    value: EditorDocument;
  };
  history: {
    key: number;
    value: {
      timestamp: number;
      projectName: string;
      document: EditorDocument;
    };
    indexes: {
      "by-projectName": string;
    };
  };
  presets: {
    key: string;
    value: UserPreset;
  };
  assets: {
    key: string;
    value: string;
  };
}

const DB_NAME = "motion-graphics-editor-db";
const DB_VERSION = 3;

export const LAST_OPENED_PROJECT_KEY = "motion_last_opened_project_name";
let memoryLastOpenedProjectName: string | null = null;

let dbPromise: Promise<IDBPDatabase<EditorDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<EditorDB>> {
  if (!dbPromise) {
    dbPromise = openDB<EditorDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("documents")) {
          db.createObjectStore("documents");
        }
        if (!db.objectStoreNames.contains("history")) {
          const historyStore = db.createObjectStore("history", {
            keyPath: "timestamp",
          });
          historyStore.createIndex("by-projectName", "projectName");
        }
        if (!db.objectStoreNames.contains("presets")) {
          db.createObjectStore("presets", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("assets")) {
          db.createObjectStore("assets");
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Resets the cached database connection and storage state (primarily for tests).
 */
export function _resetDBForTesting(): void {
  if (dbPromise) {
    dbPromise.then((db) => db.close()).catch(() => {});
    dbPromise = null;
  }
  memoryLastOpenedProjectName = null;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(LAST_OPENED_PROJECT_KEY);
    }
  } catch {}
}

/**
 * Retrieves the name of the last opened or saved project.
 */
export function getLastOpenedProjectName(): string | null {
  try {
    if (typeof localStorage !== "undefined") {
      return (
        localStorage.getItem(LAST_OPENED_PROJECT_KEY) ||
        memoryLastOpenedProjectName
      );
    }
  } catch {}
  return memoryLastOpenedProjectName;
}

/**
 * Persists the name of the last opened or saved project.
 */
export function setLastOpenedProjectName(name: string | null): void {
  if (!name) {
    memoryLastOpenedProjectName = null;
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(LAST_OPENED_PROJECT_KEY);
      }
    } catch {}
    return;
  }
  memoryLastOpenedProjectName = name;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(LAST_OPENED_PROJECT_KEY, name);
    }
  } catch {}
}

/**
 * Clears the recorded last opened project name.
 */
export function clearLastOpenedProjectName(): void {
  setLastOpenedProjectName(null);
}

/**
 * Check if a value is an inline data URL (e.g. data:image/png;base64,...).
 */
export function isDataUrl(str: unknown): str is string {
  return typeof str === "string" && str.startsWith("data:");
}

/**
 * Check if a value is an asset reference (e.g. asset:hash).
 */
export function isAssetRef(str: unknown): boolean {
  return typeof str === "string" && str.startsWith("asset:");
}

/**
 * Strips the "asset:" prefix from an asset reference string.
 */
export function getAssetIdFromRef(ref: string): string {
  return ref.startsWith("asset:") ? ref.slice(6) : ref;
}

/**
 * Computes a deterministic content hash for content-addressed asset storage.
 * Uses SubtleCrypto SHA-256 with an FNV-1a 64-bit fallback.
 */
export async function computeContentHash(content: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    try {
      const buffer = new TextEncoder().encode(content);
      const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      // Fall through to string fallback
    }
  }

  // FNV-1a 64-bit string hash fallback
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  for (let i = 0; i < content.length; i++) {
    const code = content.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= code;
    h2 = Math.imul(h2, 0x01000193);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * Resolves content-addressed asset IDs back to raw data URLs before rendering.
 */
export async function resolveDocumentAssets(
  doc: EditorDocument,
  db?: IDBPDatabase<EditorDB>,
): Promise<EditorDocument> {
  if (!doc) return doc;
  const database = db ?? (await getDB());

  const resolvedScenes = await Promise.all(
    (doc.scenes || []).map(async (scene) => {
      const resolvedLayers = await Promise.all(
        (scene.layers || []).map(async (layer) => {
          if (layer.type === "image" && layer.image) {
            let assetId = layer.image.assetId;
            if (!assetId && isAssetRef(layer.image.src)) {
              assetId = getAssetIdFromRef(layer.image.src);
            }
            if (assetId) {
              try {
                const assetData = await database.get("assets", assetId);
                const resolvedUrl =
                  typeof assetData === "string"
                    ? assetData
                    : (assetData as any)?.dataUrl;
                if (resolvedUrl) {
                  return {
                    ...layer,
                    image: {
                      ...layer.image,
                      src: resolvedUrl,
                      assetId,
                    },
                  };
                }
              } catch (err) {
                console.warn(`Failed to resolve layer asset ${assetId}:`, err);
              }
            }
          }
          return layer;
        }),
      );
      return {
        ...scene,
        layers: resolvedLayers,
      };
    }),
  );

  let resolvedAssets = doc.assets;
  if (doc.assets && doc.assets.length > 0) {
    resolvedAssets = await Promise.all(
      doc.assets.map(async (asset) => {
        if (isAssetRef(asset.dataUrl)) {
          const assetId = getAssetIdFromRef(asset.dataUrl);
          try {
            const assetData = await database.get("assets", assetId);
            const resolvedUrl =
              typeof assetData === "string"
                ? assetData
                : (assetData as any)?.dataUrl;
            if (resolvedUrl) {
              return {
                ...asset,
                dataUrl: resolvedUrl,
              };
            }
          } catch (err) {
            console.warn(`Failed to resolve project asset ${assetId}:`, err);
          }
        }
        return asset;
      }),
    );
  }

  return {
    ...doc,
    scenes: resolvedScenes,
    assets: resolvedAssets,
  };
}

/**
 * Retrieves a single asset's raw data URL by ID.
 */
export async function getAsset(id: string): Promise<string | null> {
  try {
    const db = await getDB();
    const assetData = await db.get("assets", id);
    return typeof assetData === "string"
      ? assetData
      : (assetData as any)?.dataUrl ?? null;
  } catch (error) {
    console.error(`Failed to get asset ${id}:`, error);
    return null;
  }
}

let lastHistoryTimestamp = 0;

function getUniqueHistoryTimestamp(): number {
  const now = Date.now();
  if (now > lastHistoryTimestamp) {
    lastHistoryTimestamp = now;
    return now;
  }
  lastHistoryTimestamp += 1;
  return lastHistoryTimestamp;
}

/**
 * Writes an EditorDocument to the IndexedDB "documents" store
 * and appends a snapshot to rolling version history (retaining the last 20 saves).
 *
 * Image data URLs are extracted into a separate content-addressed "assets" store,
 * saving only reference IDs on the layer and in history snapshots to prevent
 * storage ballooning.
 */
export async function saveDocument(doc: EditorDocument): Promise<void> {
  const key = doc.projectName || "default-project";

  // 1. Scan for all inline data URLs and precalculate content hashes
  const assetMap = new Map<string, string>(); // dataUrl -> contentHash

  for (const scene of doc.scenes || []) {
    for (const layer of scene.layers || []) {
      if (
        layer.type === "image" &&
        layer.image?.src &&
        isDataUrl(layer.image.src)
      ) {
        if (!assetMap.has(layer.image.src)) {
          const hash = await computeContentHash(layer.image.src);
          assetMap.set(layer.image.src, hash);
        }
      }
    }
  }

  if (doc.assets) {
    for (const asset of doc.assets) {
      if (asset.dataUrl && isDataUrl(asset.dataUrl)) {
        if (!assetMap.has(asset.dataUrl)) {
          const hash = await computeContentHash(asset.dataUrl);
          assetMap.set(asset.dataUrl, hash);
        }
      }
    }
  }

  // 2. Prepare persisted snapshot with asset reference IDs instead of raw base64 data URLs
  const persistedDoc: EditorDocument = {
    ...doc,
    scenes: (doc.scenes || []).map((scene) => ({
      ...scene,
      layers: (scene.layers || []).map((layer) => {
        if (
          layer.type === "image" &&
          layer.image?.src &&
          isDataUrl(layer.image.src)
        ) {
          const hash = assetMap.get(layer.image.src)!;
          return {
            ...layer,
            image: {
              ...layer.image,
              src: `asset:${hash}`,
              assetId: hash,
            },
          };
        }
        return layer;
      }),
    })),
    assets: doc.assets?.map((asset) => {
      if (asset.dataUrl && isDataUrl(asset.dataUrl)) {
        const hash = assetMap.get(asset.dataUrl)!;
        return {
          ...asset,
          dataUrl: `asset:${hash}`,
        };
      }
      return asset;
    }),
  };

  // 3. Persist to IndexedDB within a single transaction
  const db = await getDB();
  const tx = db.transaction(["documents", "history", "assets"], "readwrite");
  const assetsStore = tx.objectStore("assets");

  // Save new assets (content-addressed, so existing identical assets are harmlessly deduplicated)
  for (const [dataUrl, hash] of assetMap.entries()) {
    await assetsStore.put(dataUrl, hash);
  }

  // Persist the live document
  await tx.objectStore("documents").put(persistedDoc, key);

  // Append snapshot to rolling history
  const timestamp = getUniqueHistoryTimestamp();
  await tx.objectStore("history").put({
    timestamp,
    projectName: key,
    document: persistedDoc,
  });

  // Keep the last 20 saves in the rolling version history
  const historyIndex = tx.objectStore("history").index("by-projectName");
  const allHistoryKeys = await historyIndex.getAllKeys(key);
  if (allHistoryKeys.length > 20) {
    const keysToDelete = allHistoryKeys.slice(0, allHistoryKeys.length - 20);
    for (const oldKey of keysToDelete) {
      await tx.objectStore("history").delete(oldKey);
    }
  }

  await tx.done;

  // Track as last opened / active project
  setLastOpenedProjectName(key);
}

/**
 * Loads an EditorDocument from IndexedDB. If projectName is provided,
 * retrieves that specific project. Otherwise, prefers the last opened/saved
 * project, falling back to the first available project key if none is recorded.
 *
 * Resolves all content-addressed asset reference IDs back to usable data URLs
 * before returning.
 */
export async function loadDocument(
  projectName?: string,
): Promise<EditorDocument | null> {
  try {
    const db = await getDB();
    let targetProject = projectName;

    if (!targetProject) {
      const lastOpened = getLastOpenedProjectName();
      if (lastOpened) {
        // Verify project still exists in documents store
        const existing = await db.get("documents", lastOpened);
        if (existing) {
          targetProject = lastOpened;
        }
      }
    }

    if (targetProject) {
      setLastOpenedProjectName(targetProject);
      const doc = await db.get("documents", targetProject);
      if (!doc) return null;
      return await resolveDocumentAssets(doc, db);
    }

    // Fallback: load first available project if no lastOpened project was found
    const allKeys = await db.getAllKeys("documents");
    if (allKeys.length === 0) return null;
    const fallbackKey = allKeys[0];
    setLastOpenedProjectName(fallbackKey);
    const doc = await db.get("documents", fallbackKey);
    if (!doc) return null;
    return await resolveDocumentAssets(doc, db);
  } catch (error) {
    console.error("Failed to load document from IndexedDB:", error);
    return null;
  }
}

/**
 * Persists a user preset (animation combo or scene template) to the "presets" object store.
 */
export async function saveUserPreset(preset: UserPreset): Promise<void> {
  try {
    const db = await getDB();
    await db.put("presets", preset);
  } catch (error) {
    console.error(
      "Failed to save preset to IndexedDB, fallback to localStorage:",
      error,
    );
    try {
      const raw = localStorage.getItem("motion_user_presets") || "[]";
      const list: UserPreset[] = JSON.parse(raw);
      const filtered = list.filter((p) => p.id !== preset.id);
      filtered.push(preset);
      localStorage.setItem("motion_user_presets", JSON.stringify(filtered));
    } catch (e) {
      console.error("LocalStorage fallback failed:", e);
    }
  }
}

/**
 * Retrieves all user presets from the "presets" object store.
 */
export async function getUserPresets(): Promise<UserPreset[]> {
  try {
    const db = await getDB();
    const presets = await db.getAll("presets");
    if (presets && presets.length > 0) return presets;
  } catch (error) {
    console.error("Failed to fetch presets from IndexedDB:", error);
  }

  // Check localStorage backup
  try {
    const raw = localStorage.getItem("motion_user_presets");
    if (raw) return JSON.parse(raw);
  } catch {}

  return [];
}

/**
 * Removes a user preset by ID.
 */
export async function deleteUserPreset(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete("presets", id);
  } catch (error) {
    console.error("Failed to delete preset from IndexedDB:", error);
  }

  try {
    const raw = localStorage.getItem("motion_user_presets");
    if (raw) {
      const list: UserPreset[] = JSON.parse(raw);
      const filtered = list.filter((p) => p.id !== id);
      localStorage.setItem("motion_user_presets", JSON.stringify(filtered));
    }
  } catch {}
}
