import mongoose from "mongoose";

/**
 * Minimal direct connection used only by the `npm run seed` CLI. Unlike
 * connectDB() it does NOT auto-seed on connect (the CLI calls seedDatabase
 * itself) and requires a real MONGODB_URI.
 */
export async function connectDBForSeed(): Promise<typeof mongoose> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. The seed CLI targets a real database. " +
        "Set MONGODB_URI (e.g. your MongoDB Atlas connection string) and retry.",
    );
  }
  mongoose.set("strictQuery", true);
  return mongoose.connect(uri, { dbName: "magickbook" });
}
