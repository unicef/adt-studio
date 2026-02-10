import path from "node:path"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { errorHandler } from "./middleware/error-handler.js"
import { healthRoutes } from "./routes/health.js"
import { createBookRoutes } from "./routes/books.js"

const booksDir = path.resolve(process.env.BOOKS_DIR ?? "books")

const app = new Hono()

app.use("*", logger())
app.use(
  "*",
  cors({
    origin: "http://localhost:5173",
  })
)
app.onError(errorHandler)

app.route("/api", healthRoutes)
app.route("/api", createBookRoutes(booksDir))

export default app
