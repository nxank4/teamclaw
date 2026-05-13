import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../../../dist/client",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("/node_modules/react/") || id.includes("/node_modules/react-dom/")) {
            return "react-vendor";
          }
          if (
            id.includes("/node_modules/reactflow/") ||
            id.includes("/node_modules/@dnd-kit/")
          ) {
            return "reactflow-vendor";
          }
        },
      },
    },
  },
});
