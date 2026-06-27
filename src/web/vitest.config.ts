import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/web/**/*.test.ts", "src/web/**/*.test.tsx"],
    setupFiles: ["src/web/test/setup.ts"]
  }
});
