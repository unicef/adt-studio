export interface EditorPageSize {
  width: number
  height: number
}

const CONTAINER_STYLE = /<div\b[^>]*\bstyle=("([^"]*)"|'([^']*)')/i
const WIDTH = /(?:^|[;\s])width\s*:\s*([0-9.]+)px/i
const HEIGHT = /(?:^|[;\s])height\s*:\s*([0-9.]+)px/i

function dimension(style: string, pattern: RegExp): number | null {
  const match = pattern.exec(style)
  if (!match) return null
  const value = Number.parseFloat(match[1])
  return Number.isFinite(value) && value > 0 ? value : null
}

export function fixedPageSize(html: string): EditorPageSize | null {
  const container = CONTAINER_STYLE.exec(html)
  if (!container) return null
  const style = container[2] ?? container[3] ?? ""
  const width = dimension(style, WIDTH)
  const height = dimension(style, HEIGHT)
  return width && height ? { width, height } : null
}
