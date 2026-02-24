import { serve } from "@hono/node-server"
import { cleanupInterruptedSteps } from "@adt/storage"
import app, { booksDir } from "./app.js"

type ServerInfo = { port: number }
type ServeFn = (
  options: { fetch: typeof app.fetch; port: number },
  onListen?: (info: ServerInfo) => void
) => unknown

interface StartServerOptions {
  serveFn?: ServeFn
  cleanupFn?: (dir: string) => void
  booksDirPath?: string
  fetchHandler?: typeof app.fetch
  port?: number
  log?: (message: string) => void
}

export function startServer(options: StartServerOptions = {}): unknown {
  const port = options.port ?? parseInt(process.env.PORT ?? "3001", 10)
  const serveFn = options.serveFn ?? (serve as ServeFn)
  const cleanupFn = options.cleanupFn ?? cleanupInterruptedSteps
  const booksDirPath = options.booksDirPath ?? booksDir
  const fetchHandler = options.fetchHandler ?? app.fetch
  const log = options.log ?? console.log

  // Startup-only cleanup: run once before the server accepts requests.
  cleanupFn(booksDirPath)

  return serveFn({ fetch: fetchHandler, port }, (info) => {
    log(`API server running on http://localhost:${info.port}`)
  })
}
