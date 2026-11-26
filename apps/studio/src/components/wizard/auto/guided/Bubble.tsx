import { useRef, type ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { Assistant } from "./shared/Assistant"
import { useTalk } from "./shared/useTalk"
import { Morph } from "./Morph"

/**
 * The assistant's one bubble, in a fixed place under the stepper. Its words are replaced as the
 * flow moves on (never a new bubble), so `swap` names what it is saying now; each new message is
 * said in reading order while the orb moves (`useTalk`).
 */
export function Bubble({ swap, busy, children }: { swap: string; busy?: boolean; children: ReactNode }) {
  const words = useRef<HTMLDivElement>(null)
  const talking = useTalk(words, swap)
  return (
    <div className="flex items-start gap-3">
      <span className="lc-avatar mt-0.5 flex" style={{ viewTransitionName: "gd-orb" }}>
        <Assistant mood={talking ? "talking" : busy ? "thinking" : "idle"} size={40} />
      </span>
      <div className="min-w-0 flex-1">
        <span className="sr-only">
          <Trans>ADT Assistant:</Trans>
        </span>
        <Morph swap={swap} name="gd-bubble" className="gd-bubble lc-bubble rounded-tl-[8px]" inner="px-5 py-4 text-[15.5px] leading-[1.55] lg:px-6 lg:py-5 lg:text-[17px]">
          <div ref={words} className="gd-say">
            {children}
          </div>
        </Morph>
      </div>
    </div>
  )
}
