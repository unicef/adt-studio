import { parseDocument, DomUtils } from "htmlparser2"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hasClass(node: any, className: string): boolean {
  return (node.attribs?.class ?? "").split(/\s+/).includes(className)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addClass(node: any, className: string): void {
  const classes = new Set((node.attribs?.class ?? "").split(/\s+/).filter(Boolean))
  classes.add(className)
  node.attribs = node.attribs ?? {}
  node.attribs.class = Array.from(classes).join(" ")
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ensureButtonRole(node: any): void {
  const role = node.attribs?.role?.trim().toLowerCase()
  if (!role || role === "region") {
    node.attribs = node.attribs ?? {}
    node.attribs.role = "button"
  }
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function appendSrOnlyText(parent: any, text: string): void {
  const fragment = parseDocument(`<span class="sr-only" data-generated-a11y-label="true">${escapeHtml(text)}</span>`)
  const span = DomUtils.findOne(
    (el) => el.type === "tag" && el.name === "span",
    fragment.children,
    true,
  )
  if (!span) return
  span.parent = parent
  parent.children = parent.children ?? []
  parent.children.push(span)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findReadableText(node: any): string {
  return DomUtils.textContent(node).replace(/\s+/g, " ").trim()
}

function inferTrueFalseLabel(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase()
  if (normalized === "true") return "True"
  if (normalized === "false") return "False"
  if (normalized === "yes") return "Yes"
  if (normalized === "no") return "No"
  return null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeMatchingSection(section: any): void {
  const interactiveNodes = DomUtils.findAll(
    (el) => el.type === "tag" && el.name === "div" && (hasClass(el, "activity-item") || hasClass(el, "dropzone")),
    section.children ?? [],
  )
  for (const node of interactiveNodes) {
    ensureButtonRole(node)
  }

  const dropzoneSlots = DomUtils.findAll(
    (el) => el.type === "tag" && el.name === "div" && typeof el.attribs?.id === "string" && el.attribs.id.startsWith("dropzone-"),
    section.children ?? [],
  )
  for (const slot of dropzoneSlots) {
    const role = slot.attribs?.role?.trim().toLowerCase()
    if (role === "region") {
      delete slot.attribs.role
    }
    addClass(slot, "dropzone-slot")
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeTrueFalseSection(section: any): void {
  const labels = DomUtils.findAll(
    (el) => el.type === "tag" && el.name === "label",
    section.children ?? [],
  )

  for (const label of labels) {
    const radio = DomUtils.findOne(
      (el) => el.type === "tag" && el.name === "input" && el.attribs?.type === "radio",
      label.children ?? [],
      true,
    )
    if (!radio) continue

    const explicitLabel = radio.attribs?.["aria-label"]?.trim()
    if (explicitLabel) {
      delete radio.attribs["aria-label"]
    }

    const existingText = findReadableText(label)
    if (existingText.length > 0) {
      continue
    }

    const fallbackLabel = explicitLabel || inferTrueFalseLabel(radio.attribs?.value)
    if (!fallbackLabel) {
      continue
    }

    const visualContainer = DomUtils.findOne(
      (el) => el.type === "tag" && (el.name === "div" || el.name === "span") && !hasClass(el, "validation-mark"),
      label.children ?? [],
      true,
    )

    appendSrOnlyText(visualContainer ?? label, fallbackLabel)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isTableCell(node: any, tagName: string): boolean {
  return node?.type === "tag" && node.name === tagName
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hasAssociatedLabel(control: any, section: any): boolean {
  const id = control.attribs?.id
  if (typeof id === "string" && id.length > 0) {
    const label = DomUtils.findOne(
      (el) => el.type === "tag" && el.name === "label" && el.attribs?.for === id,
      section.children ?? [],
      true,
    )
    if (label) return true
  }

  let current = control.parent
  while (current) {
    if (current.type === "tag" && current.name === "label") {
      return true
    }
    current = current.parent
  }

  return false
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ensureFillInTableLabels(section: any): void {
  const controls = DomUtils.findAll(
    (el) => el.type === "tag" && (el.name === "input" || el.name === "textarea" || el.name === "select"),
    section.children ?? [],
  )

  let unlabeledIndex = 0
  for (const control of controls) {
    if (control.name === "input") {
      const inputType = (control.attribs?.type ?? "text").toLowerCase()
      if (["hidden", "submit", "button", "image", "reset"].includes(inputType)) {
        continue
      }
    }

    const ariaLabel = control.attribs?.["aria-label"]?.trim()
    const ariaLabelledby = control.attribs?.["aria-labelledby"]?.trim()
    const title = control.attribs?.title?.trim()
    if (ariaLabel || ariaLabelledby || title || hasAssociatedLabel(control, section)) {
      continue
    }

    unlabeledIndex += 1
    control.attribs = control.attribs ?? {}
    control.attribs["aria-label"] = unlabeledIndex === 1 ? "Answer" : `Answer ${unlabeledIndex}`
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeFillInTableSection(section: any): void {
  const tables = DomUtils.findAll(
    (el) => el.type === "tag" && el.name === "table",
    section.children ?? [],
  )

  for (const table of tables) {
    const thead = DomUtils.findOne(
      (el) => el.type === "tag" && el.name === "thead",
      table.children ?? [],
      false,
    )
    const tbody = DomUtils.findOne(
      (el) => el.type === "tag" && el.name === "tbody",
      table.children ?? [],
      false,
    )

    if (thead) {
      const headerCells = DomUtils.findAll(
        (el) => el.type === "tag" && el.name === "th",
        thead.children ?? [],
      )
      headerCells.forEach((cell, index) => {
        const text = findReadableText(cell)
        if (index === 0 && text.length === 0) {
          cell.name = "td"
          delete cell.attribs?.scope
          return
        }
        cell.attribs = cell.attribs ?? {}
        cell.attribs.scope = cell.attribs.scope ?? "col"
      })
    }

    if (tbody) {
      const rows = DomUtils.findAll(
        (el) => el.type === "tag" && el.name === "tr",
        tbody.children ?? [],
      )
      for (const row of rows) {
        const cells = (row.children ?? []).filter((child: any) => child.type === "tag")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const firstCell: any = cells[0]
        if (!firstCell || !isTableCell(firstCell, "td")) {
          continue
        }
        const text = findReadableText(firstCell)
        if (text.length === 0) {
          continue
        }
        firstCell.name = "th"
        firstCell.attribs = firstCell.attribs ?? {}
        firstCell.attribs.scope = firstCell.attribs.scope ?? "row"
      }
    }
  }

  ensureFillInTableLabels(section)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeSectionSemantics(section: any): void {
  const role = section.attribs?.role?.trim().toLowerCase()
  if (role === "article" || role === "activity") {
    delete section.attribs?.role
  }

  if (section.attribs?.["data-section-type"] === "activity_matching") {
    normalizeMatchingSection(section)
  }

  if (section.attribs?.["data-section-type"] === "activity_true_false") {
    normalizeTrueFalseSection(section)
  }

  if (section.attribs?.["data-section-type"] === "activity_fill_in_a_table") {
    normalizeFillInTableSection(section)
  }
}

export function normalizeHtmlSectionSemantics(html: string): string {
  const doc = parseDocument(html)
  const sections = DomUtils.findAll(
    (el) => el.type === "tag" && el.name === "section",
    doc.children,
  )

  for (const section of sections) {
    normalizeSectionSemantics(section)
  }

  return DomUtils.getOuterHTML(doc)
}

export function promoteFirstHeadingToH1(html: string): string {
  if (/<h1\b/i.test(html)) return html
  return html.replace(/<h([2-6])(\b[^>]*)>([\s\S]*?)<\/h\1>/i, '<h1$2>$3</h1>')
}

export function normalizeSectionRoles(html: string): string {
  return normalizeHtmlSectionSemantics(html)
}

export function htmlToXhtml(html: string): string {
  const doc = parseDocument(html)
  let xhtml = DomUtils.getOuterHTML(doc, { xmlMode: true })
  // Replace common HTML named entities not valid in XML
  xhtml = xhtml.replace(/&nbsp;/g, "&#160;")
  xhtml = xhtml.replace(/&mdash;/g, "&#8212;")
  xhtml = xhtml.replace(/&ndash;/g, "&#8211;")
  xhtml = xhtml.replace(/&lsquo;/g, "&#8216;")
  xhtml = xhtml.replace(/&rsquo;/g, "&#8217;")
  xhtml = xhtml.replace(/&ldquo;/g, "&#8220;")
  xhtml = xhtml.replace(/&rdquo;/g, "&#8221;")
  xhtml = xhtml.replace(/&hellip;/g, "&#8230;")
  xhtml = xhtml.replace(/&bull;/g, "&#8226;")
  xhtml = xhtml.replace(/&copy;/g, "&#169;")
  return xhtml
}
