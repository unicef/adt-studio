import { useEffect, useState } from "react"
import { colourfulness } from "./strategies"

const joinedCache = new Map<string, string>()

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/** Draws two facing pages as one open spread, with a soft gutter shadow down the middle. */
async function joinSpread(left: string, right: string): Promise<string> {
  const key = `${left.length}:${left.slice(-40)}|${right.length}:${right.slice(-40)}`
  const hit = joinedCache.get(key)
  if (hit) return hit
  const [a, b] = await Promise.all([load(left), load(right)])
  const h = Math.max(a.naturalHeight, b.naturalHeight)
  const canvas = document.createElement("canvas")
  canvas.width = a.naturalWidth + b.naturalWidth
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) return left
  ctx.fillStyle = "#fff"
  ctx.fillRect(0, 0, canvas.width, h)
  ctx.drawImage(a, 0, 0)
  ctx.drawImage(b, a.naturalWidth, 0)
  const mid = a.naturalWidth
  const band = Math.round(canvas.width * 0.03)
  const g = ctx.createLinearGradient(mid - band, 0, mid + band, 0)
  g.addColorStop(0, "rgba(15,23,42,0)")
  g.addColorStop(0.5, "rgba(15,23,42,0.16)")
  g.addColorStop(1, "rgba(15,23,42,0)")
  ctx.fillStyle = g
  ctx.fillRect(mid - band, 0, band * 2, h)
  const url = canvas.toDataURL("image/jpeg", 0.9)
  canvas.width = 0
  joinedCache.set(key, url)
  return url
}

/**
 * The book's own page for "Shown with your own page" previews, respecting the page grouping. It
 * takes the most illustrated loaded page; for a book grouped as spreads it joins that page with its
 * facing page (page 1 is the cover, then 2–3, 4–5, …) into one open-spread image, so every preview —
 * Fixed Layout, templates and thumbnails — shows the two pages together as the reader will.
 */
export function useOwnPage(pages: Record<number, string>, spread: boolean): { src?: string; spread: boolean } {
  const nums = Object.keys(pages).map(Number).sort((x, y) => x - y)
  const [best, setBest] = useState<number>()
  useEffect(() => {
    let cancelled = false
    if (!nums.length) return
    Promise.all(nums.map((n) => colourfulness(pages[n]))).then((scores) => {
      if (cancelled) return
      let i = 0
      scores.forEach((v, k) => (v > scores[i] + 0.02 ? (i = k) : null))
      setBest(nums[i])
    })
    return () => {
      cancelled = true
    }
  }, [nums.join(",")])

  const n = best ?? nums[0]
  const pair = n === undefined ? [] : n % 2 === 0 ? [n, n + 1] : [n - 1, n]
  const left = pages[pair[0]]
  const right = pages[pair[1]]
  const canJoin = spread && !!left && !!right
  const [joined, setJoined] = useState<string>()
  useEffect(() => {
    if (!canJoin) return
    let cancelled = false
    joinSpread(left, right)
      .then((url) => {
        if (!cancelled) setJoined(url)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [canJoin, left, right])

  if (canJoin) return { src: joined, spread: true }
  return { src: n === undefined ? undefined : pages[n], spread: false }
}
