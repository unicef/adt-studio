import path from "node:path"
import fs from "node:fs"
import os from "node:os"
import { unzipSync } from "fflate"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { errorHandler } from "./middleware/error-handler.js"
import { healthRoutes } from "./routes/health.js"
import { createBookRoutes } from "./routes/books.js"
import { createPageRoutes } from "./routes/pages.js"
import { createDebugRoutes } from "./routes/debug.js"
import { createGlossaryRoutes } from "./routes/glossary.js"
import { createQuizRoutes } from "./routes/quizzes.js"
import { createPackageRoutes } from "./routes/package.js"
import { createPromptRoutes } from "./routes/prompts.js"
import { createTextCatalogRoutes } from "./routes/text-catalog.js"
import { createEasyReadRoutes } from "./routes/easy-read.js"
import { createTTSRoutes } from "./routes/tts.js"
import { createStageRoutes } from "./routes/stages.js"
import { createTaskRoutes } from "./routes/tasks.js"
import { createBookEventBus } from "./services/book-event-bus.js"
import { createStageService } from "./services/stage-service.js"
import { createStageRunner } from "./services/stage-runner.js"
import { createTaskService } from "./services/task-service.js"
import { createPresetRoutes } from "./routes/presets.js"
import { createAdtPreviewRoutes } from "./routes/adt-preview.js"
import { createSpeechConfigRoutes } from "./routes/speech-config.js"
import { createReviewerValidationRoutes } from "./routes/reviewer-validation.js"
import { createTocRoutes } from "./routes/toc.js"
import { createSignLanguageVideoRoutes } from "./routes/sign-language-videos.js"

// Resolve paths relative to monorepo root (2 levels up from apps/api/)
const projectRoot = path.resolve(
  process.env.PROJECT_ROOT ?? path.join(process.cwd(), "../..")
)
const booksDir = path.resolve(process.env.BOOKS_DIR ?? path.join(projectRoot, "books"))
const promptsDir = path.resolve(process.env.PROMPTS_DIR ?? path.join(projectRoot, "prompts"))
const configPath = path.resolve(
  process.env.CONFIG_PATH ?? path.join(projectRoot, "config.yaml")
)
const configFolderPath = path.resolve(
  process.env.CONFIG_FOLDER_PATH ?? path.join(projectRoot, "config")
)

let webAssetsDir: string
const adtResourcesZip = process.env.ADT_RESOURCES_ZIP
if (adtResourcesZip && fs.existsSync(adtResourcesZip)) {
  const extractDir = path.join(os.tmpdir(), `adt-assets-${process.pid}`)
  fs.mkdirSync(extractDir, { recursive: true })
  const unzipped = unzipSync(new Uint8Array(fs.readFileSync(adtResourcesZip)))
  for (const [filePath, data] of Object.entries(unzipped)) {
    const dest = path.join(extractDir, filePath)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, data)
  }
  webAssetsDir = extractDir
  process.on("exit", () => {
    try { fs.rmSync(extractDir, { recursive: true, force: true }) } catch {}
  })
  process.on("SIGTERM", () => process.exit(0))
} else {
  webAssetsDir = path.resolve(
    process.env.WEB_ASSETS_DIR ?? path.join(projectRoot, "assets", "adt")
  )
}

const eventBus = createBookEventBus()
const stageRunner = createStageRunner()
const stageService = createStageService(stageRunner, eventBus)
const taskService = createTaskService(eventBus)

const app = new Hono()

app.use("*", logger())
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "app://adt.studio",
]

app.use(
  "*",
  cors({
    origin: ALLOWED_ORIGINS,
  })
)
app.onError(errorHandler)

app.route("/api", healthRoutes)
app.route("/api", createBookRoutes(booksDir, webAssetsDir, configPath, taskService))
app.route("/api", createPageRoutes(booksDir, promptsDir, webAssetsDir, configPath, taskService))
app.route("/api", createGlossaryRoutes(booksDir, promptsDir, configPath))
app.route("/api", createTocRoutes(booksDir))
app.route("/api", createDebugRoutes(booksDir, promptsDir, configPath))
app.route("/api", createQuizRoutes(booksDir, promptsDir, configPath))
app.route("/api", createPackageRoutes(booksDir, webAssetsDir, configPath, taskService))
app.route("/api", createPromptRoutes(promptsDir, booksDir))
app.route("/api", createTextCatalogRoutes(booksDir))
app.route("/api", createEasyReadRoutes(booksDir, promptsDir, configPath))
app.route("/api", createTTSRoutes(booksDir, configPath, taskService))
app.route(
  "/api",
  createStageRoutes(stageService, eventBus, booksDir, promptsDir, webAssetsDir, configPath)
)
app.route("/api", createTaskRoutes(taskService))
app.route("/api", createPresetRoutes(configPath))
app.route("/api", createAdtPreviewRoutes(booksDir, webAssetsDir, configPath))
app.route("/api", createSpeechConfigRoutes(configPath))
app.route("/api", createReviewerValidationRoutes(booksDir, configFolderPath, configPath))
app.route("/api", createSignLanguageVideoRoutes(booksDir))

export default app
export { booksDir }
