import { prefersReducedMotion } from "@/lib/utils"

const running = new WeakMap<HTMLElement, number>()

const easeOut = (progress: number) => 1 - Math.pow(1 - progress, 3)

export function tweenScroll(element: HTMLElement, target: { left: number; top: number }, duration = 300) {
  const previous = running.get(element)
  if (previous !== undefined) cancelAnimationFrame(previous)
  const maxLeft = Math.max(0, element.scrollWidth - element.clientWidth)
  const maxTop = Math.max(0, element.scrollHeight - element.clientHeight)
  const left = Math.min(Math.max(0, target.left), maxLeft)
  const top = Math.min(Math.max(0, target.top), maxTop)
  const fromLeft = element.scrollLeft
  const fromTop = element.scrollTop
  if (Math.abs(left - fromLeft) < 1 && Math.abs(top - fromTop) < 1) return
  if (prefersReducedMotion()) {
    element.scrollLeft = left
    element.scrollTop = top
    return
  }
  const start = performance.now()
  const step = (now: number) => {
    const progress = Math.min(1, (now - start) / duration)
    const eased = easeOut(progress)
    element.scrollLeft = fromLeft + (left - fromLeft) * eased
    element.scrollTop = fromTop + (top - fromTop) * eased
    if (progress < 1) running.set(element, requestAnimationFrame(step))
    else running.delete(element)
  }
  running.set(element, requestAnimationFrame(step))
}
