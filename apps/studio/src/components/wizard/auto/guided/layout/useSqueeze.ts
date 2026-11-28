import { useLayoutEffect, type RefObject } from "react"
import { WIDE } from "./useWide"

// eslint-disable-next-line lingui/no-unlocalized-strings -- a CSS variable
const SQUEEZE = "--gd-squeeze"
// eslint-disable-next-line lingui/no-unlocalized-strings -- an attribute name
const TIGHT = "data-gd-tight"

/**
 * Keeps a step from scrolling on a regular (laptop or bigger) window: when the page is taller than
 * the window, its pictures give up the difference (--gd-squeeze, in page units), down to each one's
 * smallest size. Measured from no squeeze every time, so a shorter step gets its pictures back.
 */
export function useSqueeze(scroller: RefObject<HTMLElement | null>, page: RefObject<HTMLElement | null>, scale: number) {
  useLayoutEffect(() => {
    const sc = scroller.current
    const el = page.current
    if (!sc || !el) return
    const now = () => parseFloat(el.style.getPropertyValue(SQUEEZE)) || 0
    const set = (v: number) => {
      if (el.style.getPropertyValue(SQUEEZE) !== `${v}px`) el.style.setProperty(SQUEEZE, `${v}px`)
    }
    const fits = () => sc.scrollHeight - sc.clientHeight <= 0
    /** The least squeeze that fits; false when even the smallest pictures don't. */
    const search = (): boolean => {
      let q = 0
      set(0)
      for (let i = 0; i < 3 && !fits(); i++) {
        q = Math.min(400, q + (sc.scrollHeight - sc.clientHeight) / scale)
        set(Math.ceil(q))
      }
      if (q === 0) return true
      if (!fits()) return false
      // Several pictures may give up the same squeeze, so it can overshoot: find the least that fits.
      let lo = 0
      let hi = Math.ceil(q)
      while (hi - lo > 4) {
        const mid = Math.round((lo + hi) / 2)
        set(mid)
        if (fits()) hi = mid
        else lo = mid
      }
      set(hi)
      return true
    }
    const fit = () => {
      // A phone scrolls anyway: its pictures keep their size.
      if (!window.matchMedia(WIDE).matches) return set(0)
      // Still fits with little room to spare: keep the pictures as they are, so a change on the
      // page (a new language, a pick) never nudges everything by a few pixels.
      const slack = sc.clientHeight - el.getBoundingClientRect().height
      if (slack >= 0 && (slack < 24 || now() === 0)) return
      // Pictures first; when that isn't enough (a long pick's words), the extra lines that are also
      // in each card's hover and in Explain the options give way too (guided.css, .gd-optional).
      el.removeAttribute(TIGHT)
      if (!search()) {
        el.setAttribute(TIGHT, "")
        search()
      }
    }
    // Sizes change on every frame while something grows or shrinks (a panel morphing): an overflow
    // is fixed on the next frame (outside the observer's callback, so the squeeze resizing the
    // observed children never loops it), anything else waits until it settles.
    let timer = 0
    let frame = 0
    const onResize = () => {
      window.clearTimeout(timer)
      if (sc.scrollHeight - sc.clientHeight > 0) {
        if (!frame)
          frame = requestAnimationFrame(() => {
            frame = 0
            fit()
          })
      } else timer = window.setTimeout(fit, 160)
    }
    fit()
    const ro = new ResizeObserver(onResize)
    ro.observe(sc)
    for (const child of el.children) ro.observe(child)
    return () => {
      ro.disconnect()
      window.clearTimeout(timer)
      cancelAnimationFrame(frame)
    }
  }, [scroller, page, scale])
}
