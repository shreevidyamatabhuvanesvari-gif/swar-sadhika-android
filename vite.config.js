import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  base: "./",
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: "node_modules/onnxruntime-web/dist/*.{wasm,mjs}",
          dest: "ort-wasm"
        }
      ]
    })
  ],
  worker: { format: "es" },
  build: { target: "esnext", outDir: "dist", emptyOutDir: true }
});
