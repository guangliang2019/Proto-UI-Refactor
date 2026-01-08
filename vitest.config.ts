import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: [
      "packages/**/*.test.ts",
      "packages/**/test/**/*.test.ts",
      "internal/contracts/__tests__/**/*.test.ts",
    ],
  },
});
