import { serve } from "@hono/node-server"
import { cleanupInterruptedSteps } from "@adt/storage"
import app, { booksDir } from "./app.js"

const port = parseInt(process.env.PORT ?? "3001", 10)

// Reset any pipeline steps stuck in "running" state from a previous crash
cleanupInterruptedSteps(booksDir)

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API server running on http://localhost:${info.port}`)
})
