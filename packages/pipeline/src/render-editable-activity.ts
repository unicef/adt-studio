/**
 * Packaging support for editable (step-by-step) activities.
 *
 * When a section has an enabled `EditableActivity`, packaging emits a small
 * shell instead of the stored LLM HTML: the structured content (plus the
 * resolved color palette) is embedded as a JSON `<script>` and the adt-runtime
 * stepper component renders the whole experience client-side. The stored
 * `web-rendering` HTML is left untouched so the classic presentation remains
 * one toggle away.
 */
import type { Storage } from "@adt/storage"
import {
  EditableActivity,
  EditableActivitiesEntity,
  EDITABLE_ACTIVITY_NODE,
  BLANK_MARKER_RE,
  type ActivityImage,
  type ActivityText,
} from "@adt/types"
import { type QuizPalette, paletteWithAccent } from "./quiz-palette.js"

/** Attribute value marking a section as stepper-rendered; the classic
 *  activity initializers skip sections carrying it. */
export const STEPPER_VARIANT = "stepper"

export interface EditableActivitiesRow {
  version: number
  activities: Record<string, EditableActivity>
}

export function readEditableActivities(
  storage: Storage,
  pageId: string,
): EditableActivitiesRow | null {
  const row = storage.getLatestNodeData(EDITABLE_ACTIVITY_NODE, pageId)
  if (!row) return null
  const parsed = EditableActivitiesEntity.safeParse(row.data)
  if (!parsed.success) return null
  return { version: row.version, activities: parsed.data.activities }
}

/** The enabled activity for a section, or null (disabled entries keep their
 *  data but render classic HTML).
 *
 *  Entities are keyed by sectionIndex, which can go stale when sections are
 *  added/deleted/merged (nothing migrates this node). The sectionType check
 *  makes a shifted entry inert instead of silently replacing whatever section
 *  now occupies the index. */
export function enabledEditableActivity(
  entity: EditableActivitiesRow | null,
  sectionIndex: number,
  sectionType?: string,
): EditableActivity | null {
  const activity = entity?.activities[String(sectionIndex)]
  if (!activity?.enabled) return null
  if (sectionType !== undefined && activity.sectionType !== sectionType) return null
  return activity
}

/**
 * Remap the sectionIndex-keyed activities map after a section operation
 * (clone/split/merge/delete renumber sections). `mapIndex` returns an entry's
 * new index, or null to drop it — the section was removed, or its content
 * changed enough that the stored extraction no longer applies. Returns null
 * when nothing moved or dropped, so callers can skip writing a new version.
 */
export function remapEditableActivities(
  activities: Record<string, EditableActivity>,
  mapIndex: (index: number) => number | null,
): Record<string, EditableActivity> | null {
  const remapped: Record<string, EditableActivity> = {}
  let changed = false
  for (const [key, activity] of Object.entries(activities)) {
    const index = Number(key)
    const next = Number.isInteger(index) && index >= 0 ? mapIndex(index) : null
    if (next === null) {
      changed = true
      continue
    }
    if (next !== index) changed = true
    remapped[String(next)] = activity
  }
  return changed ? remapped : null
}

export interface ResolveEditableActivityImageOptions {
  /** Curated alt text from image captioning, keyed by imageId. */
  preferredAltMap?: Map<string, string>
  /** Images marked decorative in captioning — hidden from assistive tech. */
  decorativeImageIds?: Set<string>
}

/**
 * Resolve image refs against the book's image map (imageId → filename), the
 * JSON equivalent of `rewriteImageUrls` for HTML sections — including the
 * curated alt-text / decorative handling. Returns the resolved copy plus the
 * image ids packaging must copy into the bundle.
 */
export function resolveEditableActivityImages(
  activity: EditableActivity,
  imageMap: Map<string, string>,
  opts: ResolveEditableActivityImageOptions = {},
): { activity: EditableActivity; referencedImages: string[] } {
  const referenced = new Set<string>()
  const resolveImage = (img: ActivityImage | undefined): ActivityImage | undefined => {
    if (!img) return undefined
    let resolved = img
    if (img.imageId && imageMap.has(img.imageId)) {
      referenced.add(img.imageId)
      resolved = { ...resolved, src: `images/${imageMap.get(img.imageId)}` }
    }
    const imageId = resolved.imageId
    if (imageId) {
      const preferredAlt = opts.preferredAltMap?.get(imageId)
      if (preferredAlt !== undefined) resolved = { ...resolved, alt: preferredAlt }
      if (opts.decorativeImageIds?.has(imageId)) {
        resolved = { ...resolved, alt: "", decorative: true }
      }
    }
    return resolved
  }

  let resolved: EditableActivity
  if (activity.kind === "multiple-choice") {
    resolved = {
      ...activity,
      steps: activity.steps.map((s) => ({
        ...s,
        image: resolveImage(s.image),
        options: s.options.map((o) => ({ ...o, image: resolveImage(o.image) })),
      })),
    }
  } else {
    // fill-in-the-blank / open-ended / underline-text: only a per-step image.
    resolved = {
      ...activity,
      steps: activity.steps.map((s) => ({ ...s, image: resolveImage(s.image) })),
    } as EditableActivity
  }
  return { activity: resolved, referencedImages: [...referenced] }
}

