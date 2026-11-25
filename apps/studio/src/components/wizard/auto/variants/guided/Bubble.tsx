import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { Orb } from "../chat/bubbles"
import { Morph } from "./Morph"

/**
 * The assistant's one bubble, in a fixed place under the stepper. Its words are replaced as the
 * flow moves on (never a new bubble), so `swap` names what it is saying now.
 */
export function Bubble({ swap, busy, children }: { swap: string; busy?: boolean; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="lc-avatar mt-1 flex">
        <Orb typing={busy} size={32} />
      </span>
      <div className="min-w-0 flex-1">
        <span className="sr-only">
          <Trans>ADT Assistant:</Trans>
        </span>
        <Morph swap={swap} className="gd-bubble lc-bubble rounded-tl-[8px]" inner="px-5 py-4 text-[15.5px] leading-[1.55]">
          {children}
        </Morph>
      </div>
    </div>
  )
}
