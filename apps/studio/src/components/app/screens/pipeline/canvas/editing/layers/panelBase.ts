let probe: CanvasRenderingContext2D | null = null

function toRgba(color: string): [number, number, number, number] {
  probe ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true })
  if (!probe) return [255, 255, 255, 1]
  probe.clearRect(0, 0, 1, 1)
  probe.fillStyle = color
  probe.fillRect(0, 0, 1, 1)
  const [r = 255, g = 255, b = 255, a = 255] = probe.getImageData(0, 0, 1, 1).data
  return [r, g, b, a / 255]
}

export function opaqueBackground(from: HTMLElement): string {
  const layers: [number, number, number, number][] = []
  let node: HTMLElement | null = from
  while (node) {
    const color = getComputedStyle(node).backgroundColor
    const rgba = toRgba(color)
    if (rgba[3] > 0) layers.push(rgba)
    if (rgba[3] >= 1) break
    node = node.parentElement
  }
  let [r, g, b] = [255, 255, 255]
  for (const [lr, lg, lb, la] of layers.reverse()) {
    r = lr * la + r * (1 - la)
    g = lg * la + g * (1 - la)
    b = lb * la + b * (1 - la)
  }
  return `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`
}
