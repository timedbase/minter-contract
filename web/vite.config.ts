import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [
    nodePolyfills({ include: ["buffer", "process"] }),
    react(),
  ],
  resolve: {
    alias: {
      "@contracts": resolve(__dirname, "../build"),
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
