// Independent translate leaves authored transform/rotate/scale and layout intact.
// Values are offsets from the normal layout position, not page coordinates.
export function translationParts(value: string) {
  if (!value || value === "none") return ["0px", "0px"]
  const parts: string[] = []
  let depth = 0, start = 0
  for (let i = 0; i <= value.length; i++) {
    if (value[i] === "(") depth++
    if (value[i] === ")") depth--
    if (i === value.length || (!depth && /\s/.test(value[i]))) {
      if (i > start) parts.push(value.slice(start, i))
      start = i + 1
    }
  }
  if (parts.length > 2 && parts[2] !== "0px") return null
  return [parts[0] || "0px", parts[1] || "0px"]
}

export function readTranslation(element: HTMLElement, value = getComputedStyle(element).translate) {
  const css = getComputedStyle(element)
  const parts = translationParts(value)
  if (!parts) return null
  // Resolve percentages/calc against the untransformed border box. Measuring the
  // selected rect itself would mix in rotation, scaling and ancestor transforms.
  const probe = document.createElement("div")
  // eslint-disable-next-line lingui/no-unlocalized-strings -- CSS declarations for a measurement probe.
  probe.style.cssText = `position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;box-sizing:border-box;width:${element.offsetWidth}px;height:${element.offsetHeight}px;font-size:${css.fontSize}`
  document.body.append(probe)
  const origin = probe.getBoundingClientRect()
  probe.style.translate = parts.join(" ")
  const rect = probe.getBoundingClientRect()
  probe.remove()
  return { x: Math.round((rect.left - origin.left) * 100) / 100, y: Math.round((rect.top - origin.top) * 100) / 100, parts }
}

export function translationMatches(element: HTMLElement, value: string) {
  const actual = readTranslation(element), expected = readTranslation(element, value)
  return !!actual && !!expected && Math.abs(actual.x - expected.x) < 0.1 && Math.abs(actual.y - expected.y) < 0.1
}

export function offsetStyle(original: string | undefined, value: string | null) {
  const style = document.createElement("div").style
  style.cssText = original ?? ""
  if (value === null) style.removeProperty("translate")
  else style.setProperty("translate", value, style.getPropertyPriority("translate"))
  return style.cssText
}

export function addOffset(value: string, delta: number) {
  const rounded = Math.round(delta * 100) / 100
  if (!rounded) return value
  if (/^-?[\d.]+px$/.test(value)) return `${Math.round((parseFloat(value) + rounded) * 100) / 100}px`
  // eslint-disable-next-line lingui/no-unlocalized-strings -- Preserve a responsive CSS length expression.
  return `calc(${value} + ${rounded}px)`
}

// Scale-only ancestors are common in the editor. Rotated/skewed/3D ancestors
// need a full coordinate-space implementation and are deliberately not guessed.
export function ancestorScale(element: HTMLElement) {
  let x = 1, y = 1
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const css = getComputedStyle(parent)
    const matrix = new DOMMatrixReadOnly(css.transform === "none" ? undefined : css.transform)
    if (!matrix.is2D || Math.abs(matrix.b) > 0.00001 || Math.abs(matrix.c) > 0.00001
      || !["none", "0deg"].includes(css.rotate) || css.perspective !== "none") return null
    const scale = css.scale === "none" ? [1, 1] : css.scale.split(/\s+/).map(value => parseFloat(value) / (value.endsWith("%") ? 100 : 1))
    const zoom = parseFloat(css.zoom) || 1
    x *= matrix.a * scale[0] * zoom
    y *= matrix.d * (scale[1] ?? scale[0]) * zoom
  }
  return Number.isFinite(x) && Number.isFinite(y) && x > 0 && y > 0 ? { x, y } : null
}
