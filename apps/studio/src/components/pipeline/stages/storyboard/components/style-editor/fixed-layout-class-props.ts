export const INHERITABLE_STYLE_PROPS: ReadonlySet<string> = new Set([
  "font-size",
  "color",
  "font-family",
  "font-weight",
  "letter-spacing",
  "font-style",
])

function hasVariantPrefix(cls: string): boolean {
  const colon = cls.indexOf(":")
  if (colon === -1) return false
  const bracket = cls.indexOf("[")
  return bracket === -1 || colon < bracket
}

function inheritablePropForClass(cls: string): string | null {
  if (hasVariantPrefix(cls)) return null
  if (/^text-(left|center|right|justify|start|end)$/.test(cls)) return null
  if (/^text-(xs|sm|base|lg|xl|\dxl)$/.test(cls)) return "font-size"
  if (/^text-\[[\d.]+(px|rem|em|%)\]$/.test(cls)) return "font-size"
  if (/^text-/.test(cls)) return "color"
  if (/^font-(sans|serif|mono)$/.test(cls) || /^font-\[/.test(cls)) return "font-family"
  if (/^font-/.test(cls)) return "font-weight"
  if (/^tracking-/.test(cls)) return "letter-spacing"
  if (/^(italic|not-italic)$/.test(cls)) return "font-style"
  return null
}

export function inheritablePropsForClasses(classes: string[]): string[] {
  const props = new Set<string>()
  for (const cls of classes) {
    const prop = inheritablePropForClass(cls)
    if (prop) props.add(prop)
  }
  return Array.from(props)
}

export function stripInheritableClasses(classes: string[], props: string[]): string[] {
  const targeted = new Set(props)
  return classes.filter((cls) => {
    const prop = inheritablePropForClass(cls)
    return prop === null || !targeted.has(prop)
  })
}
