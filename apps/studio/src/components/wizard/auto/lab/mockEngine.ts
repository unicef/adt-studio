/* eslint-disable lingui/no-unlocalized-strings -- dev-only lab: scenario ids and simulated provider messages */
import type { SetupRecommendation } from "@adt/types"
import { ApiError } from "@/api/client"
import type { EngineClient } from "../engine/client"

/**
 * Saved engine answers from round 2 of the auto mode experiment (gpt-5.4-mini, run 1), one per
 * situation worth designing for. They answer about *that* book's pages, so the page numbers match
 * only when the same PDF is loaded; with another PDF the pages shown are just that PDF's pages.
 */
export const SCENARIOS = [
  { id: "spread-no-questions", label: "Picture book, no questions", note: "LP-4 Volcanoes · 52 pages · Spread, Fixed Layout" },
  { id: "asks-words", label: "Asks: words on the picture?", note: "Capítulo 01 · 24 pages · changes Render Strategy" },
  { id: "asks-kind", label: "Asks: story or school book?", note: "triste · 76 pages · changes Preset" },
  { id: "textbook", label: "Textbook, asks diagrams", note: "Cuaderno 5 · 100 pages · changes Figure Extraction" },
  { id: "two-questions", label: "Two questions", note: "1930 El Viaje · 224 pages" },
  { id: "reference", label: "Reference", note: "Biomolecules · 13 pages" },
  { id: "one-reading", label: "One reading failed", note: "Raven · 12 pages · only one AI reading ran, nothing asked" },
] as const

export type ScenarioId = (typeof SCENARIOS)[number]["id"]

const FIXTURES = import.meta.glob<SetupRecommendation>("./fixtures/*.json", { import: "default" })

/** `instant` is for the stepper's jumps past Reading; `hold` keeps Reading on screen. */
export const SPEEDS = { normal: 6500, fast: 900, slow: 22000, hold: Infinity, instant: 200 } as const
export type Speed = keyof typeof SPEEDS

export type LabError = "none" | "auth" | "quota" | "offline" | "unknown"

/** The errors the real route can return, in the shapes `request()` throws them. */
function failure(kind: Exclude<LabError, "none">): Error {
  if (kind === "auth") return new ApiError("401 Incorrect API key provided: sk-proj-****. You can find your API key at https://platform.openai.com/account/api-keys.", 401)
  if (kind === "quota") return new ApiError("429 You exceeded your current quota, please check your plan and billing details.", 429)
  if (kind === "offline") return new TypeError("Failed to fetch")
  return new ApiError("The page-label reading returned output that does not match its schema.", 500)
}

/** A scenario's saved engine answer. */
export const loadScenario = (book: ScenarioId) => FIXTURES[`./fixtures/${book}.json`]!().then((rec) => structuredClone(rec))

export function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => reject(new DOMException("Aborted", "AbortError"))
    if (signal.aborted) return abort()
    const id = Number.isFinite(ms) ? window.setTimeout(resolve, ms) : undefined
    signal.addEventListener("abort", () => {
      window.clearTimeout(id)
      abort()
    })
  })
}

/**
 * An engine client for the lab: a saved answer (or the real engine) after the chosen delay, or one
 * of the real errors. `real` with no error and normal speed is just the API.
 */
export function labEngine(book: ScenarioId | "real", speed: Speed, error: LabError, real: EngineClient): EngineClient {
  return {
    async recommend(file, signal) {
      if (error !== "none") {
        await wait(Math.min(SPEEDS[speed], 2500), signal)
        throw failure(error)
      }
      if (book === "real") {
        if (speed === "hold") await wait(Infinity, signal)
        const started = performance.now()
        const rec = await real.recommend(file, signal)
        if (speed === "slow") await wait(Math.max(0, SPEEDS.slow - (performance.now() - started)), signal)
        return rec
      }
      const [rec] = await Promise.all([FIXTURES[`./fixtures/${book}.json`]!(), wait(SPEEDS[speed], signal)])
      return structuredClone(rec)
    },
  }
}
