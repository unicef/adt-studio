import { useEffect, useRef, useState } from "react"
import { Trans } from "@lingui/react/macro"
import { FastForward } from "lucide-react"
import { useReducedEffects } from "@/lib/effects"
import { cn } from "@/lib/utils"
import { POP } from "../../../core/ui"
import { Avatar, BackLink, Dots, SEEN_KEY, ShowOptions, useFirstTime, type IntroProps } from "./parts"

const typingTime = (text: string) => Math.min(1700, 450 + text.length * 18)
const QUICK_MS = 90

/**
 * Thread — the performative one. The first time, each message arrives after a typing pause like a
 * real chat. Once it has played (or been skipped) it is marked as seen, and from then on the same
 * messages cascade in at once with the option ready, so returning users aren't made to wait.
 */
export function IntroThread({ copy, onContinue, onBack }: IntroProps) {
  const { first: firstTime, markSeen } = useFirstTime(SEEN_KEY)
  const reduced = useReducedEffects()
  const first = firstTime && !reduced
  const lines = [copy.hello, ...copy.lines]
  const [count, setCount] = useState(first ? 0 : lines.length)
  const [typing, setTyping] = useState(false)
  const timers = useRef<number[]>([])
  const done = count >= lines.length

  const clear = () => {
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current = []
  }

  useEffect(() => {
    if (!first) return
    let at = 500
    lines.forEach((text, i) => {
      timers.current.push(window.setTimeout(() => setTyping(true), at))
      at += typingTime(text)
      timers.current.push(
        window.setTimeout(() => {
          setTyping(false)
          setCount(i + 1)
        }, at),
      )
      at += 320
    })
    return clear
  }, [])

  useEffect(() => {
    if (done) markSeen()
  }, [done])

  const skip = () => {
    clear()
    setTyping(false)
    setCount(lines.length)
  }

  const ctaDelay = first ? 120 : lines.length * QUICK_MS + 120

  return (
    <div className="flex w-full max-w-[640px] flex-col gap-1.5">
      {lines.map((text, i) => {
        const visible = i < count
        const typingHere = typing && i === count
        const last = visible && i === count - 1 && !typing
        return (
          <div key={i} className="relative flex items-end gap-2.5">
            <Avatar hidden={!last && !typingHere} typing={typingHere} />
            <p
              aria-hidden={!visible}
              style={{ animationDelay: first ? undefined : `${i * QUICK_MS}ms` }}
              className={cn("max-w-[520px] origin-bottom-left rounded-[20px] bg-card px-4 py-2.5 text-[16px] leading-snug text-foreground shadow-[0_6px_18px_-10px_rgba(15,23,42,0.3)] ring-1 ring-border", last && "rounded-bl-[6px]", visible ? POP : "invisible")}
            >
              {text}
            </p>
            {typingHere && (
              <span className="absolute bottom-0 left-[46px]">
                <Dots />
              </span>
            )}
          </div>
        )
      })}
      <div className="mt-4 flex justify-end">
        <ShowOptions onClick={onContinue} className={cn("origin-bottom-right", done ? POP : "pointer-events-none invisible")} style={{ animationDelay: `${ctaDelay}ms` }} />
      </div>
      <div className="flex items-center justify-between pt-6">
        <BackLink onClick={onBack} />
        <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground">
          <Trans>ADT Assistant</Trans>
          <button type="button" onClick={skip} aria-hidden={done} tabIndex={done ? -1 : 0} className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 transition-[opacity,background-color,color] duration-200 hover:bg-muted hover:text-foreground", done && "pointer-events-none opacity-0")}>
            <FastForward className="size-3.5" />
            <Trans>Skip</Trans>
          </button>
        </span>
      </div>
    </div>
  )
}
