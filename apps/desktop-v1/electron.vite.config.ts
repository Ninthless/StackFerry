import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: "src/main/index.ts",
          control: "src/control/index.ts",
          proxy: "src/proxy/index.ts",
        },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        output: {
          format: "cjs",
          entryFileNames: "index.js",
        },
      },
    },
  },
  renderer: {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
    },
    css: {
      postcss: {},
    },
  },
});
