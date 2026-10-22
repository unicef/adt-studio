export function declarations(value = "") {
  const style = document.createElement("div").style
  style.cssText = value
  return Object.fromEntries(Array.from(style).map(property => [property,
    // eslint-disable-next-line lingui/no-unlocalized-strings -- Literal CSS priority syntax.
    `${style.getPropertyValue(property)}${style.getPropertyPriority(property) ? " !important" : ""}`]))
}
