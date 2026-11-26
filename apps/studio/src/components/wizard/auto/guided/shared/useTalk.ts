import { useLayoutEffect, useState, type RefObject } from "react"
import { motionOff } from "./motion"

const HIGHLIGHT = "gd-say"
/** Characters per second, at least; long messages speed up so none takes longer than MAX_MS. */
const MIN_CPS = 55
const MAX_MS = 1500

type Highlights = { set: (name: string, h: unknown) => void; delete: (name: string) => void }
const highlights = (): Highlights | null => (typeof CSS !== "undefined" && "highlights" in CSS ? (CSS as unknown as { highlights: Highlights }).highlights : null)
const HighlightCtor = (): (new (...ranges: Range[]) => unknown) | null => (typeof window !== "undefined" && "Highlight" in window ? (window as unknown as { Highlight: new (...ranges: Range[]) => unknown }).Highlight : null)

/**
 * The assistant "says" its message: when `key` changes, the words under `ref` appear in reading
 * order, as if typed, while `talking` is true (the orb moves). The DOM isn't touched: the part not
 * yet said is hidden with a CSS highlight (`::highlight(gd-say)`), so React keeps its nodes, and
 * buttons in the message wait until the end (`data-talking`). Everything shows at once with
 * reduced motion, without the Highlight API, or if the message changes while it plays.
 */
export function useTalk(ref: RefObject<HTMLElement | null>, key: string): boolean {
  const [talking, setTalking] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    const hl = highlights()
    const Ctor = HighlightCtor()
    if (!el || !hl || !Ctor || motionOff()) return
    const nodes: Text[] = []
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if ((n as Text).data.trim()) nodes.push(n as Text)
    const total = nodes.reduce((sum, n) => sum + n.data.length, 0)
    if (!total) return
    const cps = Math.max(MIN_CPS, (total * 1000) / MAX_MS)
    const last = nodes[nodes.length - 1]!
    let raf = 0
    let stopped = false
    const start = performance.now()
    const stop = () => {
      if (stopped) return
      stopped = true
      cancelAnimationFrame(raf)
      hl.delete(HIGHLIGHT)
      el.removeAttribute("data-talking")
      observer.disconnect()
      setTalking(false)
    }
    const observer = new MutationObserver(stop)
    observer.observe(el, { childList: true, subtree: true, characterData: true })
    const frame = () => {
      let shown = Math.floor(((performance.now() - start) / 1000) * cps)
      if (shown >= total) return stop()
      let i = 0
      while (i < nodes.length - 1 && shown >= nodes[i]!.data.length) shown -= nodes[i++]!.data.length
      const range = document.createRange()
      range.setStart(nodes[i]!, Math.min(shown, nodes[i]!.data.length))
      range.setEnd(last, last.data.length)
      hl.set(HIGHLIGHT, new Ctor(range))
      raf = requestAnimationFrame(frame)
    }
    el.setAttribute("data-talking", "")
    setTalking(true)
    frame()
    return stop
  }, [key])
  return talking
}
