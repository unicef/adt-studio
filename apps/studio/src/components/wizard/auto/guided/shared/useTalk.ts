import { useLayoutEffect, useState, useSyncExternalStore, type RefObject } from "react"
import { motionOff } from "./motion"

/**
 * How the assistant's words come in (a lab setting while we compare them):
 * - type: letter by letter
 * - words: word by word
 * - stream: word by word, the newest words fading in (like an AI answer streaming)
 * - fade: the whole message rises in with a short blur
 * - none: all at once
 */
export const TEXT_MOTIONS = ["type", "words", "stream", "fade", "none"] as const
export type TextMotion = (typeof TEXT_MOTIONS)[number]

const KEY = "add-book:text-motion"
const listeners = new Set<() => void>()
let cache: TextMotion | null = null
function read(): TextMotion {
  if (cache) return cache
  try {
    const v = localStorage.getItem(KEY) as TextMotion | null
    cache = v && TEXT_MOTIONS.includes(v) ? v : "type"
  } catch {
    cache = "type"
  }
  return cache
}
export function setTextMotion(m: TextMotion) {
  cache = m
  try {
    localStorage.setItem(KEY, m)
  } catch {
    /* storage blocked: lasts until reload */
  }
  for (const l of listeners) l()
}
export function useTextMotion(): TextMotion {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    read,
    () => "type",
  )
}

const HIDDEN = "gd-say"
const NEAR = "gd-say-near"
const FAR = "gd-say-far"
/** Characters per second, at least; long messages speed up so none takes longer than MAX_MS. */
const MIN_CPS = 55
const MAX_MS = 1500
/** How long the whole-message fade counts as talking. */
const FADE_MS = 650
/** The trailing fade of "stream", in characters: the newest are faintest. */
const NEAR_CHARS = 10
const FAR_CHARS = 22

type Highlights = { set: (name: string, h: unknown) => void; delete: (name: string) => void }
type HighlightCtor = new (...ranges: Range[]) => unknown
const highlights = (): Highlights | null => (typeof CSS !== "undefined" && "highlights" in CSS ? (CSS as unknown as { highlights: Highlights }).highlights : null)
const Highlight = (): HighlightCtor | null => (typeof window !== "undefined" && "Highlight" in window ? (window as unknown as { Highlight: HighlightCtor }).Highlight : null)

/** A DOM range over text nodes, from character `from` to `to` of their joined text. */
function rangeOf(nodes: Text[], from: number, to: number): Range | null {
  if (to <= from) return null
  const at = (pos: number): [Text, number] => {
    let i = 0
    while (i < nodes.length - 1 && pos > nodes[i]!.data.length) pos -= nodes[i++]!.data.length
    return [nodes[i]!, Math.min(pos, nodes[i]!.data.length)]
  }
  const range = document.createRange()
  range.setStart(...at(from))
  range.setEnd(...at(to))
  return range
}

/**
 * The assistant "says" its message: when `key` changes, the words under `ref` come in, in the
 * chosen way (`useTextMotion`), while `talking` is true (the assistant moves). The DOM isn't
 * touched: what isn't said yet is hidden, and the newest words dimmed, with CSS highlights
 * (`::highlight(gd-say…)`), so React keeps its nodes; buttons in the message wait for the end
 * (`data-talking`). Everything shows at once with reduced motion, without the Highlight API, or
 * if the message changes while it plays.
 */
export function useTalk(ref: RefObject<HTMLElement | null>, key: string): boolean {
  const mode = useTextMotion()
  const [talking, setTalking] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || mode === "none" || motionOff()) return
    if (mode === "fade") {
      el.setAttribute("data-fade", "")
      setTalking(true)
      const id = window.setTimeout(() => {
        el.removeAttribute("data-fade")
        setTalking(false)
      }, FADE_MS)
      return () => {
        window.clearTimeout(id)
        el.removeAttribute("data-fade")
        setTalking(false)
      }
    }
    const hl = highlights()
    const Ctor = Highlight()
    if (!hl || !Ctor) return
    const nodes: Text[] = []
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if ((n as Text).data.trim()) nodes.push(n as Text)
    const text = nodes.map((n) => n.data).join("")
    const total = text.length
    if (!total) return
    // Word ends, for "words" (each step shows up to the end of a word).
    const ends: number[] = []
    for (let i = 1; i <= total; i++) if (i === total || (/\s/.test(text[i]!) && !/\s/.test(text[i - 1]!))) ends.push(i)
    const cps = Math.max(MIN_CPS, (total * 1000) / MAX_MS)
    let raf = 0
    let stopped = false
    const start = performance.now()
    const clear = () => {
      for (const name of [HIDDEN, NEAR, FAR]) hl.delete(name)
    }
    const stop = () => {
      if (stopped) return
      stopped = true
      cancelAnimationFrame(raf)
      clear()
      el.removeAttribute("data-talking")
      observer.disconnect()
      setTalking(false)
    }
    const observer = new MutationObserver(stop)
    observer.observe(el, { childList: true, subtree: true, characterData: true })
    const set = (name: string, from: number, to: number) => {
      const r = rangeOf(nodes, Math.max(0, from), Math.min(total, to))
      if (r) hl.set(name, new Ctor(r))
      else hl.delete(name)
    }
    const frame = () => {
      let shown = Math.floor(((performance.now() - start) / 1000) * cps)
      if (mode === "words") shown = [...ends].reverse().find((e) => e <= shown) ?? 0
      // "stream" runs a little past the end so the last words finish fading in.
      const tail = mode === "stream" ? FAR_CHARS : 0
      if (shown >= total + tail) return stop()
      set(HIDDEN, shown, total)
      if (mode === "stream") {
        set(NEAR, shown - NEAR_CHARS, Math.min(shown, total))
        set(FAR, shown - FAR_CHARS, Math.min(shown - NEAR_CHARS, total))
      }
      raf = requestAnimationFrame(frame)
    }
    el.setAttribute("data-talking", "")
    setTalking(true)
    frame()
    return stop
  }, [key, mode])
  return talking
}
