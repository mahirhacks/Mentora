import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["scenarios/**/*.test.ts"],
    reporters: ["default", "json"],
    outputFile: {
      json: path.join(root, "reports", "vitest-results.json"),
    },
    testTimeout: 20000,
  },
  resolve: {
    alias: {
      "@mentora/shared": path.resolve(root, "../shared/src/index.ts"),
      "@client": path.resolve(root, "../client/src"),
    },
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"],
  },
});
