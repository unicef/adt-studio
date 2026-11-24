import type { ReactNode } from "react"
import "./expand.css"

/** b8 · Animate to height: auto: opens to the content's real height with `interpolate-size`, no measuring. */
export function AutoHeight({ shown, children }: { shown: boolean; children: ReactNode }) {
  return (
    <div className="ix-auto" data-open={shown} aria-hidden={!shown}>
      {children}
    </div>
  )
}
