import { useEffect, useState } from "react"

export type Box = { x: number; y: number; w: number; h: number }
export const FULL: Box = { x: 0, y: 0, w: 1, h: 1 }

const cache = new Map<string, Box>()

function measure(img: HTMLImageElement): Box {
  const W = 96
  const H = Math.max(1, Math.round((W * img.naturalHeight) / img.naturalWidth))
  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return FULL
  ctx.drawImage(img, 0, 0, W, H)
  const { data } = ctx.getImageData(0, 0, W, H)
  const cols = new Array<number>(W).fill(0)
  const rows = new Array<number>(H).fill(0)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const max = Math.max(data[i], data[i + 1], data[i + 2])
      const min = Math.min(data[i], data[i + 1], data[i + 2])
      if (max - min > 30 && max > 40) {
        cols[x]++
        rows[y]++
      }
    }
  const span = (arr: number[], len: number) => {
    const th = Math.max(2, len * 0.05)
    const a = arr.findIndex((v) => v >= th)
    if (a < 0) return null
    const b = arr.length - 1 - [...arr].reverse().findIndex((v) => v >= th)
    return [a, b + 1] as const
  }
  const sx = span(cols, H)
  const sy = span(rows, W)
  return sx && sy && (sx[1] - sx[0]) * (sy[1] - sy[0]) > W * H * 0.06 ? { x: sx[0] / W, y: sy[0] / H, w: (sx[1] - sx[0]) / W, h: (sy[1] - sy[0]) / H } : FULL
}

/**
 * Roughly where the artwork sits on a page (the box of its colourful pixels), so a template preview
 * can show "the picture" the way a template would place it. The whole page when nothing stands out.
 */
export function useArtBox(src?: string): Box {
  const [box, setBox] = useState<Box>(() => (src ? cache.get(src) ?? FULL : FULL))
  useEffect(() => {
    if (!src) return setBox(FULL)
    const known = cache.get(src)
    if (known) return setBox(known)
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      const found = measure(img)
      cache.set(src, found)
      if (!cancelled) setBox(found)
    }
    img.src = src
    return () => {
      cancelled = true
    }
  }, [src])
  return box
}
