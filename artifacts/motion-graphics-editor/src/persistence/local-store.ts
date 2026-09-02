import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { EditorDocument } from "../store/editor-store";

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
}

const DB_NAME = "motion-graphics-editor-db";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<EditorDB>> | null = null;

function getDB(): Promise<IDBPDatabase<EditorDB>> {
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
      },
    });
  }
  return dbPromise;
}

/**
 * Writes an EditorDocument to the IndexedDB "documents" store
 * and appends a snapshot to rolling version history (retaining the last 20 saves).
 */
export async function saveDocument(doc: EditorDocument): Promise<void> {
  const db = await getDB();
  const key = doc.projectName || "default-project";

  const tx = db.transaction(["documents", "history"], "readwrite");
  await tx.objectStore("documents").put(doc, key);

  const timestamp = Date.now();
  await tx.objectStore("history").put({
    timestamp,
    projectName: key,
    document: doc,
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
}

/**
 * Loads an EditorDocument from IndexedDB. If projectName is provided,
 * retrieves that specific project, otherwise loads the first available document.
 */
export async function loadDocument(
  projectName?: string,
): Promise<EditorDocument | null> {
  try {
    const db = await getDB();
    if (projectName) {
      const doc = await db.get("documents", projectName);
      return doc || null;
    }
    const allKeys = await db.getAllKeys("documents");
    if (allKeys.length === 0) return null;
    const doc = await db.get("documents", allKeys[0]);
    return doc || null;
  } catch (error) {
    console.error("Failed to load document from IndexedDB:", error);
    return null;
  }
}
