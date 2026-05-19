import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Mirrors the `@/*` → `./*` path alias from tsconfig.json so unit tests
// can import modules the same way the app does.
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
  },
});
