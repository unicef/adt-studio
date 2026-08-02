/**
 * CMS-style editor for a step-by-step (editable) activity, presented as a
 * slide-out side panel (same pattern as SectionEditPanel) so the storyboard
 * preview area stays a plain preview with working device viewports.
 *
 * Saves write a new version of the `editable-activity` node — the
 * storyboard's web-rendering data is never touched, so switching back to the
 * classic presentation is lossless.
 */
import { useMemo, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { toast } from "sonner"
import {
  ArrowDown,
  ArrowUp,
  Check,
  ImageIcon,
  ListChecks,
  Plus,
  Sparkles,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react"
import type {
  ActivityImage,
  EditableActivity,
  FitbStep,
  McOption,
  McStep,
} from "@adt/types"
import { blankItemIdsInText } from "@adt/types"
import { BASE_URL } from "@/api/client"
import {
  useGenerateActivityFeedback,
  useSaveEditableActivities,
} from "@/hooks/use-editable-activities"
import { useApiKey } from "@/hooks/use-api-key"
import { Input } from "@/components/ui/input"
import {
  PendingChip,
  useFloatingSave,
} from "@/components/pipeline/components/floating-save"
import { ReplaceFromBookDialog } from "./ReplaceFromBookDialog"
import { ColorPicker } from "./style-editor/controls/ColorPicker"
import { Select } from "./style-editor/controls/Select"
import {
  hexFromTailwindName,
  tailwindNameFromHex,
} from "./style-editor/tailwind-palette"

interface EditableActivityPanelProps {
  open: boolean
  onClose: () => void
  bookLabel: string
  pageId: string
  sectionIndex: number
  activity: EditableActivity
  /** Full per-page map — saving writes the whole entity. */
  activities: Record<string, EditableActivity>
  /** Book-derived accent the activity renders with when no override is set. */
  paletteAccent: string
}

function resolveImageSrc(bookLabel: string, src: string): string {
  // Images picked in the editor are stored as rooted API paths; route them
  // through BASE_URL so the thumbnail also works in Electron (where the API
  // isn't same-origin with the studio window).
  if (src.startsWith("/api/")) return `${BASE_URL}${src.slice("/api".length)}`
  if (src.startsWith("http") || src.startsWith("/")) return src
  return `${BASE_URL}/books/${bookLabel}/adt-preview/${src}`
}

/** Next unused item-N across the whole activity (blanks + options). */
function nextItemNumber(activity: EditableActivity): number {
  let max = 0
  const scan = (id: string) => {
    const m = /^item-(\d+)$/.exec(id)
    if (m) max = Math.max(max, Number(m[1]))
  }
  if (activity.kind === "fill-in-the-blank") {
    for (const step of activity.steps) {
      for (const b of step.blanks) scan(b.itemId)
      for (const s of step.sentences) for (const id of blankItemIdsInText(s.text)) scan(id)
    }
  } else if (activity.kind === "multiple-choice") {
    for (const step of activity.steps) for (const o of step.options) scan(o.itemId)
  }
  // open-ended / underline don't mint new item-N ids in the editor.
  return max + 1
}

/** Next `step-N` id not already used by a step (keeps ids unique across
 *  add/delete/reorder). */
function nextStepId(steps: Array<{ id: string }>): string {
  let max = 0
  for (const s of steps) {
    const m = /^step-(\d+)$/.exec(s.id)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `step-${max + 1}`
}

function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function EditableActivityPanel({
  open,
  onClose,
  bookLabel,
  pageId,
  sectionIndex,
  activity,
  activities,
  paletteAccent,
}: EditableActivityPanelProps) {
  const { t } = useLingui()
  const [draft, setDraft] = useState<EditableActivity>(activity)
  const save = useSaveEditableActivities(bookLabel, pageId)
  const generateFeedback = useGenerateActivityFeedback(bookLabel, pageId)
  const { apiKey, hasApiKey, anthropicKey, googleKey, customBaseUrl, customApiKey, geminiKey } =
    useApiKey()

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(activity),
    [draft, activity],
  )

  const handleGenerateFeedback = () => {
    generateFeedback.mutate(
      {
        sectionIndex,
        apiKey,
        providerCredentials: {
          anthropicApiKey: anthropicKey || undefined,
          googleApiKey: googleKey || undefined,
          customBaseUrl: customBaseUrl || undefined,
          customApiKey: customApiKey || undefined,
          geminiApiKey: geminiKey || undefined,
        },
        // Send the draft so feedback matches unsaved edits (added steps,
        // changed answers) instead of the last saved version.
        activity: draft,
      },
      {
        onSuccess: ({ feedback }) => {
          setDraft((d) => ({
            ...d,
            steps: d.steps.map((s) =>
              feedback[s.id] ? { ...s, feedback: feedback[s.id] } : s,
            ),
          }) as EditableActivity)
          toast.success(t`Feedback generated — review it and save`)
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : t`Feedback generation failed`),
      },
    )
  }

  const setFeedbackField = (
    index: number,
    field: "correct" | "incorrect",
    value: string,
  ) => {
    setDraft((d) => ({
      ...d,
      steps: d.steps.map((s, i) => {
        if (i !== index) return s
        const feedback: { correct?: string; incorrect?: string } = {
          ...s.feedback,
          [field]: value === "" ? undefined : value,
        }
        const hasAny = feedback.correct !== undefined || feedback.incorrect !== undefined
        return { ...s, feedback: hasAny ? feedback : undefined }
      }),
    }) as EditableActivity)
  }

  const saveDraft = async () => {
    // Sentences cleared to empty in the editor are dropped on save (kept while
    // editing so the textarea doesn't vanish mid-edit).
    const cleaned: EditableActivity =
      draft.kind === "fill-in-the-blank"
        ? {
            ...draft,
            steps: draft.steps.map((s) => ({
              ...s,
              sentences: s.sentences.filter((x) => x.text.trim() !== ""),
            })),
          }
        : draft
    try {
      await save.mutateAsync({ ...activities, [String(sectionIndex)]: cleaned })
      toast.success(t`Activity saved`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t`Save failed`)
      throw err
    }
  }

  const handleSave = () => {
    void saveDraft().catch(() => {})
  }

  useFloatingSave({
    id: `editable-activity:${bookLabel}:${pageId}:${sectionIndex}`,
    stage: "storyboard",
    dirty,
    saving: save.isPending,
    label: <PendingChip icon={ListChecks}>{t`Activity`}</PendingChip>,
    onSave: saveDraft,
    onDiscard: () => setDraft(activity),
  })

  const setTheme = (patch: Partial<NonNullable<EditableActivity["theme"]>>) => {
    setDraft((d) => ({ ...d, theme: { ...d.theme, ...patch } }))
  }

  // The swatch always shows the color the activity actually renders with —
  // the per-activity override when set, otherwise the book palette accent.
  const effectiveAccent = draft.theme?.accent ?? paletteAccent
  const accentLabel = tailwindNameFromHex(effectiveAccent) ?? effectiveAccent
  const handleAccentChange = (next: string) => {
    // The picker returns a hex (#abc123 / #abc123ff) or a Tailwind token
    // (violet-500); the schema stores 6-digit hex.
    const hex = next.startsWith("#") ? next.slice(0, 7) : hexFromTailwindName(next)
    if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return
    setTheme({ accent: hex })
  }

  // NOTE on dataId: extracted texts carry the text-catalog id so the reader's
  // translation layer keeps working. That same layer would OVERRIDE any edit
  // with the original catalog text — so editing a text drops its dataId,
  // making the typed text authoritative.
  const setText = (field: "title" | "instructions", value: string) => {
    setDraft((d) => ({
      ...d,
      [field]: value.trim() === "" ? undefined : { text: value },
    }))
  }

  // Word bank (fill-in-the-blank cloze) — the shared list of words shown on
  // every step. dataId dropped on edit, same as setText.
  const setWordBank = (value: string) => {
    setDraft((d) => ({
      ...d,
      wordBank: value.trim() === "" ? undefined : { text: value },
    }))
  }

  // ---------------------------------------------------------------------------
  // FITB editing
  // ---------------------------------------------------------------------------

  const updateFitbStep = (index: number, step: FitbStep) => {
    setDraft((d) =>
      d.kind === "fill-in-the-blank"
        ? { ...d, steps: d.steps.map((s, i) => (i === index ? step : s)) }
        : d,
    )
  }

  /** Sentence edits re-sync the marker-bound blank entries with the text.
   *  Standalone blanks (form-style answer fields with no marker) survive. */
  const updateFitbSentence = (stepIndex: number, sentenceIndex: number, text: string) => {
    if (draft.kind !== "fill-in-the-blank") return
    const step = draft.steps[stepIndex]
    // The edited sentence loses its dataId — see the note on setText.
    const sentences = step.sentences.map((s, i) =>
      i === sentenceIndex ? { text } : s,
    )
    const markerIds = sentences.flatMap((s) => blankItemIdsInText(s.text))
    const markerBlanks = [...new Set(markerIds)].map(
      (itemId) => step.blanks.find((b) => b.itemId === itemId) ?? { itemId, answers: [] },
    )
    // Blanks whose marker was just deleted become standalone answer fields —
    // dropping them would orphan the answer and leave the step with zero
    // blanks (which fails validation on save).
    const standalone = step.blanks.filter((b) => !markerIds.includes(b.itemId))
    updateFitbStep(stepIndex, { ...step, sentences, blanks: [...markerBlanks, ...standalone] })
  }

  const updateBlankAnswers = (stepIndex: number, itemId: string, raw: string) => {
    if (draft.kind !== "fill-in-the-blank") return
    const step = draft.steps[stepIndex]
    const answers = raw
      .split("|")
      .map((a) => a.trim())
      .filter((a) => a.length > 0)
    updateFitbStep(stepIndex, {
      ...step,
      blanks: step.blanks.map((b) => (b.itemId === itemId ? { ...b, answers } : b)),
    })
  }

  const addFitbStep = () => {
    if (draft.kind !== "fill-in-the-blank") return
    const n = nextItemNumber(draft)
    const step: FitbStep = {
      id: `step-${draft.steps.length + 1}-${n}`,
      sentences: [{ text: t`Write your sentence with a ${`[[blank:item-${n}]]`} marker.` }],
      blanks: [{ itemId: `item-${n}`, answers: [] }],
    }
    setDraft((d) =>
      d.kind === "fill-in-the-blank" ? { ...d, steps: [...d.steps, step] } : d,
    )
  }

  // ---------------------------------------------------------------------------
  // MC editing
  // ---------------------------------------------------------------------------

  const updateMcStep = (index: number, step: McStep) => {
    setDraft((d) =>
      d.kind === "multiple-choice"
        ? { ...d, steps: d.steps.map((s, i) => (i === index ? step : s)) }
        : d,
    )
  }

  const updateOption = (stepIndex: number, optionIndex: number, patch: Partial<McOption>) => {
    if (draft.kind !== "multiple-choice") return
    const step = draft.steps[stepIndex]
    updateMcStep(stepIndex, {
      ...step,
      options: step.options.map((o, i) => (i === optionIndex ? { ...o, ...patch } : o)),
    })
  }

  const markCorrect = (stepIndex: number, optionIndex: number) => {
    if (draft.kind !== "multiple-choice") return
    const step = draft.steps[stepIndex]
    updateMcStep(stepIndex, {
      ...step,
      options: step.options.map((o, i) => ({ ...o, correct: i === optionIndex })),
    })
  }

  const removeOption = (stepIndex: number, optionIndex: number) => {
    if (draft.kind !== "multiple-choice") return
    const step = draft.steps[stepIndex]
    const options = step.options.filter((_, i) => i !== optionIndex)
    // Removing the correct option would leave the step with none, which fails
    // validation on save — re-assign correctness to the first remaining option.
    if (!options.some((o) => o.correct) && options.length > 0) {
      options[0] = { ...options[0], correct: true }
    }
    updateMcStep(stepIndex, { ...step, options })
  }

  const addOption = (stepIndex: number) => {
    if (draft.kind !== "multiple-choice") return
    const step = draft.steps[stepIndex]
    const n = nextItemNumber(draft)
    updateMcStep(stepIndex, {
      ...step,
      options: [
        ...step.options,
        { itemId: `item-${n}`, text: { text: "" }, correct: false },
      ],
    })
  }

  const addMcStep = () => {
    if (draft.kind !== "multiple-choice") return
    const n = nextItemNumber(draft)
    const step: McStep = {
      id: `question-group-new-${n}`,
      prompt: { text: "" },
      options: [
        { itemId: `item-${n}`, text: { text: "" }, correct: true },
        { itemId: `item-${n + 1}`, text: { text: "" }, correct: false },
      ],
    }
    setDraft((d) => (d.kind === "multiple-choice" ? { ...d, steps: [...d.steps, step] } : d))
  }

  // ---------------------------------------------------------------------------
  // Open-ended editing
  // ---------------------------------------------------------------------------

  const updateOpenEndedPrompt = (index: number, value: string) => {
    setDraft((d) =>
      d.kind === "open-ended"
        ? {
            ...d,
            steps: d.steps.map((s, i) =>
              i === index
                ? // dataId dropped on edit — see the note on setText.
                  { ...s, prompt: value.trim() === "" ? undefined : { text: value } }
                : s,
            ),
          }
        : d,
    )
  }

  const addOpenEndedStep = () => {
    if (draft.kind !== "open-ended") return
    setDraft((d) =>
      d.kind === "open-ended"
        ? {
            ...d,
            steps: [
              ...d.steps,
              { id: nextStepId(d.steps), prompt: { text: "" }, multiline: true },
            ],
          }
        : d,
    )
  }

  // ---------------------------------------------------------------------------
  // Underline editing — the only editable field is the answer key (which words
  // should be underlined); the sentence/token structure comes from extraction.
  // ---------------------------------------------------------------------------

  const updateUnderlinePrompt = (index: number, value: string) => {
    setDraft((d) =>
      d.kind === "underline-text"
        ? {
            ...d,
            steps: d.steps.map((s, i) =>
              i === index
                ? { ...s, prompt: value.trim() === "" ? undefined : { text: value } }
                : s,
            ),
          }
        : d,
    )
  }

  const toggleUnderlineCorrect = (index: number, itemId: string) => {
    setDraft((d) => {
      if (d.kind !== "underline-text") return d
      return {
        ...d,
        steps: d.steps.map((s, i) => {
          if (i !== index) return s
          const correctCount = s.tokens.filter((tk) => tk.itemId && tk.correct).length
          return {
            ...s,
            tokens: s.tokens.map((tk) => {
              if (tk.itemId !== itemId) return tk
              // Keep at least one correct word — a sentence with none can't be
              // completed and fails validation on save.
              if (tk.correct && correctCount <= 1) return tk
              return { ...tk, correct: !tk.correct }
            }),
          }
        }),
      }
    })
  }

  const deleteStep = (index: number) => {
    setDraft((d) => ({
      ...d,
      steps: d.steps.filter((_, i) => i !== index),
    }) as EditableActivity)
  }

  const moveStep = (index: number, delta: number) => {
    setDraft(
      (d) => ({ ...d, steps: moveItem(d.steps as unknown[], index, index + delta) }) as EditableActivity,
    )
  }

  // Step image controls — extraction may find no picture (text-only source),
  // so every step supports adding/replacing/removing one from the book.
  const [imagePickerTarget, setImagePickerTarget] = useState<number | null>(null)

  const setStepImage = (index: number, image: ActivityImage | undefined) => {
    setDraft((d) => ({
      ...d,
      steps: d.steps.map((s, i) => (i === index ? { ...s, image } : s)),
    }) as EditableActivity)
  }

  const stepImageControls = (index: number, image: ActivityImage | undefined) => (
    <div className="flex items-center gap-2">
      {image ? (
        <>
          <img
            src={resolveImageSrc(bookLabel, image.src)}
            alt={image.alt ?? ""}
            className="max-h-24 rounded border object-contain"
          />
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => setImagePickerTarget(index)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <ImageIcon className="h-3 w-3" />
              {t`Replace image`}
            </button>
            <button
              type="button"
              onClick={() => setStepImage(index, undefined)}
              className="flex items-center gap-1 text-[10px] text-red-600 hover:text-red-700 cursor-pointer"
            >
              <Trash2 className="h-3 w-3" />
              {t`Remove image`}
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setImagePickerTarget(index)}
          className="flex items-center gap-1.5 rounded border border-dashed px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:border-solid transition-colors cursor-pointer"
        >
          <ImageIcon className="h-3 w-3" />
          {t`Add image`}
        </button>
      )}
    </div>
  )

  const feedbackFields = (
    index: number,
    feedback: { correct?: string; incorrect?: string } | undefined,
  ) => (
    <div className="space-y-1.5 border-t border-dashed pt-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t`Feedback`}
      </span>
      <div className="flex items-center gap-2">
        <Check className="h-3.5 w-3.5 shrink-0 text-green-600" aria-hidden="true" />
        <Input
          value={feedback?.correct ?? ""}
          onChange={(e) => setFeedbackField(index, "correct", e.target.value)}
          placeholder={t`Message when correct (may include the answer)`}
          className="h-7 text-xs"
        />
      </div>
      <div className="flex items-center gap-2">
        <X className="h-3.5 w-3.5 shrink-0 text-red-600" aria-hidden="true" />
        <Input
          value={feedback?.incorrect ?? ""}
          onChange={(e) => setFeedbackField(index, "incorrect", e.target.value)}
          placeholder={t`Hint when wrong (don't reveal the answer)`}
          className="h-7 text-xs"
        />
      </div>
    </div>
  )

  const stepControls = (index: number) => (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => moveStep(index, -1)}
        disabled={index === 0}
        className="p-1 rounded hover:bg-accent disabled:opacity-30 cursor-pointer"
        title={t`Move up`}
      >
        <ArrowUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => moveStep(index, 1)}
        disabled={index === draft.steps.length - 1}
        className="p-1 rounded hover:bg-accent disabled:opacity-30 cursor-pointer"
        title={t`Move down`}
      >
        <ArrowDown className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => deleteStep(index)}
        disabled={draft.steps.length <= 1}
        className="p-1 rounded hover:bg-red-100 text-red-600 disabled:opacity-30 cursor-pointer"
        title={t`Delete step`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )

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
          {t`Step-by-step activity`}
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
        {activity.extractionWarnings && activity.extractionWarnings.length > 0 && (
          <div className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
            <div className="flex items-center gap-1.5 font-medium">
              <TriangleAlert className="h-3.5 w-3.5" />
              {t`Extraction notes`}
            </div>
            {activity.extractionWarnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
          </div>
        )}

        {/* Style */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t`Style`}</h3>
          <div className="flex items-center gap-3">
            <label className="text-xs w-24 shrink-0">{t`Accent color`}</label>
            <ColorPicker
              value={effectiveAccent}
              onChange={handleAccentChange}
              align="start"
              // The theme accent schema is 6-digit hex — alpha and
              // `transparent` would be silently dropped otherwise.
              opaqueOnly
            />
            <span className="text-xs text-muted-foreground font-mono min-w-0 truncate">
              {accentLabel}
            </span>
            {draft.theme?.accent ? (
              <button
                type="button"
                onClick={() => setTheme({ accent: undefined })}
                title={t`Reset to the book's accent`}
                className="ml-auto shrink-0 text-[10px] text-muted-foreground hover:text-foreground underline cursor-pointer"
              >
                {t`Reset`}
              </button>
            ) : (
              <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{t`From book`}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs w-24 shrink-0">{t`Image size`}</label>
            <Select
              value={draft.theme?.imageSize ?? "medium"}
              onChange={(v) => setTheme({ imageSize: v })}
              options={[
                { value: "small", label: t`Small` },
                { value: "medium", label: t`Medium` },
                { value: "large", label: t`Large` },
              ]}
              className="w-32"
            />
          </div>
          {draft.kind === "multiple-choice" && (
            <div className="flex items-center gap-3">
              <label className="text-xs w-24 shrink-0">{t`Option columns`}</label>
              <Select
                value={String(draft.theme?.optionColumns ?? 2)}
                onChange={(v) => setTheme({ optionColumns: Number(v) })}
                options={["1", "2", "3", "4"].map((n) => ({ value: n, label: n }))}
                className="w-32"
              />
            </div>
          )}
        </div>

        {/* Texts */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t`Text`}</h3>
          <Input
            value={draft.title?.text ?? ""}
            onChange={(e) => setText("title", e.target.value)}
            placeholder={t`Title`}
            className="h-8 text-sm"
          />
          <Input
            value={draft.instructions?.text ?? ""}
            onChange={(e) => setText("instructions", e.target.value)}
            placeholder={t`Instructions`}
            className="h-8 text-sm"
          />
          {draft.kind === "fill-in-the-blank" && (
            <textarea
              value={draft.wordBank?.text ?? ""}
              onChange={(e) => setWordBank(e.target.value)}
              placeholder={t`Word bank — words to choose from, separated by commas (shown on every step)`}
              aria-label={t`Word bank`}
              rows={2}
              className="w-full rounded border bg-background p-2 text-sm"
            />
          )}
        </div>

        {/* Steps */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t`Steps`} ({draft.steps.length})
            </h3>
            <button
              type="button"
              onClick={handleGenerateFeedback}
              disabled={!hasApiKey || generateFeedback.isPending}
              title={
                hasApiKey
                  ? t`Write correct/incorrect feedback for every step with AI`
                  : t`Add your OpenAI API key first`
              }
              className="flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium border border-violet-300 text-violet-700 hover:bg-violet-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {generateFeedback.isPending ? t`Generating…` : t`Generate feedback`}
            </button>
          </div>

          {draft.kind === "fill-in-the-blank"
            ? draft.steps.map((step, si) => (
                <div key={step.id} className="rounded border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{t`Step ${si + 1}`}</span>
                    {stepControls(si)}
                  </div>
                  {stepImageControls(si, step.image)}
                  {step.sentences.map((sentence, sni) => (
                    <textarea
                      key={sni}
                      value={sentence.text}
                      onChange={(e) => updateFitbSentence(si, sni, e.target.value)}
                      rows={2}
                      className="w-full rounded border bg-background p-2 text-xs font-mono"
                      aria-label={t`Sentence with blank markers`}
                    />
                  ))}
                  <div className="space-y-1.5">
                    <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-green-700">
                      <Check className="h-3 w-3" aria-hidden="true" />
                      {step.blanks.length === 1 ? t`Answer` : t`Answers`}
                    </span>
                    {step.blanks.map((blank) => (
                      <div key={blank.itemId} className="flex items-center gap-2">
                        <Input
                          value={blank.answers.join(" | ")}
                          onChange={(e) => updateBlankAnswers(si, blank.itemId, e.target.value)}
                          placeholder={t`Correct answer (alternatives separated by |)`}
                          className="h-7 text-xs border-green-300 bg-green-50/60"
                        />
                        <span
                          className="text-[10px] font-mono text-muted-foreground shrink-0"
                          title={t`Blank reference`}
                        >
                          {blank.itemId}
                        </span>
                      </div>
                    ))}
                  </div>
                  {feedbackFields(si, step.feedback)}
                </div>
              ))
            : draft.kind === "multiple-choice"
            ? draft.steps.map((step, si) => (
                <div key={step.id} className="rounded border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{t`Question ${si + 1}`}</span>
                    {stepControls(si)}
                  </div>
                  <Input
                    value={step.prompt?.text ?? ""}
                    onChange={(e) =>
                      updateMcStep(si, {
                        ...step,
                        // dataId dropped on edit — see the note on setText.
                        prompt:
                          e.target.value.trim() === ""
                            ? undefined
                            : { text: e.target.value },
                      })
                    }
                    placeholder={t`Question prompt`}
                    className="h-8 text-sm"
                  />
                  {stepImageControls(si, step.image)}
                  <div className="space-y-1.5">
                    <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-green-700">
                      <Check className="h-3 w-3" aria-hidden="true" />
                      {t`Options — the selected radio marks the correct answer`}
                    </span>
                    {step.options.map((option, oi) => (
                      <div key={option.itemId} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`correct-${sectionIndex}-${step.id}`}
                          checked={option.correct}
                          onChange={() => markCorrect(si, oi)}
                          title={t`Correct answer`}
                          className="cursor-pointer accent-green-600"
                        />
                        {option.image && (
                          <img
                            src={resolveImageSrc(bookLabel, option.image.src)}
                            alt={option.image.alt ?? ""}
                            className="h-8 w-8 rounded border object-cover shrink-0"
                          />
                        )}
                        <Input
                          value={option.text?.text ?? ""}
                          onChange={(e) =>
                            updateOption(si, oi, {
                              // dataId dropped on edit — see the note on setText.
                              text:
                                e.target.value === ""
                                  ? undefined
                                  : { text: e.target.value },
                            })
                          }
                          placeholder={t`Option text`}
                          className="h-7 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => removeOption(si, oi)}
                          disabled={step.options.length <= 2}
                          className="p-1 rounded hover:bg-red-100 text-red-600 disabled:opacity-30 cursor-pointer"
                          title={t`Delete option`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => addOption(si)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <Plus className="h-3 w-3" />
                    {t`Add option`}
                  </button>
                  {feedbackFields(si, step.feedback)}
                </div>
              ))
            : draft.kind === "open-ended"
            ? draft.steps.map((step, si) => (
                <div key={step.id} className="rounded border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{t`Question ${si + 1}`}</span>
                    {stepControls(si)}
                  </div>
                  <textarea
                    value={step.prompt?.text ?? ""}
                    onChange={(e) => updateOpenEndedPrompt(si, e.target.value)}
                    rows={2}
                    className="w-full rounded border bg-background p-2 text-xs"
                    placeholder={t`Question prompt`}
                    aria-label={t`Question prompt`}
                  />
                  {stepImageControls(si, step.image)}
                  <p className="text-[10px] italic text-muted-foreground">
                    {t`Open-ended — learners write a free response; there is no fixed answer.`}
                  </p>
                  {feedbackFields(si, step.feedback)}
                </div>
              ))
            : draft.steps.map((step, si) => (
                <div key={step.id} className="rounded border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{t`Sentence ${si + 1}`}</span>
                    {stepControls(si)}
                  </div>
                  <Input
                    value={step.prompt?.text ?? ""}
                    onChange={(e) => updateUnderlinePrompt(si, e.target.value)}
                    placeholder={t`Prompt (optional)`}
                    className="h-8 text-sm"
                  />
                  {stepImageControls(si, step.image)}
                  <div className="space-y-1.5">
                    <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-green-700">
                      <Check className="h-3 w-3" aria-hidden="true" />
                      {t`Tap the words that should be underlined`}
                    </span>
                    <div className="flex flex-wrap items-baseline gap-1">
                      {step.tokens.map((tk, ti) =>
                        tk.itemId ? (
                          <button
                            key={ti}
                            type="button"
                            onClick={() => toggleUnderlineCorrect(si, tk.itemId!)}
                            className={`rounded border px-1.5 py-0.5 text-xs cursor-pointer transition-colors ${
                              tk.correct
                                ? "border-green-500 bg-green-50 text-green-800 underline"
                                : "border-slate-300 bg-background hover:border-slate-400"
                            }`}
                            aria-pressed={tk.correct ?? false}
                          >
                            {tk.text}
                          </button>
                        ) : tk.text.trim() ? (
                          <span key={ti} className="px-0.5 text-xs text-muted-foreground">
                            {tk.text}
                          </span>
                        ) : (
                          <span key={ti}> </span>
                        ),
                      )}
                    </div>
                  </div>
                  {feedbackFields(si, step.feedback)}
                </div>
              ))}

          {draft.kind !== "underline-text" && (
            <button
              type="button"
              onClick={
                draft.kind === "fill-in-the-blank"
                  ? addFitbStep
                  : draft.kind === "multiple-choice"
                    ? addMcStep
                    : addOpenEndedStep
              }
              className="flex items-center gap-1.5 rounded border border-dashed px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:border-solid transition-colors cursor-pointer w-full justify-center"
            >
              <Plus className="h-3.5 w-3.5" />
              {draft.kind === "fill-in-the-blank" ? t`Add step` : t`Add question`}
            </button>
          )}
        </div>
      </div>

      {/* Save bar */}
      <div className="border-t bg-background p-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setDraft(activity)}
          disabled={!dirty || save.isPending}
          className="h-8 px-3 rounded text-xs font-medium bg-muted hover:bg-accent disabled:opacity-40 transition-colors cursor-pointer"
        >
          {t`Discard`}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || save.isPending}
          className="h-8 px-4 rounded text-xs font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 transition-colors cursor-pointer"
        >
          {save.isPending ? t`Saving…` : t`Save activity`}
        </button>
      </div>

      {imagePickerTarget !== null && (
        <ReplaceFromBookDialog
          bookLabel={bookLabel}
          currentImageId={draft.steps[imagePickerTarget]?.image?.imageId ?? ""}
          onSelect={(imageId) => {
            // Rooted API path: works in the preview iframe (dev + Electron);
            // packaging rewrites it to the bundled file via the image map.
            setStepImage(imagePickerTarget, {
              imageId,
              src: `/api/books/${bookLabel}/images/${imageId}`,
            })
            setImagePickerTarget(null)
          }}
          onClose={() => setImagePickerTarget(null)}
        />
      )}
    </div>
  )
}
