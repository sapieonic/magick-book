import mongoose from "mongoose";

/**
 * MongoDB connection.
 *
 * Resolution order:
 *   1. MONGODB_URI from env  → real cluster (MongoDB Atlas, local mongod, …)
 *   2. otherwise (dev)       → spin up an in-memory MongoDB so the app boots
 *                              with zero infrastructure. The data is seeded on
 *                              first connect (see ensureSeeded()).
 *
 * The connection + memory server are cached on globalThis so Next.js hot
 * reloads in dev don't open a new connection on every request.
 */

type Cache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
  usingMemory: boolean;
};

const g = globalThis as unknown as { _mbMongoose?: Cache };
const cache: Cache = g._mbMongoose ?? { conn: null, promise: null, usingMemory: false };
g._mbMongoose = cache;

async function resolveUri(): Promise<{ uri: string; memory: boolean }> {
  const fromEnv = process.env.MONGODB_URI;
  if (fromEnv && fromEnv.trim()) return { uri: fromEnv.trim(), memory: false };

  // Dev fallback: in-memory MongoDB. Imported lazily so it's never bundled
  // into production builds where MONGODB_URI is expected to be set.
  const { MongoMemoryServer } = await import("mongodb-memory-server");
  const gm = globalThis as unknown as { _mbMemServer?: InstanceType<typeof MongoMemoryServer> };
  if (!gm._mbMemServer) {
    gm._mbMemServer = await MongoMemoryServer.create({
      instance: { dbName: "magickbook" },
    });
    console.warn(
      "\x1b[33m[magickbook]\x1b[0m MONGODB_URI not set — started an in-memory MongoDB for local dev. " +
        "Set MONGODB_URI to use a persistent database (e.g. MongoDB Atlas).",
    );
  }
  return { uri: gm._mbMemServer.getUri("magickbook"), memory: true };
}

export async function connectDB(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    cache.promise = (async () => {
      const { uri, memory } = await resolveUri();
      cache.usingMemory = memory;
      mongoose.set("strictQuery", true);
      const conn = await mongoose.connect(uri, {
        dbName: "magickbook",
        bufferCommands: false,
      });
      return conn;
    })();
  }

  try {
    cache.conn = await cache.promise;
  } catch (err) {
    cache.promise = null;
    throw err;
  }

  // First-time data so the app is never an empty dashboard.
  await ensureSeeded(cache.usingMemory);
  return cache.conn;
}

export function isUsingMemoryDB(): boolean {
  return cache.usingMemory;
}

let seedPromise: Promise<void> | null = null;
async function ensureSeeded(isMemory: boolean): Promise<void> {
  // Always seed the ephemeral memory DB. For a real DB, only seed when empty
  // and when explicitly allowed (SEED_ON_BOOT) so we never clobber real data.
  const allow = isMemory || process.env.SEED_ON_BOOT === "true";
  if (!allow) return;
  if (!seedPromise) {
    seedPromise = (async () => {
      const { seedDatabase } = await import("./seed");
      await seedDatabase({ force: false });
    })().catch((e) => {
      seedPromise = null;
      throw e;
    });
  }
  return seedPromise;
}
