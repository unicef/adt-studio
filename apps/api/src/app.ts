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
import { createGlossaryRoutes } from "./routes/glossary.js"
import { createQuizRoutes } from "./routes/quizzes.js"
import { createPipelineService } from "./services/pipeline-service.js"
import { createPipelineRunner } from "./services/pipeline-runner.js"
import { createProofService } from "./services/proof-service.js"
import { createProofRunner } from "./services/proof-runner.js"
import { createProofRoutes } from "./routes/proof.js"
import { createMasterService } from "./services/master-service.js"
import { createMasterRunner } from "./services/master-runner.js"
import { createMasterRoutes } from "./routes/master.js"
import { createPackageRoutes } from "./routes/package.js"
import { createPromptRoutes } from "./routes/prompts.js"
import { createTextCatalogRoutes } from "./routes/text-catalog.js"
import { createTTSRoutes } from "./routes/tts.js"
import { createStepRoutes } from "./routes/steps.js"
import { createStepService } from "./services/step-service.js"
import { createStepRunner } from "./services/step-runner.js"
import { createPresetRoutes } from "./routes/presets.js"
import { createAdtPreviewRoutes } from "./routes/adt-preview.js"
import { createSpeechConfigRoutes } from "./routes/speech-config.js"

// Resolve paths relative to monorepo root (2 levels up from apps/api/)
const projectRoot = path.resolve(
  process.env.PROJECT_ROOT ?? path.join(process.cwd(), "../..")
)
const booksDir = path.resolve(process.env.BOOKS_DIR ?? path.join(projectRoot, "books"))
const promptsDir = path.resolve(process.env.PROMPTS_DIR ?? path.join(projectRoot, "prompts"))
const configPath = path.resolve(
  process.env.CONFIG_PATH ?? path.join(projectRoot, "config.yaml")
)
const webAssetsDir = path.resolve(
  process.env.WEB_ASSETS_DIR ?? path.join(projectRoot, "assets", "adt")
)

const pipelineRunner = createPipelineRunner()
const pipelineService = createPipelineService(pipelineRunner)
const proofRunner = createProofRunner()
const proofService = createProofService(proofRunner)
const masterRunner = createMasterRunner()
const masterService = createMasterService(masterRunner)
const stepRunner = createStepRunner()
const stepService = createStepService(stepRunner, pipelineService)

const app = new Hono()

app.use("*", logger())
const ALLOWED_ORIGINS = [
  "http://localhost:5173",    // Vite dev
  "tauri://localhost",        // Tauri macOS
  "https://tauri.localhost",  // Tauri Windows
  "http://tauri.localhost",   // Tauri Linux
]

app.use(
  "*",
  cors({
    origin: ALLOWED_ORIGINS,
  })
)
app.onError(errorHandler)

app.route("/api", healthRoutes)
app.route("/api", createBookRoutes(booksDir, webAssetsDir, configPath))
app.route("/api", createPipelineRoutes(pipelineService, booksDir, promptsDir, configPath))
app.route("/api", createPageRoutes(booksDir, promptsDir, configPath))
app.route("/api", createProofRoutes(proofService, booksDir, promptsDir, configPath))
app.route("/api", createMasterRoutes(masterService, booksDir, promptsDir, configPath))
app.route("/api", createGlossaryRoutes(booksDir))
app.route("/api", createDebugRoutes(pipelineService, booksDir, promptsDir, configPath))
app.route("/api", createQuizRoutes(booksDir))
app.route("/api", createPackageRoutes(booksDir, webAssetsDir, configPath))
app.route("/api", createPromptRoutes(promptsDir, booksDir))
app.route("/api", createTextCatalogRoutes(booksDir))
app.route("/api", createTTSRoutes(booksDir))
app.route("/api", createStepRoutes(stepService, pipelineService, booksDir, promptsDir, configPath))
app.route("/api", createPresetRoutes(configPath))
app.route("/api", createAdtPreviewRoutes(booksDir, webAssetsDir, configPath))
app.route("/api", createSpeechConfigRoutes(configPath))

export default app
