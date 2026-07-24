/**
 * Form-style editor for classic (LLM-rendered) activities — the counterpart
 * of EditableActivityPanel for sections that haven't been converted to
 * step-by-step. The HTML layout is free-form, but its content is addressable:
 * every text carries a `data-id` matching a section-tree leaf, and the answer
 * key lives in `activityAnswers`.
 *
 * Organization comes from the server-computed `ActivityOutline` (section-tree
 * roles + rendered answer fields): title/badges/instructions pinned at the
 * top, then one card per item grouping its number, prompt sentences, images,
 * and answer controls — for every activity type, including open-ended,
 * true/false, multi-select, and tables. FITB/MC sections that also have an
 * extracted `EditableActivity` structure use its richer cards instead (blank
 * markers, answer alternatives).
 *
 * The outline/structure are only grouping indexes: every edit still flows
 * through the deterministic channels (text by data-id into the rendered HTML,
 * answers by item-id), so nothing depends on the free-form layout. Sections
 * with neither fall back to flat lists.
 *
 * Grouped sentence fields bind to the RENDERED text (which includes
 * [[blank:item-N]] markers) — editing through the tree text would silently
 * strip the markers and break the blanks.
 */
import { useEffect, useMemo, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { Check, ImageIcon, Sparkles, TextCursorInput, X } from "lucide-react"
import type {
  ActivityOutline,
  ActivityOutlineItem,
  ActivityOutlineText,
  ActivityText,
  ContentNodeData,
  EditableActivity,
  FitbStep,
  McStep,
} from "@adt/types"
import { BASE_URL } from "@/api/client"
import { Input } from "@/components/ui/input"
import { getSectionTypeLabel } from "@/lib/section-constants"

interface ClassicActivityPanelProps {
  open: boolean
  onClose: () => void
  bookLabel: string
  /** Unpruned leaf nodes of the section tree (texts + images). */
  leaves: ContentNodeData[]
  /** The activity's answer key (item-id → expected value). */
  answers: Record<string, string | boolean | number> | undefined
  /** Read-only extraction result — richer per-item cards for FITB/MC
   *  (nullable: unsupported or unparseable sections use the outline). */
  structure: EditableActivity | null
  /** Type-agnostic grouping of the page: header + item groups. */
  outline: ActivityOutline | null
  /** Current section type + the selectable activity types (key → label). */
  sectionType: string | undefined
  activityTypes: Record<string, string> | undefined
  onChangeType: (type: string) => void
  onRegenerate: () => void
  canRegenerate: boolean
  onTextEdited: (dataId: string, text: string) => void
  onAnswerEdited: (itemId: string, value: string) => void
  /** Atomic multi-key answer update (radio-group correct flips). */
  onAnswersEdited: (patch: Record<string, string | boolean>) => void
  dirty: boolean
  saving: boolean
  onSave: () => void
  onDiscard: () => void
}

/** dataId → rendered text for every text the structure references. */
function collectStructureTexts(activity: EditableActivity | null): Map<string, string> {
  const map = new Map<string, string>()
  if (!activity) return map
  const add = (t: ActivityText | undefined) => {
    if (t?.dataId) map.set(t.dataId, t.text)
  }
  add(activity.title)
  add(activity.instructions)
  if (activity.kind === "fill-in-the-blank") {
    for (const step of activity.steps) {
      for (const s of step.sentences) if (s.dataId) map.set(s.dataId, s.text)
    }
  } else {
    for (const step of activity.steps) {
      add(step.prompt)
      for (const o of step.options) add(o.text)
    }
  }
  return map
}

function collectStructureImageIds(activity: EditableActivity | null): Set<string> {
  const ids = new Set<string>()
  if (!activity) return ids
  for (const step of activity.steps) {
    if (step.image?.imageId) ids.add(step.image.imageId)
    if (activity.kind === "multiple-choice") {
      for (const o of (step as McStep).options) {
        if (o.image?.imageId) ids.add(o.image.imageId)
      }
    }
  }
  return ids
}

/** dataId → rendered text for the outline's header (+ items when included). */
function collectOutlineTexts(
  outline: ActivityOutline | null,
  includeItems: boolean,
): Map<string, string> {
  const map = new Map<string, string>()
  if (!outline) return map
  const add = (t: ActivityOutlineText | undefined) => {
    if (t?.dataId) map.set(t.dataId, t.text)
  }
  add(outline.title)
  outline.badges.forEach(add)
  outline.instructions.forEach(add)
  if (includeItems) {
    for (const item of outline.items) {
      add(item.number)
      item.prompts.forEach(add)
      for (const o of item.options) add(o.text)
    }
  }
  return map
}

function collectOutlineItemImageIds(outline: ActivityOutline | null): Set<string> {
  const ids = new Set<string>()
  if (!outline) return ids
  for (const item of outline.items) {
    for (const id of item.imageIds) ids.add(id)
    for (const o of item.options) if (o.imageId) ids.add(o.imageId)
  }
  return ids
}

/** Answer-key item-ids surfaced by the outline's item cards. */
function collectOutlineItemIds(outline: ActivityOutline | null): Set<string> {
  const ids = new Set<string>()
  if (!outline) return ids
  for (const item of outline.items) {
    for (const input of item.inputs) if (input.itemId) ids.add(input.itemId)
    for (const o of item.options) if (o.itemId) ids.add(o.itemId)
  }
  return ids
}

function buildTextMap(
  leaves: ContentNodeData[],
  structure: EditableActivity | null,
  outline: ActivityOutline | null,
): Record<string, string> {
  const fromTree = Object.fromEntries(
    leaves.filter((l) => l.role !== "image").map((l) => [l.nodeId, l.text ?? ""]),
  )
  // Rendered text wins where we know it (outline + structure texts) — it's
  // what the data-id edit channel actually replaces, and for structure
  // sentences it carries the blank markers the tree text lacks.
  for (const [dataId, text] of collectOutlineTexts(outline, true)) {
    fromTree[dataId] = text
  }
  for (const [dataId, text] of collectStructureTexts(structure)) {
    fromTree[dataId] = text
  }
  return fromTree
}

function imageSrc(bookLabel: string, image: { imageId?: string; src: string }): string {
  if (image.imageId) return `${BASE_URL}/books/${bookLabel}/images/${image.imageId}`
  if (image.src.startsWith("http") || image.src.startsWith("/")) return image.src
  return `${BASE_URL}/books/${bookLabel}/adt-preview/${image.src}`
}

export function ClassicActivityPanel({
  open,
  onClose,
  bookLabel,
  leaves,
  answers,
  structure,
  outline,
  sectionType,
  activityTypes,
  onChangeType,
  onRegenerate,
  canRegenerate,
  onTextEdited,
  onAnswerEdited,
  onAnswersEdited,
  dirty,
  saving,
  onSave,
  onDiscard,
}: ClassicActivityPanelProps) {
  const { t } = useLingui()

  // FITB/MC use the structure's richer cards; every other type (or a failed
  // extraction) uses the outline's item cards.
  const showOutlineItems = !structure && (outline?.items.length ?? 0) > 0

  const structureTextIds = useMemo(
    () => new Set(collectStructureTexts(structure).keys()),
    [structure],
  )
  const structureImageIds = useMemo(() => collectStructureImageIds(structure), [structure])
  // Item-level outline ids only count as "shown" when the item cards render —
  // otherwise their texts/images/answers must stay in the flat lists.
  const outlineTextIds = useMemo(
    () => new Set(collectOutlineTexts(outline, showOutlineItems).keys()),
    [outline, showOutlineItems],
  )
  const outlineImageIds = useMemo(
    () => (showOutlineItems ? collectOutlineItemImageIds(outline) : new Set<string>()),
    [outline, showOutlineItems],
  )
  const outlineItemIds = useMemo(
    () => (showOutlineItems ? collectOutlineItemIds(outline) : new Set<string>()),
    [outline, showOutlineItems],
  )
  const groupedItemIds = useMemo(() => {
    const ids = new Set<string>()
    if (!structure) return ids
    for (const step of structure.steps) {
      if (structure.kind === "fill-in-the-blank") {
        for (const b of (step as FitbStep).blanks) ids.add(b.itemId)
      } else {
        for (const o of (step as McStep).options) ids.add(o.itemId)
      }
    }
    return ids
  }, [structure])

  // Leaves nothing above claimed — shown as flat lists below the cards
  // (or as the whole editor when there's no grouping at all).
  const otherTextLeaves = useMemo(
    () =>
      leaves.filter(
        (l) =>
          l.role !== "image" &&
          !structureTextIds.has(l.nodeId) &&
          !outlineTextIds.has(l.nodeId),
      ),
    [leaves, structureTextIds, outlineTextIds],
  )
  const otherImageLeaves = useMemo(
    () =>
      leaves.filter(
        (l) =>
          l.role === "image" &&
          !structureImageIds.has(l.nodeId) &&
          !outlineImageIds.has(l.nodeId),
      ),
    [leaves, structureImageIds, outlineImageIds],
  )
  const otherAnswerEntries = useMemo(
    () =>
      Object.entries(answers ?? {}).filter(
        (entry): entry is [string, string | number] =>
          typeof entry[1] !== "boolean" &&
          !groupedItemIds.has(entry[0]) &&
          !outlineItemIds.has(entry[0]),
      ),
    [answers, groupedItemIds, outlineItemIds],
  )

  // Text inputs hold a local draft: edits are pushed into the pending rendering
  // HTML (not the tree), so there's nothing to read the live value back from.
  // Resync whenever all pending changes are saved or discarded.
  const [texts, setTexts] = useState<Record<string, string>>(() =>
    buildTextMap(leaves, structure, outline),
  )
  useEffect(() => {
    if (!dirty) setTexts(buildTextMap(leaves, structure, outline))
  }, [dirty, leaves, structure, outline])

  const handleTextChange = (dataId: string, value: string) => {
    setTexts((prev) => ({ ...prev, [dataId]: value }))
    onTextEdited(dataId, value)
  }

  const textField = (dataId: string, mono: boolean, label: string) => (
    <textarea
      value={texts[dataId] ?? ""}
      onChange={(e) => handleTextChange(dataId, e.target.value)}
      rows={Math.min(4, Math.max(1, Math.ceil((texts[dataId]?.length ?? 0) / 50)))}
      className={`w-full rounded border bg-background p-2 text-xs ${mono ? "font-mono" : ""}`}
      aria-label={label}
    />
  )

  const caption = (label: string) => (
    <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
    </span>
  )

  const captionedText = (entry: ActivityOutlineText, label: string) => (
    <div className="space-y-0.5">
      {caption(label)}
      {entry.dataId ? (
        textField(entry.dataId, false, label)
      ) : (
        <p className="text-xs text-muted-foreground">{entry.text}</p>
      )}
    </div>
  )

  const answerField = (itemId: string) => (
    <div key={itemId} className="flex items-center gap-2">
      <Input
        value={String(answers?.[itemId] ?? "")}
        onChange={(e) => onAnswerEdited(itemId, e.target.value)}
        placeholder={t`Correct answer (alternatives separated by |)`}
        className="h-7 text-xs border-green-300 bg-green-50/60"
      />
      <span
        className="text-[10px] font-mono text-muted-foreground shrink-0"
        title={t`Blank reference`}
      >
        {itemId}
      </span>
    </div>
  )

  const answersHeading = (count: number) => (
    <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-green-700">
      <Check className="h-3 w-3" aria-hidden="true" />
      {count === 1 ? t`Answer` : t`Answers`}
    </span>
  )

  const imageThumb = (imageId: string, className: string) => (
    <img
      key={imageId}
      src={`${BASE_URL}/books/${bookLabel}/images/${imageId}`}
      alt=""
      title={imageId}
      className={className}
    />
  )

  const optionTextControl = (item: ActivityOutlineItem, optIndex: number) => {
    const o = item.options[optIndex]
    if (o.text?.dataId) {
      const dataId = o.text.dataId
      return (
        <Input
          value={texts[dataId] ?? ""}
          onChange={(e) => handleTextChange(dataId, e.target.value)}
          placeholder={t`Option text`}
          className="h-7 text-xs"
        />
      )
    }
    return (
      <span className="flex-1 text-xs text-muted-foreground">
        {o.text?.text ?? o.itemId ?? o.value ?? ""}
      </span>
    )
  }

  const outlineItemCard = (item: ActivityOutlineItem, i: number) => {
    const valueItemId = item.choice === "value" ? item.options[0]?.itemId : undefined
    return (
      <div key={i} className="rounded border p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium">
            {item.options.length > 0 ? t`Question ${i + 1}` : t`Item ${i + 1}`}
          </span>
          {(item.inputs[0]?.itemId ?? valueItemId) && (
            <span className="text-[10px] font-mono text-muted-foreground shrink-0">
              {item.inputs[0]?.itemId ?? valueItemId}
            </span>
          )}
        </div>
        {item.number?.dataId && (
          <div className="space-y-0.5">
            {caption(t`Label`)}
            <Input
              value={texts[item.number.dataId] ?? ""}
              onChange={(e) => handleTextChange(item.number!.dataId!, e.target.value)}
              className="h-7 w-24 text-xs"
              aria-label={t`Label`}
            />
          </div>
        )}
        {item.prompts.length > 0 && (
          <div className="space-y-1">
            {caption(t`Instruction`)}
            {item.prompts.map((p, pi) =>
              p.dataId ? (
                <div key={p.dataId}>{textField(p.dataId, false, t`Instruction`)}</div>
              ) : (
                <p key={pi} className="text-xs text-muted-foreground">
                  {p.text}
                </p>
              ),
            )}
          </div>
        )}
        {item.imageIds.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {item.imageIds.map((id) => imageThumb(id, "max-h-24 rounded border object-contain"))}
          </div>
        )}
        {/* Writable answer areas — visually distinct from the editable
            question texts above. */}
        {item.inputs.map((input, k) => (
          <div key={input.itemId ?? k} className="rounded border border-dashed bg-muted/40 p-2 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <TextCursorInput className="h-3 w-3" aria-hidden="true" />
                {t`Answer area`}
              </span>
              <span className="text-[10px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground shrink-0">
                {input.kind === "textarea" ? t`Long answer` : t`Short answer`}
              </span>
            </div>
            {input.itemId &&
            answers &&
            input.itemId in answers &&
            typeof answers[input.itemId] !== "boolean" ? (
              answerField(input.itemId)
            ) : (
              <p className="text-[10px] text-muted-foreground">{t`Accepts any answer`}</p>
            )}
          </div>
        ))}
        {/* True/false-style: options share one item-id, the answer is the
            selected option's value. */}
        {item.choice === "value" && item.options.length > 0 && (
          <div className="space-y-1.5">
            {answersHeading(1)}
            <div className="flex flex-wrap items-center gap-4">
              {item.options.map((o, oi) => (
                <label key={oi} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name={`outline-value-${i}`}
                    checked={String(answers?.[valueItemId ?? ""] ?? "") === (o.value ?? "")}
                    onChange={() =>
                      valueItemId && o.value !== undefined
                        ? onAnswersEdited({ [valueItemId]: o.value })
                        : undefined
                    }
                    title={t`Correct answer`}
                    className="cursor-pointer accent-green-600"
                  />
                  {o.text?.dataId ? (
                    <Input
                      value={texts[o.text.dataId] ?? ""}
                      onChange={(e) => handleTextChange(o.text!.dataId!, e.target.value)}
                      className="h-7 w-16 text-xs"
                      aria-label={t`Option text`}
                    />
                  ) : (
                    <span className="text-xs">{o.text?.text ?? o.value}</span>
                  )}
                </label>
              ))}
            </div>
          </div>
        )}
        {/* Single-choice (MC-style): the selected radio marks the correct
            option. Multi-select: every checked option is correct. */}
        {(item.choice === "single" || item.choice === "multi") && item.options.length > 0 && (
          <div className="space-y-1.5">
            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-green-700">
              <Check className="h-3 w-3" aria-hidden="true" />
              {item.choice === "single"
                ? t`Options — the selected radio marks the correct answer`
                : t`Options — checked options are the correct answers`}
            </span>
            {item.options.map((o, oi) => (
              <div key={o.itemId ?? oi} className="flex items-center gap-2">
                <input
                  type={item.choice === "single" ? "radio" : "checkbox"}
                  name={item.choice === "single" ? `outline-single-${i}` : undefined}
                  checked={Boolean(answers?.[o.itemId ?? ""])}
                  onChange={(e) => {
                    if (!o.itemId) return
                    if (item.choice === "single") {
                      onAnswersEdited(
                        Object.fromEntries(
                          item.options
                            .filter((x) => x.itemId)
                            .map((x) => [x.itemId!, x.itemId === o.itemId]),
                        ),
                      )
                    } else {
                      onAnswersEdited({ [o.itemId]: e.target.checked })
                    }
                  }}
                  title={t`Correct answer`}
                  className="cursor-pointer accent-green-600"
                />
                {o.imageId && imageThumb(o.imageId, "h-8 w-8 rounded border object-cover shrink-0")}
                {optionTextControl(item, oi)}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const headerTexts = outline
    ? { title: outline.title, badges: outline.badges, instructions: outline.instructions }
    : {
        title: structure?.title?.dataId ? structure.title : undefined,
        badges: [],
        instructions: structure?.instructions?.dataId ? [structure.instructions] : [],
      }
  const hasHeader =
    headerTexts.title !== undefined ||
    headerTexts.badges.length > 0 ||
    headerTexts.instructions.length > 0

  return (
    <div
      // inert while closed — the panel is only moved off-screen by the
      // transform, so without it Tab still reaches its inputs and the browser
      // scrolls the hidden panel into view.
      inert={!open}
      className={`absolute top-0 right-0 h-full w-[420px] flex flex-col bg-background border-l shadow-lg transition-transform duration-200 ease-in-out z-30 ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t`Activity content`}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-accent cursor-pointer"
          title={t`Close`}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <p className="text-[11px] text-muted-foreground leading-snug">
          {t`Edits apply to the matching elements of the activity's layout. To change the layout itself, use "Edit layout" in the banner.`}
        </p>

        {/* Activity type + regenerate */}
        {activityTypes && sectionType && (
          <div className="space-y-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t`Activity type`}
            </h3>
            <div className="flex items-center gap-2">
              <select
                value={sectionType}
                onChange={(e) => onChangeType(e.target.value)}
                className="h-7 min-w-0 flex-1 rounded border bg-background px-2 text-xs"
              >
                {!(sectionType in activityTypes) && (
                  <option value={sectionType}>{getSectionTypeLabel(sectionType)}</option>
                )}
                {/* The config values are LLM-facing descriptions — show the
                    human name and keep the description as a hover tooltip. */}
                {Object.entries(activityTypes).map(([key, description]) => (
                  <option key={key} value={key} title={description}>
                    {getSectionTypeLabel(key)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={onRegenerate}
                disabled={!canRegenerate}
                title={t`Regenerate this activity with AI (requires a saved state and an API key)`}
                className="flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium border border-violet-300 text-violet-700 hover:bg-violet-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {t`Regenerate`}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              {t`Changing the type regenerates the activity when you save.`}
            </p>
          </div>
        )}

        {/* Page header: title, badges, instructions — pinned at the top for
            every activity type. */}
        {hasHeader && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t`Header`}
            </h3>
            {headerTexts.title && captionedText(headerTexts.title, t`Title`)}
            {headerTexts.badges.map((b, bi) => (
              <div key={b.dataId ?? bi} className="space-y-0.5">
                {caption(t`Badge`)}
                {b.dataId ? (
                  <Input
                    value={texts[b.dataId] ?? ""}
                    onChange={(e) => handleTextChange(b.dataId!, e.target.value)}
                    className="h-7 w-40 text-xs"
                    aria-label={t`Badge`}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">{b.text}</p>
                )}
              </div>
            ))}
            {headerTexts.instructions.length > 0 && (
              <div className="space-y-1">
                {caption(t`Instructions`)}
                {headerTexts.instructions.map((ins, ii) =>
                  ins.dataId ? (
                    <div key={ins.dataId}>{textField(ins.dataId, false, t`Instructions`)}</div>
                  ) : (
                    <p key={ii} className="text-xs text-muted-foreground">
                      {ins.text}
                    </p>
                  ),
                )}
              </div>
            )}
          </div>
        )}

        {/* Grouped item cards — image, prompt/sentence, and answer together */}
        {structure && structure.kind === "fill-in-the-blank" && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t`Items`} ({structure.steps.length})
            </h3>
            {structure.steps.map((step, si) => (
              <div key={step.id} className="rounded border p-3 space-y-2">
                <span className="text-xs font-medium">{t`Item ${si + 1}`}</span>
                {step.image && (
                  <img
                    src={imageSrc(bookLabel, step.image)}
                    alt={step.image.alt ?? ""}
                    className="max-h-24 rounded border object-contain"
                  />
                )}
                {step.sentences.map((sentence, sni) =>
                  sentence.dataId ? (
                    <div key={sni}>{textField(sentence.dataId, true, t`Sentence with blank markers`)}</div>
                  ) : (
                    <p key={sni} className="text-xs font-mono text-muted-foreground">
                      {sentence.text}
                    </p>
                  ),
                )}
                <div className="space-y-1.5">
                  {answersHeading(step.blanks.length)}
                  {step.blanks.map((blank) => answerField(blank.itemId))}
                </div>
              </div>
            ))}
          </div>
        )}

        {structure && structure.kind === "multiple-choice" && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t`Questions`} ({structure.steps.length})
            </h3>
            {structure.steps.map((step, si) => (
              <div key={step.id} className="rounded border p-3 space-y-2">
                <span className="text-xs font-medium">{t`Question ${si + 1}`}</span>
                {step.image && (
                  <img
                    src={imageSrc(bookLabel, step.image)}
                    alt={step.image.alt ?? ""}
                    className="max-h-24 rounded border object-contain"
                  />
                )}
                {step.prompt?.dataId && textField(step.prompt.dataId, false, t`Question prompt`)}
                <div className="space-y-1.5">
                  <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-green-700">
                    <Check className="h-3 w-3" aria-hidden="true" />
                    {t`Options — the selected radio marks the correct answer`}
                  </span>
                  {step.options.map((option) => (
                    <div key={option.itemId} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`classic-correct-${step.id}`}
                        checked={Boolean(answers?.[option.itemId])}
                        onChange={() =>
                          onAnswersEdited(
                            Object.fromEntries(
                              step.options.map((o) => [o.itemId, o.itemId === option.itemId]),
                            ),
                          )
                        }
                        title={t`Correct answer`}
                        className="cursor-pointer accent-green-600"
                      />
                      {option.image && (
                        <img
                          src={imageSrc(bookLabel, option.image)}
                          alt={option.image.alt ?? ""}
                          className="h-8 w-8 rounded border object-cover shrink-0"
                        />
                      )}
                      {option.text?.dataId ? (
                        <Input
                          value={texts[option.text.dataId] ?? ""}
                          onChange={(e) => handleTextChange(option.text!.dataId!, e.target.value)}
                          placeholder={t`Option text`}
                          className="h-7 text-xs"
                        />
                      ) : (
                        <span className="flex-1 text-xs text-muted-foreground">
                          {option.text?.text ?? option.itemId}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Outline item cards — every activity type the structure doesn't
            cover: open-ended, true/false, multi-select, tables. */}
        {showOutlineItems && outline && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t`Items`} ({outline.items.length})
            </h3>
            {outline.items.map((item, i) => outlineItemCard(item, i))}
          </div>
        )}

        {/* Ungrouped answers (flat — always shown when present) */}
        {otherAnswerEntries.length > 0 && (
          <div className="space-y-1.5">
            {answersHeading(otherAnswerEntries.length)}
            {otherAnswerEntries.map(([itemId]) => answerField(itemId))}
          </div>
        )}

        {/* Ungrouped texts */}
        {otherTextLeaves.length > 0 && (
          <div className="space-y-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {structure || showOutlineItems ? t`Other text` : t`Text`} ({otherTextLeaves.length})
            </h3>
            {otherTextLeaves.map((leaf) => (
              <div key={leaf.nodeId} className="space-y-0.5">
                {leaf.role && leaf.role !== "paragraph" && (
                  <span className="text-[10px] font-mono text-muted-foreground">{leaf.role}</span>
                )}
                {textField(leaf.nodeId, false, t`Activity text`)}
              </div>
            ))}
          </div>
        )}

        {/* Ungrouped images (read-only — swapping happens in the layout editor) */}
        {otherImageLeaves.length > 0 && (
          <div className="space-y-1.5">
            <h3 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <ImageIcon className="h-3 w-3" aria-hidden="true" />
              {t`Images`} ({otherImageLeaves.length})
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {otherImageLeaves.map((leaf) => (
                <img
                  key={leaf.nodeId}
                  src={`${BASE_URL}/books/${bookLabel}/images/${leaf.nodeId}`}
                  alt={leaf.text ?? ""}
                  title={leaf.nodeId}
                  className="h-20 w-full rounded border object-contain bg-white"
                />
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {t`To replace an image, use "Edit layout" and click the image.`}
            </p>
          </div>
        )}
      </div>

      {/* Save bar */}
      <div className="border-t bg-background p-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onDiscard}
          disabled={!dirty || saving}
          className="h-8 px-3 rounded text-xs font-medium bg-muted hover:bg-accent disabled:opacity-40 transition-colors cursor-pointer"
        >
          {t`Discard`}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || saving}
          className="h-8 px-4 rounded text-xs font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 transition-colors cursor-pointer"
        >
          {saving ? t`Saving…` : t`Save activity`}
        </button>
      </div>
    </div>
  )
}
