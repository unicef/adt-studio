import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { PRESETS } from "@/components/wizard/constants"

export type StrategyId = "fixed_layout" | "llm" | "llm-overlay" | "two_column_story" | "single_column"
export type Option = { value: string; title: ReactNode; tagline: ReactNode; does: ReactNode; pros: ReactNode[]; cons: ReactNode[]; bestFor: ReactNode }
export type Question = { candidates: string[]; options: Option[] }

/** What each render strategy means in plain words, mirroring what it really does in the pipeline (see DECISIONS.md). */
export const STRATEGY_OPTIONS: Record<StrategyId, Option> = {
  fixed_layout: {
    value: "fixed_layout",
    title: <Trans>Fixed Layout</Trans>,
    tagline: <Trans>Keeps the original page</Trans>,
    does: <Trans>Text and pictures stay exactly where they are in the printed book. The text is still real text, so it can be read aloud and translated.</Trans>,
    pros: [<Trans key="1">Looks just like the printed book</Trans>, <Trans key="2">Read-aloud highlights word by word</Trans>, <Trans key="3">Quick to create</Trans>],
    cons: [<Trans key="1">Doesn&apos;t adapt to phones — the page just gets smaller</Trans>, <Trans key="2">No interactive activities inside the pages</Trans>, <Trans key="3">Longer translations are shrunk to fit</Trans>],
    bestFor: <Trans>Picture books and comics where the art matters</Trans>,
  },
  "llm-overlay": {
    value: "llm-overlay",
    title: <Trans>Text over the artwork</Trans>,
    tagline: <Trans>Art stays, text becomes easy to read</Trans>,
    does: <Trans>The illustration stays as the background and the text is placed on top in easy-to-read boxes. On phones, the picture goes on top and the text below.</Trans>,
    pros: [<Trans key="1">Keeps the feel of the artwork</Trans>, <Trans key="2">Works on phones too</Trans>, <Trans key="3">Text is easier to read than on the print</Trans>],
    cons: [<Trans key="1">Takes longer to create</Trans>, <Trans key="2">Long translations can overflow their boxes</Trans>, <Trans key="3">Not for pages full of text</Trans>],
    bestFor: <Trans>Illustrated books with text printed on the pictures</Trans>,
  },
  llm: {
    value: "llm",
    title: <Trans>Designed for any screen</Trans>,
    tagline: <Trans>A fresh layout for every screen</Trans>,
    does: <Trans>Each page is redesigned as a clean web page that rearranges itself to fit phones, tablets and computers.</Trans>,
    pros: [<Trans key="1">Best to read on phones and tablets</Trans>, <Trans key="2">Clear headings — best for screen readers</Trans>, <Trans key="3">Supports interactive activities</Trans>],
    cons: [<Trans key="1">Takes the longest to create</Trans>, <Trans key="2">Loses the original look of the page</Trans>, <Trans key="3">Layout can vary a little from page to page</Trans>],
    bestFor: <Trans>Textbooks and books with activities</Trans>,
  },
  two_column_story: {
    value: "two_column_story",
    title: <Trans>Two Columns Story</Trans>,
    tagline: <Trans>Picture beside the text</Trans>,
    does: <Trans>A simple, tidy layout: the picture on one side and the text on the other. On phones, the picture goes on top.</Trans>,
    pros: [<Trans key="1">Quick to create</Trans>, <Trans key="2">Clean and consistent on every page</Trans>, <Trans key="3">Text printed on the art is moved next to it</Trans>],
    cons: [<Trans key="1">Every page gets the same layout</Trans>, <Trans key="2">Pictures across two pages can get split</Trans>, <Trans key="3">Not for busy or text-heavy pages</Trans>],
    bestFor: <Trans>Picture books with short text</Trans>,
  },
  single_column: {
    value: "single_column",
    title: <Trans>Single Column</Trans>,
    tagline: <Trans>Clean text, top to bottom</Trans>,
    does: <Trans>Everything flows in one column, like an article: text first, pictures in between.</Trans>,
    pros: [<Trans key="1">Quick to create</Trans>, <Trans key="2">Great for long text and tables</Trans>, <Trans key="3">Works on any screen</Trans>],
    cons: [<Trans key="1">Plain look</Trans>, <Trans key="2">Pictures aren&apos;t arranged around the text</Trans>, <Trans key="3">Not for picture books</Trans>],
    bestFor: <Trans>Manuals, guides and reference books</Trans>,
  },
}

/**
 * The look question the AI leaves open when it isn't sure: its two candidates first (the first is
 * preselected), then the preset's other allowed strategies, recommended ones first.
 */
export function useLookQuestion(kind: "picture" | "textbook"): Question {
  const preset = PRESETS.find((p) => p.id === (kind === "textbook" ? "textbook" : "storybook"))
  const allowed = (preset?.renderStrategies ?? []).filter((id): id is StrategyId => id in STRATEGY_OPTIONS)
  const recommended = (preset?.recommendedStrategies ?? []) as readonly string[]
  const candidates: StrategyId[] = kind === "textbook" ? ["llm", "llm-overlay"] : ["fixed_layout", "llm-overlay"]
  const others = allowed.filter((id) => !candidates.includes(id)).sort((a, b) => Number(recommended.includes(b)) - Number(recommended.includes(a)))
  return { candidates, options: [...candidates, ...others].map((id) => STRATEGY_OPTIONS[id]) }
}
