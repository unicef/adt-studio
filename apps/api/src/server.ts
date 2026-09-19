import { serve } from "@hono/node-server"
import { cleanupInterruptedSteps } from "@adt/storage"
import app, { booksDir } from "./app.js"

declare global {
  namespace NodeJS {
    interface Process {
      parentPort?: {
        postMessage: (message: unknown) => void
      }
    }
  }
}

const LOOPBACK_ONLY_HOST = "127.0.0.1"

type ServerInfo = { port: number }
type ServeFn = (
  options: { fetch: typeof app.fetch; port: number; hostname?: string },
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
  const isDesktop = process.env?.ADT_ENVIRONMENT === "electron"
  const defaultPort = isDesktop ? "0" : "3001"
  const port = options.port ?? parseInt(process.env.PORT ?? defaultPort, 10)
  const serveFn = options.serveFn ?? (serve as ServeFn)
  const cleanupFn = options.cleanupFn ?? cleanupInterruptedSteps
  const booksDirPath = options.booksDirPath ?? booksDir
  const fetchHandler = options.fetchHandler ?? app.fetch
  const log = options.log ?? console.log

  // Startup-only cleanup: run once before the server accepts requests.
  cleanupFn(booksDirPath)

  console.log({
    ADT_ENVIRONMENT: process.env.ADT_ENVIRONMENT
  })

  return serveFn(
    {
      fetch: fetchHandler,
      port,
      ...(isDesktop ? { hostname: LOOPBACK_ONLY_HOST } : {}),
    },
    (info) => {
      log(`API server running on http://localhost:${info.port}`)
      process.parentPort?.postMessage({ type: "api-ready", port: info.port })
    },
  )
}
