import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Path alias mirrors tsconfig: @/* -> ./src/*
      "@": resolve(root, "src"),
      // server-only throws outside a Next bundle; swap for a no-op stub.
      "server-only": resolve(root, "test/stubs/server-only.ts"),
    },
  },
  test: {
    globals: true,
    // Backend/unit tests run in node by default; React component tests opt into
    // jsdom per-file via a `// @vitest-environment jsdom` pragma at the top.
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    // mongodb-memory-server binaries + connection can be slow on first download.
    testTimeout: 60_000,
    hookTimeout: 120_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary"],
      include: ["src/lib/**", "src/app/api/**", "src/components/**"],
      exclude: ["src/lib/seed.ts", "src/lib/db-seed-helper.ts", "src/scripts/**"],
    },
  },
});
