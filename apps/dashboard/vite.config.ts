import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"

export default defineConfig({
  plugins: [tanstackStart(), react(), tailwindcss()],
  server: {
    port: 5190,
    host: "localhost",
  },
  ssr: {
    external: ["node-sqlite3-wasm"],
  },
})
