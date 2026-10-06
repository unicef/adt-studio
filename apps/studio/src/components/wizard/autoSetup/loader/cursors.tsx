import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Trans } from "@lingui/react/macro"
import { Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

export type CursorStop = { x: number; y: number }
export type CursorNote = { id: number; text: string }
type Stage = "think" | "stream" | "hold" | "fade" | "collapse"

export const MOVE_MS = 700
const SIZE_MS = 320
const FADE_MS = 160
const EASE = "cubic-bezier(0.32,0.72,0,1)"
const rand = (min: number, max: number) => min + Math.random() * (max - min)

/** x and y ease differently, so the cursor travels on a gentle arc instead of a straight line. */
const ARC = { transition: `left ${MOVE_MS}ms cubic-bezier(0.45, 0, 0.2, 1), top ${MOVE_MS}ms cubic-bezier(0.7, 0, 0.35, 1)` }

/** Drives one comment: thinking → words stream in → lingers → fades → tag shrinks back → done. */
function useComment(note: CursorNote | null, onDone: () => void) {
  const words = useMemo(() => (note?.text ?? "").split(/(?<=\s)/), [note?.text])
  const [stage, setStage] = useState<Stage>("think")
  const [shown, setShown] = useState(0)
  useEffect(() => {
    setStage("think")
    setShown(0)
  }, [note?.id])
  useEffect(() => {
    if (!note) return
    let id = 0
    if (stage === "think") id = window.setTimeout(() => setStage("stream"), rand(450, 750))
    else if (stage === "stream") {
      if (shown >= words.length) setStage("hold")
      else {
        const after = /[,.…—]\s*$/.test(words[shown - 1] ?? "") ? rand(160, 240) : rand(70, 120)
        id = window.setTimeout(() => setShown((n) => n + 1), shown === 0 ? 0 : after)
      }
    } else if (stage === "hold") id = window.setTimeout(() => setStage("fade"), rand(1000, 1400))
    else if (stage === "fade") id = window.setTimeout(() => setStage("collapse"), FADE_MS)
    else id = window.setTimeout(onDone, SIZE_MS + 40)
    return () => window.clearTimeout(id)
  }, [note, stage, shown, words])
  return { stage, words, shown }
}

/** Follows the natural (border-box) size of the content so the bubble can animate between states. */
function useMeasuredSize() {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setSize({ w: el.offsetWidth, h: el.offsetHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el, { box: "border-box" })
    return () => observer.disconnect()
  }, [])
  return { ref, size }
}

/**
 * The AI's cursor: a Figma-style arrow with an "✦ AI" name tag that glides on an arc between spots
 * (one ripple on arrival). At its last spot the tag shows thinking dots, then the comment streams
 * in word by word like a chat reply — each word blurs in and the bubble grows smoothly around it;
 * afterwards the words fade and the tag shrinks back before the cursor moves on.
 * Opens toward the page centre so it never runs off the edge.
 */
export function AiCursor({ stop, note, onNoteDone }: { stop: CursorStop; note: CursorNote | null; onNoteDone: () => void }) {
  const { stage, words, shown } = useComment(note, onNoteDone)
  const { ref, size } = useMeasuredSize()
  const talking = !!note && (stage === "stream" || stage === "hold" || stage === "fade")
  const thinking = !!note && stage === "think"
  const flip = stop.x > 58
  const arrow = cn(flip && "-scale-x-100", talking && (flip ? "rotate-[8deg]" : "-rotate-[8deg]"), thinking && "scale-105")

  return (
    <div aria-hidden className="pointer-events-none absolute z-20 size-0" style={{ ...ARC, left: `${stop.x}%`, top: `${stop.y}%` }}>
      <span key={`${stop.x}-${stop.y}`} className="absolute left-0 top-0 size-9 rounded-full border-2 border-brand-500/70 motion-safe:animate-[am-ripple_0.7s_ease-out_both]" style={{ animationDelay: `${MOVE_MS - 60}ms` }} />
      <svg viewBox="0 0 24 24" className={cn("absolute -top-[2px] size-6 drop-shadow-[0_2px_4px_rgba(15,23,42,0.35)] transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]", flip ? "-right-[3px] origin-top-right" : "-left-[3px] origin-top-left", arrow)}>
        <path d="M3 2l17 8.2-7.4 1.9L9 20z" fill="var(--brand-600)" stroke="white" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>

      <div className={cn("absolute top-5", flip ? "right-4" : "left-4")}>
        <div
          className={cn(
            "relative overflow-hidden bg-brand-600 text-primary-foreground transition-[width,height,border-radius,box-shadow,transform] motion-reduce:transition-none",
            flip ? "origin-top-right" : "origin-top-left",
            talking ? "rounded-[14px] shadow-[0_14px_30px_-10px_rgba(43,127,255,0.65)]" : "rounded-[11px] shadow-[0_6px_16px_-6px_rgba(43,127,255,0.6)]",
            flip ? "rounded-tr-[4px]" : "rounded-tl-[4px]",
            thinking && "scale-[1.04]",
          )}
          style={size ? { width: size.w, height: size.h, transitionDuration: `${SIZE_MS}ms`, transitionTimingFunction: EASE } : undefined}
        >
          <div ref={ref} className={cn("absolute top-0 w-max max-w-[232px] transition-[padding]", flip ? "right-0" : "left-0", talking ? "px-3 pb-2.5 pt-2" : "py-[3px] pl-1.5 pr-2")} style={{ transitionDuration: `${SIZE_MS}ms`, transitionTimingFunction: EASE }}>
            <div className="flex items-center gap-1 whitespace-nowrap text-[11px] font-bold leading-4">
              <Sparkles className={cn("size-3 shrink-0 transition-transform duration-500", (thinking || talking) && "rotate-[20deg]")} />
              <Trans>AI</Trans>
              <span className={cn("flex gap-0.5 overflow-hidden transition-[max-width,margin,opacity] duration-200 ease-out", thinking ? "ml-1 max-w-6 opacity-100" : "ml-0 max-w-0 opacity-0")}>
                {[0, 1, 2].map((i) => (
                  <span key={i} className="size-1 shrink-0 rounded-full bg-primary-foreground motion-safe:animate-[am-dot_1s_ease-in-out_infinite]" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </span>
            </div>
            {talking && (
              <p className={cn("mt-1 max-w-[208px] text-[12.5px] font-medium leading-snug text-primary-foreground/95 transition-[opacity,filter] ease-out", stage === "fade" ? "opacity-0 blur-[2px]" : "opacity-100 blur-0")} style={{ transitionDuration: `${FADE_MS}ms` }}>
                {words.slice(0, shown).map((word, i) => (
                  <span key={i} className="motion-safe:animate-[am-word_0.32s_ease-out_both]">
                    {word}
                  </span>
                ))}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
