import path from "node:path"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { errorHandler } from "./middleware/error-handler.js"
import { healthRoutes } from "./routes/health.js"
import { createBookRoutes } from "./routes/books.js"
import { createPipelineRoutes } from "./routes/pipeline.js"
import { createPageRoutes } from "./routes/pages.js"
import { createDebugRoutes } from "./routes/debug.js"
import { createPipelineService } from "./services/pipeline-service.js"
import { createPipelineRunner } from "./services/pipeline-runner.js"
import { createProofService } from "./services/proof-service.js"
import { createProofRunner } from "./services/proof-runner.js"
import { createProofRoutes } from "./routes/proof.js"

// Resolve paths relative to monorepo root (2 levels up from apps/api/)
const projectRoot = path.resolve(
  process.env.PROJECT_ROOT ?? path.join(process.cwd(), "../..")
)
const booksDir = path.resolve(process.env.BOOKS_DIR ?? path.join(projectRoot, "books"))
const promptsDir = path.resolve(process.env.PROMPTS_DIR ?? path.join(projectRoot, "prompts"))
const configPath = path.resolve(
  process.env.CONFIG_PATH ?? path.join(projectRoot, "config.yaml")
)

const pipelineRunner = createPipelineRunner()
const pipelineService = createPipelineService(pipelineRunner)
const proofRunner = createProofRunner()
const proofService = createProofService(proofRunner)

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
app.route("/api", createPipelineRoutes(pipelineService, booksDir, promptsDir, configPath))
app.route("/api", createPageRoutes(booksDir, promptsDir, configPath))
app.route("/api", createProofRoutes(proofService, booksDir, promptsDir, configPath))
app.route("/api", createDebugRoutes(pipelineService, booksDir, promptsDir, configPath))

export default app
