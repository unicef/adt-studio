/* eslint-disable lingui/no-unlocalized-strings -- CSS selectors, easings and element ids, never shown */
import { useEffect, useRef } from "react"
import { useReducedEffects } from "@/lib/effects"
import { useIdea } from "../../../chat/ideas"
import { useLiving } from "../../../chat/look"
import type { AmbientPhase } from "./phase"
export { ambientPhase } from "./phase"
import "./ambient.css"

const NAME_INPUT = "wizard-project-name"

/**
 * The "ambient" ideas of Living chat (lab only), drawn behind or around the whole thread:
 * G30 a glow on the window edge while the assistant works, G31 the avatar's mood (CSS keyed off
 * this layer's data-phase), G33 press and shake feedback, G34 a background tint per phase.
 * G32 lives in the bubbles. Renders nothing for "now" or outside Living chat.
 */
export function AmbientLayer({ phase }: { phase: AmbientPhase }) {
  const living = useLiving()
  const idea = useIdea("ambient")
  if (!living || idea === "now" || idea === "g32") return null
  return (
    <div aria-hidden className="lc-amb pointer-events-none absolute inset-0" data-idea={idea} data-phase={phase}>
      {idea === "g30" && (
        <>
          <span className="lc-g30 lc-g30-soft" />
          <span className="lc-g30" />
        </>
      )}
      {idea === "g34" && (
        <>
          <span className="lc-g34" data-tint="blue" />
          <span className="lc-g34" data-tint="amber" />
          <span className="lc-g34" data-tint="green" />
          <span className="lc-g34" data-tint="rose" />
        </>
      )}
      {idea === "g33" && <PressFeedback />}
    </div>
  )
}

/**
 * G33 "Haptic-like feedback without sound": every button in the thread sinks a little while held
 * and springs back on release; Create with a missing or bad name shakes the field once (the check
 * for a good name is CSS).
 */
function PressFeedback() {
  const marker = useRef<HTMLSpanElement>(null)
  const reduced = useReducedEffects()
  useEffect(() => {
    const root = marker.current?.parentElement?.parentElement
    if (!root || reduced) return
    let held: { el: HTMLElement; anim: Animation } | null = null
    const down = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("button:not(:disabled)")
      if (!el || !root.contains(el)) return
      held = { el, anim: el.animate([{ scale: "1" }, { scale: "0.95" }], { duration: 110, easing: "ease-out", fill: "forwards" }) }
    }
    const up = () => {
      if (!held) return
      const { el, anim } = held
      held = null
      anim.cancel()
      el.animate([{ scale: "0.95" }, { scale: "1.03" }, { scale: "1" }], { duration: 300, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" })
    }
    let shakeTimer = 0
    const click = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest("button")
      if (!el || !el.closest("[id^='msg-ready-']")) return
      window.clearTimeout(shakeTimer)
      shakeTimer = window.setTimeout(() => {
        const input = document.getElementById(NAME_INPUT) as HTMLInputElement | null
        if (!input || (input.value.trim() && input.getAttribute("aria-invalid") !== "true")) return
        input.animate(
          [{ transform: "none" }, { transform: "translateX(-7px)" }, { transform: "translateX(6px)" }, { transform: "translateX(-4px)" }, { transform: "translateX(2px)" }, { transform: "none" }],
          { duration: 420, easing: "ease-out" },
        )
      }, 60)
    }
    root.addEventListener("pointerdown", down)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", up)
    root.addEventListener("click", click, true)
    return () => {
      window.clearTimeout(shakeTimer)
      root.removeEventListener("pointerdown", down)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", up)
      root.removeEventListener("click", click, true)
    }
  }, [reduced])
  return <span ref={marker} className="hidden" />
}
