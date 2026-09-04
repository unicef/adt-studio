import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { parseBookLabel, PackagingWarning } from "@adt/types"
import { createBookStorage } from "@adt/storage"
import {
  packageAdtWeb,
  computePackagingInputHash,
  loadBookConfig,
  normalizeLocale,
  runAccessibilityAssessment,
  runBrowserAccessibilityAssessment,
  mergeAccessibilityResults,
  isFixedLayoutBook,
} from "@adt/pipeline"
import type { Storage } from "@adt/storage"
import type { TaskService } from "../services/task-service.js"

const PACKAGE_VERSION_LENGTH = 16

interface PackagingCacheState {
  cached: boolean
  version: string
}

interface PackagingStatus {
  label: string
  hasAdt: boolean
  version?: string
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
): PackagingCacheState {
  const hashPath = getBuildHashPath(bookDir)
  const { language, outputLanguages, title, config } = resolvePackagingParams(
    storage, safeLabel, booksDir, configPath,
  )
  const hash = computePackagingInputHash({
    storage, bookDir, label: safeLabel, language, outputLanguages, title,
    webAssetsDir, applyBodyBackground: config.apply_body_background,
    config: config as unknown as Record<string, unknown>,
  })
  const cached = fs.existsSync(hashPath) && fs.readFileSync(hashPath, "utf-8").trim() === hash
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
): Hono {
  const app = new Hono()

  app.post("/books/:label/package-adt", async (c) => {
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
      if (cacheState.cached) {
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
        .find((task) => task.kind === "package-adt" && task.status === "running")
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
          return await runPackaging(safeLabel, booksDir, bookDir, webAssetsDir, configPath)
        },
        { url: `/books/${safeLabel}/preview` },
      )
      return c.json({ status: "submitted", taskId, label: safeLabel, version: cacheState.version })
    }

    try {
      const result = await runPackaging(safeLabel, booksDir, bookDir, webAssetsDir, configPath)
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
): Promise<PackagingResult> {
  const storage = createBookStorage(safeLabel, booksDir)
  try {
    const { config, language, outputLanguages, title } = resolvePackagingParams(
      storage, safeLabel, booksDir, configPath,
    )

    // Check build cache — skip if all inputs are unchanged
    const hashOptions = {
      storage,
      bookDir,
      label: safeLabel,
      language,
      outputLanguages,
      title,
      webAssetsDir,
      applyBodyBackground: config.apply_body_background,
      config: config as unknown as Record<string, unknown>,
    }
    const hashPath = getBuildHashPath(bookDir)
    const versionPath = getBuildVersionPath(bookDir)
    const preHash = computePackagingInputHash(hashOptions)
    const bundleVersion = packageVersionFromHash(preHash)
    if (fs.existsSync(hashPath) && fs.readFileSync(hashPath, "utf-8").trim() === preHash) {
      return {
        version: readBuildVersion(bookDir, preHash),
        warnings: readBuildWarnings(bookDir),
      }
    }

    const { warnings } = await packageAdtWeb(storage, {
      bookDir,
      label: safeLabel,
      language,
      outputLanguages,
      title,
      webAssetsDir,
      bundleVersion,
      applyBodyBackground: config.apply_body_background,
      speechConfig: config.speech,
      fixedLayout: isFixedLayoutBook(config),
      reflowableFont: config.reflowable_font,
      quizMatchBookStyle: config.quiz_generation?.match_book_style ?? true,
    })
    fs.writeFileSync(versionPath, bundleVersion, "utf-8")
    writeBuildWarnings(bookDir, warnings)

    const baseAccessibility = await runAccessibilityAssessment({
      bookDir,
      config: config.accessibility_assessment,
    })

    // Recheck JSDOM incompletes with a real browser (Playwright) when available.
    // Falls back to the JSDOM-only result if Chromium is not installed.
    let accessibilityOutput = baseAccessibility
    try {
      const browserAccessibility = await runBrowserAccessibilityAssessment({
        bookDir,
        baseAssessment: baseAccessibility,
      })
      accessibilityOutput = mergeAccessibilityResults(baseAccessibility, browserAccessibility)
    } catch {
      // Playwright/Chromium not available — use JSDOM results as-is
    }

    storage.putNodeData("accessibility-assessment", "book", accessibilityOutput)

    // Recompute hash after build — packageAdtWeb may update storage (e.g. text-catalog)
    const postHash = computePackagingInputHash(hashOptions)
    fs.writeFileSync(hashPath, postHash, "utf-8")
    fs.writeFileSync(versionPath, bundleVersion, "utf-8")
    return { version: bundleVersion, warnings }
  } finally {
    storage.close()
  }
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
