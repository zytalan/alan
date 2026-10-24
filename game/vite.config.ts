import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Relative base so the build works from any folder or static host.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { target: "es2020", chunkSizeWarningLimit: 900 },
  test: { include: ["tests/**/*.test.ts"] },
});
