import fs from "node:fs"
import path from "node:path"
import { z } from "zod"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { parseBookLabel, PackagingWarning, type PackagingStatus } from "@adt/types"
import { createBookStorage, withBookWriter } from "@adt/storage"
import {
  packageAdtWeb,
  validationArtifactHash,
  createGenerationPublication,
  newPackageAttempt,
  publishPackageAttempt,
  recoverPackagePublication,
  inputSignature,
  packageInventoryValid,
  writePackageInventory,
  computePackagingInputHash,
  loadBookConfig,
  normalizeLocale,
  runAccessibilityAssessment,
  runBrowserAccessibilityAssessment,
  mergeAccessibilityResults,
  isFixedLayoutBook,
  prepareSectioningRun,
  assertDownstreamSectioningCurrent,
  SectioningSafetyError,
} from "@adt/pipeline"
import type { Storage } from "@adt/storage"
import type { TaskService } from "../services/task-service.js"

const PACKAGE_VERSION_LENGTH = 16

interface PackagingCacheState {
  cached: boolean
  version: string
}

interface PackagingResult {
  version: string
  warnings: PackagingWarning[]
}

function packageVersionFromHash(hash: string): string {
  return hash.slice(0, PACKAGE_VERSION_LENGTH)
}

function getBuildHashPath(bookDir: string): string {
  return path.join(bookDir, "adt", ".build-hash")
}

function getBuildVersionPath(bookDir: string): string {
  return path.join(bookDir, "adt", ".build-version")
}

function getBuildWarningsPath(bookDir: string): string {
  return path.join(bookDir, "adt", ".build-warnings")
}

/**
 * Cached alongside the build hash so a cache hit reports the same omissions as
 * the build that produced the bundle. Without this, packaging a second time
 * short-circuits and the bundle looks clean while still missing pages.
 */
function writeBuildWarnings(bookDir: string, warnings: PackagingWarning[]): void {
  fs.writeFileSync(getBuildWarningsPath(bookDir), JSON.stringify(warnings), "utf-8")
}

function readBuildWarnings(bookDir: string): PackagingWarning[] {
  const warningsPath = getBuildWarningsPath(bookDir)
  if (!fs.existsSync(warningsPath)) return []
  try {
    const parsed = PackagingWarning.array().safeParse(
      JSON.parse(fs.readFileSync(warningsPath, "utf-8")) as unknown,
    )
    return parsed.success ? parsed.data : []
  } catch {
    // A truncated or hand-edited sidecar is not worth failing a package over —
    // the warning is diagnostic, and the next real build rewrites it.
    return []
  }
}

/**
 * Whether the bundle on disk can be served without rebuilding.
 *
 * The inputs must be unchanged *and* the warnings sidecar must exist. A cache
 * entry that cannot say what its build left out is not usable: builds cached
 * before the sidecar existed would otherwise pass the hash check and report a
 * clean run while the bundle on disk is still missing pages. Treating those as
 * stale costs one rebuild per book on upgrade, once.
 */
function isBuildCacheValid(bookDir: string, hash: string): boolean {
  const hashPath = getBuildHashPath(bookDir)
  if (!fs.existsSync(hashPath) || fs.readFileSync(hashPath, "utf-8").trim() !== hash) return false
  return fs.existsSync(getBuildWarningsPath(bookDir)) && packageInventoryValid(path.join(bookDir, "adt"))
}

function readBuildVersion(bookDir: string, fallbackHash: string): string {
  const versionPath = getBuildVersionPath(bookDir)
  if (fs.existsSync(versionPath)) {
    const version = fs.readFileSync(versionPath, "utf-8").trim()
    if (version.length > 0) return version
  }
  return packageVersionFromHash(fallbackHash)
}

function readStoredBuildVersion(bookDir: string): string | null {
  const versionPath = getBuildVersionPath(bookDir)
  if (!fs.existsSync(versionPath)) return null
  const version = fs.readFileSync(versionPath, "utf-8").trim()
  return version.length > 0 ? version : null
}

function getPackagingCacheState(
  storage: Storage,
  safeLabel: string,
  booksDir: string,
  bookDir: string,
  webAssetsDir: string,
  configPath?: string,
  promptsDir = path.resolve("prompts"),
): PackagingCacheState {
  const { language, outputLanguages, title, config } = resolvePackagingParams(
    storage, safeLabel, booksDir, configPath,
  )
  const hash = computePackagingInputHash({
    storage, bookDir, label: safeLabel, language, outputLanguages, title,
    webAssetsDir, applyBodyBackground: config.apply_body_background,
    config: config as unknown as Record<string, unknown>,
    promptsDir, configDir: configPath ? path.join(path.dirname(configPath), "config") : path.resolve("config"),
  })
  const cached = isBuildCacheValid(bookDir, hash)
  return {
    cached,
    version: cached ? readBuildVersion(bookDir, hash) : packageVersionFromHash(hash),
  }
}

