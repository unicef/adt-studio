export interface Linear {
  (value: number): number
  invert(position: number): number
}

export function linear([d0, d1]: [number, number], [r0, r1]: [number, number]): Linear {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0)
  const scale = ((value: number) => r0 + (value - d0) * k) as Linear
  scale.invert = (position: number) => (k === 0 ? d0 : d0 + (position - r0) / k)
  return scale
}

export function ticks(max: number, target: number): number[] {
  if (max <= 0) return [0]
  const raw = max / Math.max(1, target)
  const power = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? 10 * power
  const out: number[] = []
  for (let v = 0; v <= max + step * 1e-9; v += step) out.push(Math.round(v * 1e9) / 1e9)
  return out
}

const MINUTE_STEPS = [60, 120, 180, 300, 600, 900, 1800, 3600, 7200]

export function minuteTicks(maxSeconds: number, maxCount: number): number[] {
  const step = MINUTE_STEPS.find((s) => maxSeconds / s <= maxCount) ?? MINUTE_STEPS[MINUTE_STEPS.length - 1]
  const out: number[] = []
  for (let v = 0; v <= maxSeconds; v += step) out.push(v)
  return out
}

let canvas: HTMLCanvasElement | null = null

export function textWidth(texts: string[], font = "12px system-ui, -apple-system, 'Segoe UI', sans-serif"): number {
  canvas ??= document.createElement("canvas")
  const context = canvas.getContext("2d")
  if (!context) return Math.max(0, ...texts.map((t) => t.length * 7))
  context.font = font
  return Math.ceil(Math.max(0, ...texts.map((t) => context.measureText(t).width)))
}
