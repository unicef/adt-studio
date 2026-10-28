import { useEffect, useState } from "react"
import type { PublishChecklistState } from "@/hooks/use-book-publication"
import type { RegisterPhase } from "./register/phase-clock"

/** The first 160ms of Opening, kept as its own beat. See `phase-clock.ts`. */
const ANTICIPATE_MS = 160
const OPENING_MS = 760

/**
 * The register artwork's phase, derived from a real run — the production seam `phase-clock.ts`
 * promises: "`phase` is derived from `stepStates[3]` and `run.status`; nothing else about the
 * components changes."
 *
 * The mapping honours the step's defining property, that it is nominally ~2s and genuinely
 * unbounded. Entering the step starts Opening's two timed beats; Holding then sits for as long as
 * the Worker takes; `done` lands whenever it lands and is allowed to interrupt Opening mid-gesture,
 * exactly like the bench's warm-Worker pass. A failure parks the artwork wherever it stood — a
 * failure subtracts nothing that already happened.
 */
export function useRegisterPhase(
  state: PublishChecklistState | undefined,
  runStatus: string,
): RegisterPhase {
  const [phase, setPhase] = useState<RegisterPhase>("pre")

  useEffect(() => {
    if (runStatus === "done" || state === "done") {
      setPhase("arrived")
      return
    }
    if (state === "running") {
      setPhase("anticipate")
      const opening = setTimeout(() => setPhase("opening"), ANTICIPATE_MS)
      const holding = setTimeout(() => setPhase("holding"), ANTICIPATE_MS + OPENING_MS)
      return () => {
        clearTimeout(opening)
        clearTimeout(holding)
      }
    }
    /* An error freezes the picture where it stood; anything else is the resting state. */
    if (state !== "error") setPhase("pre")
  }, [state, runStatus])

  return phase
}