/** Payload embedded in the section shell and consumed by the runtime. */
export interface StepperPayload {
  activity: EditableActivity
  palette: QuizPalette
}

function escapeJsonForScriptTag(json: string): string {
  // JSON syntax never contains "<" outside string literals, so a global
  // replace is safe and prevents "</script>" from terminating the tag.
  return json.replace(/</g, "\\u003c")
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function staticText(t: ActivityText | undefined, tag: string, cls: string): string {
  if (!t?.text) return ""
  const dataId = t.dataId ? ` data-id="${escapeAttr(t.dataId)}"` : ""
  return `<${tag}${dataId} class="${cls}">${escapeHtml(t.text)}</${tag}>`
}

function staticImage(img: ActivityImage | undefined): string {
  if (!img) return ""
  const alt = img.decorative ? "" : (img.alt ?? "")
  const hidden = img.decorative ? ` role="presentation" aria-hidden="true"` : ""
  return `<img src="${escapeAttr(img.src)}" alt="${escapeAttr(alt)}"${hidden} style="max-height:240px;max-width:100%;object-fit:contain;border-radius:8px;margin:0 auto 12px;display:block;" />`
}

const STATIC_BLANK = `<span style="display:inline-block;min-width:6ch;border-bottom:2px solid #64748B;">&#160;</span>`

/**
 * Non-interactive (worksheet-style) rendering of a stepper activity — used by
 * EPUB export, where the runtime bundle is stripped and the interactive shell
 * would otherwise render as a blank page. Keeps `data-id` attributes so EPUB
 * media overlays (read-aloud) still cover the texts.
 */
export function renderEditableActivityStaticHtml(activity: EditableActivity): string {
  const parts: string[] = []
  parts.push(`<section data-section-type="${escapeAttr(activity.sectionType)}" class="section w-full" style="max-width:48rem;margin:0 auto;padding:16px;">`)
  parts.push(staticText(activity.title, "h2", "adt-h2 font-bold"))
  parts.push(staticText(activity.instructions, "p", "adt-caption"))
  if (activity.wordBank?.text?.trim()) {
    const dataId = activity.wordBank.dataId
      ? ` data-id="${escapeAttr(activity.wordBank.dataId)}"`
      : ""
    parts.push(
      `<p${dataId} class="adt-body" style="border:1px solid #94A3B8;border-radius:12px;padding:8px 12px;margin-top:8px;background:#FFF7ED;">${escapeHtml(activity.wordBank.text)}</p>`,
    )
  }
  parts.push(`<ol style="list-style:decimal;padding-left:1.5rem;display:flex;flex-direction:column;gap:24px;margin-top:16px;">`)
  for (const step of activity.steps) {
    parts.push(`<li>`)
    parts.push(staticImage(step.image))
    if (activity.kind === "fill-in-the-blank") {
      const fitb = step as Extract<EditableActivity, { kind: "fill-in-the-blank" }>["steps"][number]
      for (const sentence of fitb.sentences) {
        if (!sentence.text.trim()) continue
        const dataId = sentence.dataId ? ` data-id="${escapeAttr(sentence.dataId)}"` : ""
        const html = escapeHtml(sentence.text).replace(
          new RegExp(BLANK_MARKER_RE.source, "g"),
          STATIC_BLANK,
        )
        parts.push(`<p${dataId} class="adt-body">${html}</p>`)
      }
      // Form-style answer fields (no marker in any sentence) get a writing line.
      const markerIds = new Set(
        fitb.sentences.flatMap((s) => [...s.text.matchAll(BLANK_MARKER_RE)].map((m) => m[1])),
      )
      for (const blank of fitb.blanks) {
        if (!markerIds.has(blank.itemId)) {
          parts.push(`<p class="adt-body">${STATIC_BLANK}</p>`)
        }
      }
    } else if (activity.kind === "multiple-choice") {
      const mc = step as Extract<EditableActivity, { kind: "multiple-choice" }>["steps"][number]
      parts.push(staticText(mc.prompt, "p", "adt-body font-semibold"))
      parts.push(`<ol style="list-style:none;padding-left:0;display:flex;flex-direction:column;gap:8px;margin-top:8px;">`)
      mc.options.forEach((option, i) => {
        // An option may carry both an image and a text label — render both,
        // image first, matching the interactive stepper.
        const content = [
          staticImage(option.image),
          staticText(option.text, "span", "adt-body"),
        ]
          .filter(Boolean)
          .join("")
        parts.push(
          `<li style="border:2px solid #CBD5E1;border-radius:12px;padding:8px 12px;">${i + 1}. ${content}</li>`,
        )
      })
      parts.push(`</ol>`)
    } else if (activity.kind === "open-ended") {
      const oe = step as Extract<EditableActivity, { kind: "open-ended" }>["steps"][number]
      parts.push(staticText(oe.prompt, "p", "adt-body font-semibold"))
      // A ruled writing area to answer on (worksheet-style).
      parts.push(
        `<div style="border:2px solid #CBD5E1;border-radius:12px;min-height:72px;margin-top:8px;"></div>`,
      )
    } else {
      const ul = step as Extract<EditableActivity, { kind: "underline-text" }>["steps"][number]
      parts.push(staticText(ul.prompt, "p", "adt-body font-semibold"))
      // Render the sentence so it can be underlined by hand; keep the source
      // data-id for read-aloud coverage.
      const dataId = ul.dataId ? ` data-id="${escapeAttr(ul.dataId)}"` : ""
      const sentence = ul.tokens.map((tk) => tk.text).join("")
      parts.push(`<p${dataId} class="adt-body">${escapeHtml(sentence)}</p>`)
    }
    parts.push(`</li>`)
  }
  parts.push(`</ol></section>`)
  return parts.filter(Boolean).join("\n")
}

const STEPPER_SHELL_RE =
  /<section[^>]*data-activity-variant="stepper"[\s\S]*?<\/section>/g
const STEPPER_PAYLOAD_RE =
  /<script type="application\/json" data-editable-activity>([\s\S]*?)<\/script>/
const STEPPER_PAYLOAD_SCRIPT_RE =
  /<script type="application\/json" data-editable-activity>[\s\S]*?<\/script>/g
const STEPPER_PAYLOAD_MASK_RE =
  /<script type="application\/json" data-editable-activity data-masked="(\d+)"><\/script>/g

/**
 * Mask stepper JSON payloads while page-level regex passes run over the
 * assembled HTML (contenteditable stripping, the body background-color scan).
 * Only `<` is escaped in the payload, so activity text containing e.g.
 * " contenteditable" would otherwise be mutated inside the JSON. `restore`
 * puts the original scripts back after the transforms.
 */
export function maskStepperPayloads(html: string): {
  masked: string
  restore: (html: string) => string
} {
  const payloads: string[] = []
  const masked = html.replace(STEPPER_PAYLOAD_SCRIPT_RE, (script) => {
    payloads.push(script)
    return `<script type="application/json" data-editable-activity data-masked="${payloads.length - 1}"></script>`
  })
  const restore = (out: string): string =>
    payloads.length === 0
      ? out
      : out.replace(STEPPER_PAYLOAD_MASK_RE, (m, i) => payloads[Number(i)] ?? m)
  return { masked, restore }
}

/**
 * Replace interactive stepper shells in a packaged page with the static
 * rendering above. Pages without shells are returned unchanged.
 */
export function replaceStepperShellsWithStaticHtml(pageHtml: string): string {
  return pageHtml.replace(STEPPER_SHELL_RE, (shell) => {
    const payloadMatch = STEPPER_PAYLOAD_RE.exec(shell)
    if (!payloadMatch) return shell
    try {
      const payload = JSON.parse(payloadMatch[1]) as StepperPayload
      const parsed = EditableActivity.safeParse(payload.activity)
      if (!parsed.success) return shell
      return renderEditableActivityStaticHtml(parsed.data)
    } catch {
      return shell
    }
  })
}

/**
 * Section shell for a stepper activity. Keeps `data-section-type` so the
 * reader recognizes an activity page (dock, submit/skip), and adds
 * `data-activity-variant="stepper"` so the classic initializers stand down.
 */
export function renderEditableActivityHtml(
  activity: EditableActivity,
  opts: { palette: QuizPalette },
): string {
  const palette = activity.theme?.accent
    ? paletteWithAccent(opts.palette, activity.theme.accent)
    : opts.palette
  const payload: StepperPayload = { activity, palette }
  const json = escapeJsonForScriptTag(JSON.stringify(payload))
  return `<section data-section-type="${escapeAttr(activity.sectionType)}" data-activity-variant="${STEPPER_VARIANT}" class="section w-full">
  <script type="application/json" data-editable-activity>${json}</script>
  <div data-stepper-root></div>
</section>`
}
