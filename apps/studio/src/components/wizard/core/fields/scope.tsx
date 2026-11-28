import type { ReactNode } from "react"
import { useStore } from "@tanstack/react-form"
import { Plural, Trans } from "@lingui/react/macro"
import { useWizardForm } from "@/components/wizard/core/wizardForm"

/** The scope a book will be processed with, in words: every page, a range, or split into parts. */
export function useScopeSummary(numPages: number): ReactNode {
  const form = useWizardForm()
  const scope = useStore(form.store, (s) => s.values.scope)
  const start = parseInt(useStore(form.store, (s) => s.values.startPage)) || 1
  const end = parseInt(useStore(form.store, (s) => s.values.endPage)) || numPages
  if (scope === "range" && (start > 1 || end < numPages))
    return start === end ? (
      <Trans>
        Page {start} of {numPages}
      </Trans>
    ) : (
      <Trans>
        Pages {start}–{end} of {numPages}
      </Trans>
    )
  if (scope === "split") return <Plural value={numPages} one="# page, split into parts" other="# pages, split into parts" />
  return <Plural value={numPages} one="# page" other="# pages" />
}

/** What Split into parts does, in the wizard's Scope and the assistant's Pages screen. */
export function SplitExplained() {
  return <Trans>Extraction is skipped now. After the book is created, use the Split & merge panel on its overview to export page-range parts and merge the completed results back.</Trans>
}

/** A text action next to the pages chosen (Use all pages, Split it into parts…). */
export const SCOPE_LINK = "font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4 transition-colors hover:text-brand-800"
