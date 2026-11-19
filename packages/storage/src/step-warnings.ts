import {
  LEGACY_SKIP_MESSAGE,
  StepWarning,
  StoredStepWarnings,
  type StepWarningSource,
  type StepWarningView,
} from "@adt/types"

/**
 * The envelope `step_runs.warnings` holds for one completion (SPEC-0021,
 * §Step warnings), stamped with that completion's `completed_at`. The derived
 * `source-assessment` warning is never persisted: it is computed from the
 * latest assessment on read, so a stored copy could only go stale.
 */
export function stepWarningsEnvelope(completedAt: string, warnings: StepWarning[] = []): StoredStepWarnings {
  return { completedAt, items: warnings.filter((warning) => warning.kind !== "source-assessment") }
}

export interface StepWarningsRead {
  /** The done step's warnings; null when it has none or is not done. */
  warnings: StepWarningView[] | null
  /** Who recorded them; null when the step is not done. */
  warningSource: StepWarningSource | null
}

/**
 * Read a step's warnings. A done step whose envelope carries its own
 * `completed_at` is `recorded`: each element is parsed on its own, and the ones
 * this app cannot parse are counted into one `unrecognized`. Anything else was
 * completed by an app that does not write the column (`legacy`): a stale
 * envelope is never revived, and only the frozen skip message is adapted.
 */
export function readStepWarnings(row: {
  status: string
  completedAt: string | null
  message: string | null
  stored: string | null
}): StepWarningsRead {
  if (row.status !== "done") return { warnings: null, warningSource: null }

  let envelope: unknown
  if (row.stored !== null) {
    try {
      envelope = JSON.parse(row.stored)
    } catch {
      // Ours, but unreadable: never read it as "no warnings".
      return { warnings: [{ kind: "unrecognized", count: 1 }], warningSource: "recorded" }
    }
  }
  const parsed = StoredStepWarnings.safeParse(envelope)
  if (parsed.success && parsed.data.completedAt === row.completedAt) {
    const known: StepWarning[] = []
    let unrecognized = 0
    for (const item of parsed.data.items) {
      const warning = StepWarning.safeParse(item)
      if (warning.success) known.push(warning.data)
      else unrecognized++
    }
    const warnings: StepWarningView[] = unrecognized > 0 ? [...known, { kind: "unrecognized", count: unrecognized }] : known
    return { warnings: warnings.length > 0 ? warnings : null, warningSource: "recorded" }
  }

  const skip = row.message?.match(LEGACY_SKIP_MESSAGE)
  return {
    warnings: skip ? [{ kind: "pages-skipped", count: Number(skip[1]) }] : null,
    warningSource: "legacy",
  }
}

/** The completion columns of a `step_runs` row, as stored. */
export type StoredCompletion = {
  completed_at: string | null
  message: string | null
  warnings: string | null
}

/**
 * The completion an assembled book keeps when a part's done step is merged
 * into a target row (SPEC-0021, §Step warnings). With no earlier completion,
 * or an identical one, the part's columns are copied together, so a recorded
 * part stays recorded. When both are recorded but differ, their stored items
 * are combined under a fresh stamp. When either side reads as legacy, the
 * merged row is legacy: no envelope, and the legacy side's message is kept for
 * the skip adapter. `render` gives the English message for combined warnings.
 */
export function mergeStepCompletion(
  target: StoredCompletion | undefined,
  part: StoredCompletion,
  now: string,
  render: (warnings: StepWarning[]) => string | undefined,
): StoredCompletion {
  if (!target) return part
  const read = (row: StoredCompletion) =>
    readStepWarnings({ status: "done", completedAt: row.completed_at, message: row.message, stored: row.warnings })
  const targetRead = read(target)
  const partRead = read(part)
  if (partRead.warningSource === "legacy") return { completed_at: now, message: part.message, warnings: null }
  if (targetRead.warningSource === "legacy") return { completed_at: now, message: target.message, warnings: null }

  const items = (row: StoredCompletion) => StoredStepWarnings.safeParse(safeJson(row.warnings)).data?.items ?? []
  const combined = [...items(target), ...items(part)]
  if (JSON.stringify(items(target)) === JSON.stringify(items(part))) return part
  const known = combined.flatMap((item) => {
    const warning = StepWarning.safeParse(item)
    return warning.success ? [warning.data] : []
  })
  return {
    completed_at: now,
    message: render(known) ?? null,
    warnings: JSON.stringify({ completedAt: now, items: combined } satisfies StoredStepWarnings),
  }
}

function safeJson(text: string | null): unknown {
  if (text === null) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
