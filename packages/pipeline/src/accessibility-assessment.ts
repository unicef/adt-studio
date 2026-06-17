import fs from "node:fs"
import path from "node:path"
import { JSDOM } from "jsdom"
import {
  AccessibilityAssessmentConfig,
  AccessibilityAssessmentOutput,
  type AccessibilityAssessmentOutput as AccessibilityAssessmentOutputType,
  type AccessibilityPageResult,
} from "@adt/types"
import type { Progress } from "./progress.js"
import { nullProgress } from "./progress.js"
import {
  DEFAULT_AXE_RUN_ONLY_TAGS,
  DEFAULT_DISABLED_AXE_RULES,
  derivePageId,
  getAxeSource,
  getUniquePackagedPageEntries,
  isAxeInternalError,
  normalizeFinding,
  resolvePackagedPageFilePath,
  type PackagedPageManifestEntry,
} from "./accessibility-assessment-shared.js"

export interface RunAccessibilityAssessmentOptions {
  bookDir: string
  config?: AccessibilityAssessmentConfig
}

const STEP = "accessibility-assessment" as const

type JsdomWindowWithCanvas = {
  HTMLCanvasElement?: {
    prototype: object
  }
}

function installCanvasStub(window: JsdomWindowWithCanvas): void {
  const canvasPrototype = window.HTMLCanvasElement?.prototype
  if (!canvasPrototype) return

  Object.defineProperty(canvasPrototype, "getContext", {
    configurable: true,
    value: () => ({
      canvas: null,
      fillStyle: "#000000",
      strokeStyle: "#000000",
      font: "16px sans-serif",
      globalAlpha: 1,
      clearRect: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      scale: () => {},
      rotate: () => {},
      setTransform: () => {},
      transform: () => {},
      rect: () => {},
      clip: () => {},
      drawImage: () => {},
      fillText: () => {},
      strokeText: () => {},
      measureText: (text: string) => ({ width: text.length * 8 }),
      createImageData: (width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4),
        width,
        height,
      }),
      getImageData: (_x: number, _y: number, width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4),
        width,
        height,
      }),
      putImageData: () => {},
    }),
  })
}

