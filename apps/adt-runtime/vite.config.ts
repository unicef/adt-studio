import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { bookDevServerPlugin, booksRoot } from "./book-html.plugin";

export default defineConfig({
  plugins: [react(), tailwindcss(), bookDevServerPlugin()],
  publicDir: path.resolve(__dirname, "../../assets/adt"),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5174,
    fs: {
      allow: [
        path.resolve(__dirname, ".."),
        path.resolve(__dirname, "../.."),
        booksRoot,
      ],
    },
  },
});
