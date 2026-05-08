import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@contracts": resolve(__dirname, "../build"),
    },
  },
  define: {
    // Required by some TON libraries that use Node.js globals
    global: "globalThis",
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