async function auditPackagedPage(
  adtDir: string,
  entry: PackagedPageManifestEntry,
  axeSource: string,
  config: { runOnlyTags: string[]; disabledRules: string[] },
): Promise<AccessibilityPageResult> {
  const resolvedPath = resolvePackagedPageFilePath(adtDir, entry.href)
  if (resolvedPath.error || !resolvedPath.filePath) {
    return {
      pageId: derivePageId(entry.section_id),
      sectionId: entry.section_id,
      href: entry.href,
      pageNumber: entry.page_number ?? null,
      title: null,
      error: resolvedPath.error ?? "Packaged page path could not be resolved",
      violationCount: 0,
      incompleteCount: 0,
      passCount: 0,
      inapplicableCount: 0,
      violations: [],
      incomplete: [],
    }
  }

  const filePath = resolvedPath.filePath
  if (!fs.existsSync(filePath)) {
    return {
      pageId: derivePageId(entry.section_id),
      sectionId: entry.section_id,
      href: entry.href,
      pageNumber: entry.page_number ?? null,
      title: null,
      error: `Packaged page not found: ${entry.href}`,
      violationCount: 0,
      incompleteCount: 0,
      passCount: 0,
      inapplicableCount: 0,
      violations: [],
      incomplete: [],
    }
  }

  const html = fs.readFileSync(filePath, "utf-8")
  const dom = new JSDOM(html, {
    url: `file://${filePath}`,
    pretendToBeVisual: true,
    runScripts: "outside-only",
  })
  installCanvasStub(dom.window)

  try {
    dom.window.eval(axeSource)
    const axe = (dom.window as typeof dom.window & {
      axe?: {
        run: (context: unknown, options: unknown) => Promise<{
          violations?: unknown[]
          incomplete?: unknown[]
          passes?: unknown[]
          inapplicable?: unknown[]
        }>
      }
    }).axe

    if (!axe) {
      throw new Error("axe was not initialized in the page context")
    }

    const result = await axe.run(dom.window.document, {
      runOnly: {
        type: "tag",
        values: config.runOnlyTags,
      },
      rules: Object.fromEntries(
        config.disabledRules.map((ruleId) => [ruleId, { enabled: false }])
      ),
    })

    const violations = Array.isArray(result.violations)
      ? result.violations.map(normalizeFinding)
      : []
    // Filter out incomplete findings where axe-core itself errored (common in
    // JSDOM which lacks layout APIs). These are false positives, not real issues.
    const incomplete = Array.isArray(result.incomplete)
      ? result.incomplete.map(normalizeFinding).filter((f) => !isAxeInternalError(f))
      : []
    const passCount = Array.isArray(result.passes) ? result.passes.length : 0
    const inapplicableCount = Array.isArray(result.inapplicable)
      ? result.inapplicable.length
      : 0

    return {
      pageId: derivePageId(entry.section_id),
      sectionId: entry.section_id,
      href: entry.href,
      pageNumber: entry.page_number ?? null,
      title: dom.window.document.title || null,
      violationCount: violations.length,
      incompleteCount: incomplete.length,
      passCount,
      inapplicableCount,
      violations,
      incomplete,
    }
  } catch (error) {
    return {
      pageId: derivePageId(entry.section_id),
      sectionId: entry.section_id,
      href: entry.href,
      pageNumber: entry.page_number ?? null,
      title: dom.window.document.title || null,
      error: error instanceof Error ? error.message : String(error),
      violationCount: 0,
      incompleteCount: 0,
      passCount: 0,
      inapplicableCount: 0,
      violations: [],
      incomplete: [],
    }
  } finally {
    dom.window.close()
  }
}

export async function runAccessibilityAssessment(
  options: RunAccessibilityAssessmentOptions,
  progress: Progress = nullProgress,
): Promise<AccessibilityAssessmentOutputType> {
  progress.emit({ type: "step-start", step: STEP })
  progress.emit({ type: "step-progress", step: STEP, message: "Loading packaged pages..." })

  const bookDir = path.resolve(options.bookDir)
  const runOnlyTags = options.config?.run_only_tags?.length
    ? [...options.config.run_only_tags]
    : [...DEFAULT_AXE_RUN_ONLY_TAGS]
  const disabledRules = options.config?.disabled_rules
    ? [...options.config.disabled_rules]
    : [...DEFAULT_DISABLED_AXE_RULES]
  const adtDir = path.join(bookDir, "adt")
  const pageEntries = getUniquePackagedPageEntries(bookDir)

  const axeSource = getAxeSource(await import("axe-core"))
  const pages: AccessibilityPageResult[] = []

  for (let index = 0; index < pageEntries.length; index++) {
    const entry = pageEntries[index]
    progress.emit({
      type: "step-progress",
      step: STEP,
      message: `${index + 1}/${pageEntries.length}`,
      page: index + 1,
      totalPages: pageEntries.length,
    })
    pages.push(await auditPackagedPage(adtDir, entry, axeSource, { runOnlyTags, disabledRules }))
  }

  const output: AccessibilityAssessmentOutputType = {
    generatedAt: new Date().toISOString(),
    tool: "axe-core",
    runOnlyTags,
    disabledRules,
    pages,
    summary: {
      pageCount: pages.length,
      pagesWithViolations: pages.filter((page) => page.violationCount > 0).length,
      pagesWithErrors: pages.filter((page) => Boolean(page.error)).length,
      violationCount: pages.reduce((sum, page) => sum + page.violationCount, 0),
      incompleteCount: pages.reduce((sum, page) => sum + page.incompleteCount, 0),
    },
  }

  progress.emit({ type: "step-complete", step: STEP })
  return AccessibilityAssessmentOutput.parse(output)
}
