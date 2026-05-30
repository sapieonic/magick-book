import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

/**
 * Hermetic DB test harness.
 *
 * Starts a DEDICATED in-memory MongoDB for the test process and points
 * process.env.MONGODB_URI at it BEFORE any app module reads it, so connectDB()
 * never touches the real Atlas cluster configured in .env.local (which Vitest
 * does not load anyway). SEED_ON_BOOT is forced off so connectDB() connects
 * without auto-seeding.
 */

let mem: MongoMemoryServer | null = null;

export async function startTestDB(): Promise<void> {
  // Guard: make absolutely sure we never connect to a non-memory server.
  delete process.env.SEED_ON_BOOT;
  mem = await MongoMemoryServer.create({ instance: { dbName: "magickbook" } });
  process.env.MONGODB_URI = mem.getUri("magickbook");
}

export async function stopTestDB(): Promise<void> {
  // Disconnect mongoose (connectDB caches the live connection on globalThis).
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mem) {
    await mem.stop();
    mem = null;
  }
}

/** Drop every document in every collection between tests. */
export async function clearDB(): Promise<void> {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}
