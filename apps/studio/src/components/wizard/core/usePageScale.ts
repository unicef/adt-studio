import { useLayoutEffect, useState, type RefObject } from "react"

/**
 * How much an Add Book page scales up on a big window: 1 up to the desktop app's default window
 * (1440x920), then with the window (width and height both), up to 1.5. A desktop window is never
 * smaller than 1280x720, where the page stays at 1 and its spacing tightens instead. `ref` is the
 * page's scroller; `vh` is one hundredth of the window's height in the scaled page's units (a vh
 * inside a zoomed page is zoomed too).
 */
export function usePageScale(ref: RefObject<HTMLElement | null>): { scale: number; vh: number } {
  const [size, setSize] = useState({ scale: 1, vh: typeof window === "undefined" ? 9 : window.innerHeight / 100 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      const s = Math.min(el.clientWidth / 1440, el.clientHeight / 920)
      const scale = Math.round(Math.min(1.5, Math.max(1, s)) * 100) / 100
      setSize((now) => {
        const vh = window.innerHeight / scale / 100
        return now.scale === scale && now.vh === vh ? now : { scale, vh }
      })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
}
