import { useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import type { SetupDecided } from "@adt/types"
import { classifyCreateError, useBookCreation, type CreateFailureKind } from "../../../../core/useBookCreation"
import { useWizardForm } from "../../../../core/wizardForm"
import { applySettings } from "../../../engine/answers"

export type CreateRun = {
  n: number
  name: string
  extract: boolean
  status: "saving" | "extracting" | "done" | "failed"
  label?: string
  warning?: string
  failure?: { kind: CreateFailureKind; detail: string }
}

/**
 * Creating the book from the flow: the settings go into the wizard form, then the book is created
 * (linked to its recommendation by `rec.id`) and its first pages start processing, as on the
 * prototype's Create screen. Every attempt is kept, so the flow can show each one.
 */
export function useCreateRun() {
  const form = useWizardForm()
  const queryClient = useQueryClient()
  const { createBook, willExtract, startExtract, openBook } = useBookCreation()
  const [runs, setRuns] = useState<CreateRun[]>([])
  const busy = useRef(false)
  // Bumped by reset(): a create started for the previous PDF can still finish, but its result no longer lands here.
  const token = useRef(0)

  const start = async (settings: SetupDecided, recId: string) => {
    if (busy.current) return
    busy.current = true
    const mine = token.current
    const update = (n: number, patch: Partial<CreateRun>) => {
      if (token.current === mine) setRuns((rs) => rs.map((r) => (r.n === n ? { ...r, ...patch } : r)))
    }
    applySettings(form, settings)
    const values = form.state.values
    const n = runs.length
    const extract = willExtract(values)
    setRuns((rs) => [...rs, { n, name: values.label.trim(), extract, status: "saving" }])
    let label: string
    try {
      label = (await createBook(values, recId)).label
    } catch (error) {
      const failure = classifyCreateError(error)
      if (failure.kind === "taken") void queryClient.invalidateQueries({ queryKey: ["books"] })
      update(n, { status: "failed", failure })
      if (token.current === mine) busy.current = false
      return
    }
    if (!extract) return update(n, { status: "done", label })
    update(n, { status: "extracting", label })
    try {
      await startExtract(label)
      update(n, { status: "done" })
    } catch (error) {
      update(n, { status: "done", warning: error instanceof Error ? error.message : String(error) })
    }
  }

  const last = runs[runs.length - 1]
  return {
    runs,
    start,
    /** A new PDF: forget the runs for the previous one and unlock its setup. */
    reset: () => {
      token.current += 1
      busy.current = false
      setRuns([])
    },
    /** Creating, or created: the setup above can't change any more. */
    locked: !!last && last.status !== "failed",
    open: (label: string) => openBook(label, form.state.values),
  }
}