function resolvePackagingParams(
  storage: Storage,
  safeLabel: string,
  booksDir: string,
  configPath?: string,
) {
  // Cached builds and direct preview tasks obey the same stale-state boundary
  // as the Package stage; retained files alone do not authorize a rebuild.
  prepareSectioningRun(safeLabel, booksDir, "package", "package", configPath)
  const config = loadBookConfig(safeLabel, booksDir, configPath)
  const metadataRow = storage.getLatestNodeData("metadata", "book")
  const metadata = metadataRow?.data as {
    title?: string | null
    language_code?: string | null
  } | null
  const language = normalizeLocale(
    config.editing_language ?? metadata?.language_code ?? "en",
  )
  const outputLanguages = Array.from(
    new Set(
      [language, ...(config.output_languages ?? [])].map((code) =>
        normalizeLocale(code),
      ),
    ),
  )
  const title = metadata?.title ?? safeLabel
  return { config, language, outputLanguages, title }
}

export function createPackageRoutes(
  booksDir: string,
  webAssetsDir: string,
  configPath?: string,
  taskService?: TaskService,
  promptsDir = path.resolve("prompts"),
): Hono {
  const app = new Hono()

  app.post("/books/:label/package-adt", async (c) => {
    const query = z.enum(["true", "false"]).optional().safeParse(c.req.query("refreshValidation"))
    if (!query.success) throw new HTTPException(400, { message: "Invalid validation refresh option" })
    const refreshValidation = query.data === "true"
    const { label } = c.req.param()
    let safeLabel: string
    try {
      safeLabel = parseBookLabel(label)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new HTTPException(400, { message })
    }

    const resolvedBooksDir = path.resolve(booksDir)
    const bookDir = path.join(resolvedBooksDir, safeLabel)
    if (!fs.existsSync(path.join(bookDir, `${safeLabel}.db`))) {
      throw new HTTPException(404, {
        message: `Book not found: ${safeLabel}`,
      })
    }

    if (!fs.existsSync(webAssetsDir)) {
      throw new HTTPException(500, {
        message: "Web assets directory not found",
      })
    }

    let cacheState: PackagingCacheState
    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const pages = storage.getPages()
      const hasRendering = pages.some(
        (p) => storage.getLatestNodeData("web-rendering", p.pageId) !== null,
      )
      if (!hasRendering) {
        throw new HTTPException(409, {
          message: "At least one page must have a web rendering before packaging",
        })
      }

      // Fast path: skip task submission entirely when build cache is valid.
      // The bundle on disk is whatever the cached build produced, omissions
      // included, so replay that build's warnings rather than reporting none.
      cacheState = getPackagingCacheState(storage, safeLabel, booksDir, bookDir, webAssetsDir, configPath)
      if (cacheState.cached && !refreshValidation) {
        return c.json({
          status: "completed",
          label: safeLabel,
          version: cacheState.version,
          warnings: readBuildWarnings(bookDir),
        })
      }
    } finally {
      storage.close()
    }

    if (taskService) {
      const existingTask = taskService
        .getActiveTasks(safeLabel)
        .find((task) => task.kind === "package-adt" && (task.status === "running" || task.status === "queued"))
      if (existingTask) {
        return c.json({
          status: "submitted",
          taskId: existingTask.taskId,
          label: safeLabel,
          version: cacheState.version,
        })
      }

      const { taskId } = taskService.submitTask(
        safeLabel,
        "package-adt",
        "Packaging ADT preview",
        async () => {
          return await runPackaging(safeLabel, booksDir, bookDir, webAssetsDir, configPath, promptsDir, refreshValidation)
        },
        { url: `/books/${safeLabel}/preview` },
      )
      return c.json({ status: "submitted", taskId, label: safeLabel, version: cacheState.version })
    }

    try {
      const result = await runPackaging(safeLabel, booksDir, bookDir, webAssetsDir, configPath, promptsDir, refreshValidation)
      return c.json({
        status: "completed",
        label: safeLabel,
        version: result.version,
        // Anything packaging had to omit. The run still succeeds, so a caller
        // that ignores this cannot tell a short bundle from a complete one.
        warnings: result.warnings,
      })
    } catch (err) {
      if (err instanceof HTTPException) throw err
      const message = err instanceof Error ? err.message : String(err)
      throw new HTTPException(500, { message: `Packaging failed: ${message}` })
    }
  })

  app.get("/books/:label/package-adt/status", (c) => {
    const { label } = c.req.param()
    let safeLabel: string
    try {
      safeLabel = parseBookLabel(label)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new HTTPException(400, { message })
    }

    const bookDir = path.join(path.resolve(booksDir), safeLabel)
    const pagesPath = path.join(bookDir, "adt", "content", "pages.json")
    const hasAdt = hasPackagedAdtPages(pagesPath)
    const version = hasAdt ? readStoredBuildVersion(bookDir) : null

    const status: PackagingStatus = { label: safeLabel, hasAdt }
    if (version) status.version = version
    if (fs.existsSync(path.join(bookDir, `${safeLabel}.db`))) {
      try {
        // Use the same admission rule as preview/export. File existence says
        // the package is retained, not that it is compatible with this mode.
        prepareSectioningRun(safeLabel, booksDir, "package", "package", configPath)
      } catch (error) {
        if (!(error instanceof SectioningSafetyError) || error.code !== "SECTIONING_STALE") throw error
        status.modeCompatible = false
      }
    }
    return c.json(status)
  })

  return app
}

