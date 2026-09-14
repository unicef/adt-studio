import { useEffect, useRef, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { Check, Copy } from "lucide-react"
import { cn } from "@/lib/utils"
import { FAKE_SHARE_URL } from "./share-url"

/**
 * The thing the whole step exists to produce.
 *
 * Three properties are load-bearing and none of them are decoration. It is **real DOM text**, not
 * artwork, so it is selectable and a screen reader can read it — a revealed link you cannot copy is
 * not a payoff. It carries the **Copy affordance inside it**, so the last thing to appear anywhere
 * on screen is a cursor target rather than a tick. And its box is **the same box in every phase**:
 * the plate that emerges empty during Opening is this component with its contents at zero opacity,
 * not a placeholder that later cross-fades into a differently-sized row. Cross-fading a takeover
 * plate into a dashboard row is what breaks the illusion of one persistent object.
 *
 * Icon-only Copy, not a labelled button, for two reasons: the row is 96px wide at the smallest slot
 * and a label would take the link's space, and the rubric forbids text inside the artwork in any of
 * the five locales. The accessible name is still translated.
 */
export function LinkRow({
  revealed,
  url = null,
  className,
}: {
  /** Drives the accessibility tree only; the visual state comes from `data-reg-phase` in CSS. */
  revealed: boolean
  /** A real run's link. When present, Copy is real. Absent on the bench. */
  url?: string | null
  className?: string
}) {
  const { t } = useLingui()
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  return (
    <div className={cn("pubreg-plate", className)} aria-hidden={revealed ? undefined : true}>
      <code className="pubreg-url">{url ?? FAKE_SHARE_URL}</code>
      <button
        type="button"
        tabIndex={revealed ? 0 : -1}
        aria-label={t`Copy link`}
        className="pubreg-copy"
        onClick={() => {
          /* With a real URL this is the payoff and Copy must be real. Without one this is the
             bench's fabricated URL on a twelve-second loop, and silently overwriting the
             reviewer's clipboard would be hostile — the state swap is what is under review. */
          if (url) void navigator.clipboard?.writeText(url)
          setCopied(true)
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(() => setCopied(false), 1400)
        }}
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </button>
    </div>
  )
}
