// Playground-only example: keep the heading above two containers, with the
// original page content on the left and its first aside on the right. No saves.
export function bookColumnSample(html: string) {
  const template = document.createElement("template")
  template.innerHTML = html
  const aside = template.content.querySelector("aside")
  const parent = aside?.parentElement
  if (!aside || !parent || !/^(DIV|SECTION|ARTICLE|MAIN)$/.test(parent.tagName)) return html
  const row = document.createElement("div")
  row.className = "grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] max-sm:grid-cols-1 gap-6 items-start clear-both w-full"
  const text = document.createElement("div")
  text.className = "min-w-0"
  const sidebar = document.createElement("div")
  sidebar.className = "min-w-0"
  let leading = true
  for (const child of Array.from(parent.childNodes)) {
    if (child === aside) continue
    if (leading && child instanceof HTMLElement && /^(H[1-6]|HEADER)$/.test(child.tagName)) continue
    if (child.textContent?.trim() || child instanceof HTMLElement) leading = false
    text.append(child)
  }
  aside.className = Array.from(aside.classList).filter(value => !/^(?:float-.*|clear-.*|(?:min-|max-)?w-.*|-?m[xlrse]?-.*)$/.test(value.slice(value.lastIndexOf(":") + 1))).concat("w-full", "max-w-full").join(" ")
  for (const property of ["float", "clear", "width", "min-width", "max-width", "margin-inline", "margin-left", "margin-right"]) aside.style.removeProperty(property)
  sidebar.append(aside)
  row.append(text, sidebar)
  parent.append(row)
  return template.innerHTML
}
