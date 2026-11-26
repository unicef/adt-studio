import { useRef, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Assistant, useAssistantName } from "./shared/Assistant"
import { AssistantPicker } from "./shared/AssistantPicker"
import { useTalk } from "./shared/useTalk"
import { Morph } from "./Morph"

/**
 * The assistant's one bubble, in a fixed place under the stepper. Its words are replaced as the
 * flow moves on (never a new bubble), so `swap` names what it is saying now; each new message is
 * said in reading order while the orb moves (`useTalk`).
 */
/** `away`: the assistant is elsewhere on the page (the first-run tour), so this bubble keeps its place but isn't shown. */
export function Bubble({ swap, busy, away, children }: { swap: string; busy?: boolean; away?: boolean; children: ReactNode }) {
  const words = useRef<HTMLDivElement>(null)
  const talking = useTalk(words, swap)
  const name = useAssistantName()
  return (
    <div className={cn("flex items-start gap-3 transition-opacity duration-300", away && "invisible opacity-0")} aria-hidden={away || undefined}>
      <span className="lc-avatar mt-0.5 flex" style={away ? undefined : { viewTransitionName: "gd-orb" }}>
        <AssistantPicker>
          <Assistant mood={talking ? "talking" : busy ? "thinking" : "idle"} size={44} />
        </AssistantPicker>
      </span>
      <div className="min-w-0 flex-1">
        <span className="sr-only">
          {name}:
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
