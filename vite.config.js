import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, "src/index.ts"),
        rfc4180: resolve(__dirname, "src/rfc4180.ts"),
      },
      formats: ["es"],
    },
  },
});
