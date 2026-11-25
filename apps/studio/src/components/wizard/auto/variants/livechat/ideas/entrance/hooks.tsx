import { useEffect, useLayoutEffect, useState, type CSSProperties, type RefObject } from "react"
import { useReducedEffects } from "@/lib/effects"
import { flyFrom, takeHandoff, type HandoffKind } from "./handoff"
import "./entrance.css"

/** The message a row belongs to, from the id the thread puts on its wrapper (`msg-<id>`). */
function messageId(el: HTMLElement | null) {
  return el?.closest<HTMLElement>("[id^='msg-']")?.id.slice(4) ?? ""
}

type Veil = { left: number; top: number; width: number; height: number; delay: number }

/**
 * Idea A3 "Words that fade in from blur", for the "what I found" message only. The words are not
 * split in the DOM (React owns those text nodes): each word gets a veil in the bubble's colour that
 * blurs what is under it and fades away, one word after the other (70 ms apart, as on the board,
 * squeezed so a long message still ends within a second).
 */
export function useWordBlur(bubble: RefObject<HTMLElement | null>, on: boolean) {
  const reduced = useReducedEffects()
  const [veils, setVeils] = useState<Veil[]>([])
  const [end, setEnd] = useState(0)

  useLayoutEffect(() => {
    const box = bubble.current
    if (!on || reduced || !box || !messageId(box).startsWith("found-")) return
    const late = Array.from(box.querySelectorAll<HTMLElement>(":scope > div > :not(p)"))
    const frame = box.getBoundingClientRect()
    const ratio = frame.width ? box.offsetWidth / frame.width : 1
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT)
    const found: Omit<Veil, "delay">[] = []
    const range = document.createRange()
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (late.some((el) => el.contains(node))) continue
      for (const m of (node.textContent ?? "").matchAll(/\S+/g)) {
        range.setStart(node, m.index)
        range.setEnd(node, m.index + m[0].length)
        const r = range.getClientRects()[0]
        if (!r || !r.width) continue
        found.push({ left: (r.left - frame.left) * ratio - 2, top: (r.top - frame.top) * ratio - 2, width: r.width * ratio + 4, height: r.height * ratio + 4 })
      }
    }
    if (!found.length) return
    const step = Math.min(70, 800 / found.length)
    setVeils(found.map((v, i) => ({ ...v, delay: 120 + i * step })))
    setEnd(120 + found.length * step)
    const id = window.setTimeout(() => setVeils([]), 120 + found.length * step + 600)
    return () => window.clearTimeout(id)
  }, [])

  const style = end ? ({ "--a3-end": `${end}ms` } as CSSProperties) : undefined
  const layer = veils.map((v, i) => <span key={i} aria-hidden className="lc-a3-veil" style={{ left: v.left, top: v.top, width: v.width, height: v.height, animationDelay: `${v.delay}ms` }} />)
  return { layer, style, active: end > 0 }
}

/**
 * Idea A4 "Gentle and Slam": the "book is ready" card stamps down (CSS); as it lands the whole
 * thread takes the hit and shakes once (the board's a4shake: down, up, still, in a fifth of a second).
 */
export function useSlam(row: RefObject<HTMLElement | null>, on: boolean) {
  const reduced = useReducedEffects()
  useEffect(() => {
    const el = row.current
    if (!on || reduced || !el || !messageId(el).startsWith("done-")) return
    const log = el.closest<HTMLElement>("[role='log']")
    const id = window.setTimeout(() => {
      log?.animate(
        [{ transform: "none" }, { transform: "translateY(4px)" }, { transform: "translateY(-3px)" }, { transform: "translateY(1px)" }, { transform: "none" }],
        { duration: 220, easing: "ease-out" },
      )
    }, 400)
    return () => window.clearTimeout(id)
  }, [])
}

/** Messages that already flew in (idea A2). */
const flown = new Set<string>()

/**
 * Idea A2 "The composer text becomes the bubble": the PDF card flies out of the drop zone, the
 * "Create …" bubble out of the name field, and every other reply out of the composer, instead of
 * popping in on their own.
 */
export function useHandoff(el: RefObject<HTMLElement | null>, on: boolean) {
  const reduced = useReducedEffects()
  useLayoutEffect(() => {
    const node = el.current
    if (!on || reduced || !node) return
    const id = messageId(node)
    // Each message flies once: not again when React runs the effect twice or the row remounts
    // into a folded step (then it just stays put).
    if (flown.has(id)) {
      node.style.animation = "none"
      return
    }
    const kind: HandoffKind = id.startsWith("pdf-") ? "pdf" : id.startsWith("create-") ? "name" : "text"
    const from = takeHandoff(kind)
    if (!from) return
    flown.add(id)
    node.style.animation = "none"
    const target = kind === "pdf" ? ((node.firstElementChild as HTMLElement | null) ?? node) : node
    flyFrom(target, from, kind)
  }, [])
}