async function runPackaging(
  safeLabel: string,
  booksDir: string,
  bookDir: string,
  webAssetsDir: string,
  configPath?: string,
  promptsDir = path.resolve("prompts"),
  refreshValidation = false,
): Promise<PackagingResult> {
  return withBookWriter(bookDir, async () => {
    recoverPackagePublication(bookDir)
    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const { config, language, outputLanguages, title } = resolvePackagingParams(storage, safeLabel, booksDir, configPath)
      const configDir = configPath ? path.join(path.dirname(configPath), "config") : path.resolve("config")
      const hashOptions = {
        storage, bookDir, label: safeLabel, language, outputLanguages, title,
        webAssetsDir, applyBodyBackground: config.apply_body_background,
        config: config as unknown as Record<string, unknown>, promptsDir, configDir,
      }
      const preHash = computePackagingInputHash(hashOptions)
      const bundleVersion = packageVersionFromHash(preHash)
      if (!refreshValidation && isBuildCacheValid(bookDir, preHash)) {
        return { version: readBuildVersion(bookDir, preHash), warnings: readBuildWarnings(bookDir) }
      }
      const configSignature = inputSignature(config)
      const publication = createGenerationPublication(storage, () => {
        assertDownstreamSectioningCurrent(loadBookConfig(safeLabel, booksDir, configPath), bookDir, "package")
        if (configSignature !== inputSignature(loadBookConfig(safeLabel, booksDir, configPath)) || computePackagingInputHash(hashOptions) !== preHash) {
          throw new Error("Packaging inputs changed during assessment; no evidence was published")
        }
      })
      const attempt = newPackageAttempt(bookDir)
      const directory = path.join(attempt, "adt")
      const { warnings } = await packageAdtWeb(publication.storage, {
        promptsDir, configDir, bookDir, outputDir: directory, label: safeLabel,
        language, outputLanguages, title, webAssetsDir, bundleVersion,
        applyBodyBackground: config.apply_body_background, config, speechConfig: config.speech,
        fixedLayout: isFixedLayoutBook(config), reflowableFont: config.reflowable_font,
        quizMatchBookStyle: config.quiz_generation?.match_book_style ?? true,
      })
      const baseAccessibility = await runAccessibilityAssessment({ bookDir: attempt, config: config.accessibility_assessment })
      let accessibilityOutput = baseAccessibility
      try {
        const browserAccessibility = await runBrowserAccessibilityAssessment({ bookDir: attempt, baseAssessment: baseAccessibility })
        accessibilityOutput = mergeAccessibilityResults(baseAccessibility, browserAccessibility)
      } catch {
        // An unavailable browser leaves unresolved JSDOM checks incomplete.
      }
      if (baseAccessibility.artifactHash !== validationArtifactHash(directory)) {
        throw new Error("Packaged artifact changed during browser assessment; no evidence was published")
      }
      const version = publication.storage.putNodeData("accessibility-assessment", "book", accessibilityOutput)
      const postHash = computePackagingInputHash({ ...hashOptions, storage: publication.storage })
      fs.writeFileSync(getBuildHashPath(attempt), postHash, "utf8")
      fs.writeFileSync(getBuildVersionPath(attempt), bundleVersion, "utf8")
      writeBuildWarnings(attempt, warnings)
      writePackageInventory(directory)
      publishPackageAttempt(bookDir, attempt, () => publication.publish(), { version, artifactHash: baseAccessibility.artifactHash! })
      return { version: bundleVersion, warnings }
    } finally { storage.close() }
  })
}

function hasPackagedAdtPages(pagesPath: string): boolean {
  if (!fs.existsSync(pagesPath)) {
    return false
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(pagesPath, "utf-8")) as unknown
    if (!Array.isArray(parsed)) {
      return false
    }

    return parsed.some((entry) => {
      if (typeof entry !== "object" || entry === null) {
        return false
      }
      const href = (entry as { href?: unknown }).href
      return typeof href === "string" && href.length > 0
    })
  } catch {
    return false
  }
}
