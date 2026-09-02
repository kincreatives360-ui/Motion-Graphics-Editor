import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

export const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;

let dbInstance: any;
if (pool) {
  try {
    dbInstance = drizzle(pool, { schema });
  } catch (err) {
    console.warn("[AI Studio] Database connection error — using mock", err);
    const noOp = {
      findMany: async () => [],
      findFirst: async () => null,
      findUnique: async () => null,
      create: async (d: any) => d?.data ?? {},
      update: async (d: any) => d?.data ?? {},
      delete: async () => ({}),
    };
    dbInstance = new Proxy({}, {
      get: (_, prop) => (prop === "query" ? new Proxy({}, { get: () => noOp }) : async () => []),
    });
  }
} else {
  console.warn("[AI Studio] DATABASE_URL not set — using in-memory mock");
  const noOp = {
    findMany: async () => [],
    findFirst: async () => null,
    findUnique: async () => null,
    create: async (d: any) => d?.data ?? {},
    update: async (d: any) => d?.data ?? {},
    delete: async () => ({}),
  };
  dbInstance = new Proxy({}, {
    get: (_, prop) => (prop === "query" ? new Proxy({}, { get: () => noOp }) : async () => []),
  });
}

export const db = dbInstance;
export * from "./schema";

