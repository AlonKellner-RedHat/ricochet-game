import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/main.ts", "src/types/**"],
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@core": resolve(__dirname, "src/core"),
      "@scenes": resolve(__dirname, "src/scenes"),
      "@config": resolve(__dirname, "src/config"),
      "@types": resolve(__dirname, "src/types"),
      "@test": resolve(__dirname, "tests"),
    },
  },
});

