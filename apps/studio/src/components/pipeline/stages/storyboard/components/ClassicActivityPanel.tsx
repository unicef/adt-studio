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
 *
 * Controls are wrapped in `Anchored`, which ties each to its element in the
 * page preview — see `activity-link.ts`.
 */
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useLingui } from "@lingui/react/macro"
import {
  Check,
  ImageIcon,
  Loader2,
  MousePointerClick,
  Pencil,
  Puzzle,
  Sparkles,
  TextCursorInput,
  X,
} from "lucide-react"
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn, scrollBehavior } from "@/lib/utils"
import { getSectionTypeLabel } from "@/lib/section-constants"
import {
  answerAnchor,
  anchorKey,
  imageAnchor,
  parseAnchorKey,
  sameAnchor,
  textAnchor,
  type ActivityAnchor,
} from "./activity-link"

const MIN_PANEL_WIDTH = 380
const MAX_PANEL_WIDTH = 760
const DEFAULT_PANEL_WIDTH = 460
const PANEL_WIDTH_STORAGE_KEY = "adt:activity-panel-width"
const HINT_DISMISSED_STORAGE_KEY = "adt:activity-panel-hint-dismissed"

// eslint-disable-next-line lingui/no-unlocalized-strings -- sentinel value, never rendered
const NO_CHOICE_ID = "__none__"

function readStoredWidth(): number {
  try {
    const stored = Number(localStorage.getItem(PANEL_WIDTH_STORAGE_KEY))
    if (!Number.isFinite(stored) || stored <= 0) return DEFAULT_PANEL_WIDTH
    return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, stored))
  } catch {
    return DEFAULT_PANEL_WIDTH
  }
}

function writeStoredWidth(width: number): void {
  try {
    localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(width))
  } catch {
  }
}

function readHintDismissed(): boolean {
  try {
    return localStorage.getItem(HINT_DISMISSED_STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

const NO_INNER_RING = "focus-visible:ring-0 focus-visible:ring-offset-0"

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
  /** Committed selection — survives pointer movement. */
  linkedAnchor: ActivityAnchor | null
  /** Element under the pointer on either surface. Ignored while something is
   *  selected. */
  hoveredAnchor: ActivityAnchor | null
  /** True when the selection came from a click in the page — the matching
   *  field then scrolls into view and takes focus. Panel-originated ones must
   *  not scroll, or the view would jump while the user types. */
  linkedFromPage: boolean
  onAnchorSelect: (anchor: ActivityAnchor | null) => void
  onAnchorHover: (anchor: ActivityAnchor | null) => void
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
  } else if (activity.kind === "multiple-choice") {
    for (const step of activity.steps) {
      add(step.prompt)
      for (const o of step.options) add(o.text)
    }
  } else if (activity.kind === "open-ended") {
    for (const step of activity.steps) add(step.prompt)
  } else {
    for (const step of activity.steps) {
      add(step.prompt)
      if (step.dataId) map.set(step.dataId, step.tokens.map((tk) => tk.text).join(""))
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

/** dataId → rendered text for the outline's header + the given item cards. */
function collectOutlineTexts(
  outline: ActivityOutline | null,
  items: ActivityOutlineItem[],
): Map<string, string> {
  const map = new Map<string, string>()
  const add = (t: ActivityOutlineText | undefined) => {
    if (t?.dataId) map.set(t.dataId, t.text)
  }
  if (outline) {
    add(outline.title)
    outline.badges.forEach(add)
    outline.instructions.forEach(add)
  }
  for (const item of items) {
    add(item.number)
    item.prompts.forEach(add)
    for (const o of item.options) add(o.text)
  }
  return map
}

function collectOutlineItemImageIds(items: ActivityOutlineItem[]): Set<string> {
  const ids = new Set<string>()
  for (const item of items) {
    for (const id of item.imageIds) ids.add(id)
    for (const o of item.options) if (o.imageId) ids.add(o.imageId)
  }
  return ids
}

/** Answer-key item-ids surfaced by the outline's item cards. */
function collectOutlineItemIds(items: ActivityOutlineItem[]): Set<string> {
  const ids = new Set<string>()
  for (const item of items) {
    for (const input of item.inputs) if (input.itemId) ids.add(input.itemId)
    for (const o of item.options) if (o.itemId) ids.add(o.itemId)
  }
  return ids
}

/** The answer key stores choice correctness as booleans, but LLM output can
 *  contain the strings "true"/"false" — mirror the extractor's defensive
 *  parse so a "false" string never displays as a correct answer. */
function isCorrectAnswer(value: string | boolean | number | undefined): boolean {
  return value === true || value === 1 || String(value ?? "").toLowerCase() === "true"
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
  for (const [dataId, text] of collectOutlineTexts(outline, outline?.items ?? [])) {
    fromTree[dataId] = text
  }
  for (const [dataId, text] of collectStructureTexts(structure)) {
    fromTree[dataId] = text
  }
  return fromTree
}

function readableText(text: string | undefined): string {
  if (!text) return ""
  return text
    .replace(/\[\[blank:[^\]]+\]\]/g, "___")
    .replace(/\s+/g, " ")
    .trim()
}

function imageSrc(bookLabel: string, image: { imageId?: string; src: string }): string {
  if (image.imageId) return `${BASE_URL}/books/${bookLabel}/images/${image.imageId}`
  if (image.src.startsWith("http") || image.src.startsWith("/")) return image.src
  return `${BASE_URL}/books/${bookLabel}/adt-preview/${image.src}`
}

interface LinkContextValue {
  linked: ActivityAnchor | null
  hovered: ActivityAnchor | null
  fromPage: boolean
}

const LinkContext = createContext<LinkContextValue>({
  linked: null,
  hovered: null,
  fromPage: false,
})

const ClaimedAnchorContext = createContext<string | null>(null)

function Anchored({
  anchor,
  className,
  children,
}: {
  anchor: ActivityAnchor
  className?: string
  children: ReactNode
}) {
  const { linked, hovered, fromPage } = useContext(LinkContext)
  const claimed = useContext(ClaimedAnchorContext)
  const ref = useRef<HTMLDivElement>(null)
  const isClaimed = claimed !== null && claimed === anchorKey(anchor)
  const isLinked = !isClaimed && sameAnchor(linked, anchor)
  const isPreviewed = !isClaimed && !linked && sameAnchor(hovered, anchor)

  useEffect(() => {
    if (!isLinked || !fromPage) return
    const el = ref.current
    if (!el) return
    const viewport = el.closest<HTMLElement>("[data-radix-scroll-area-viewport]")
    if (viewport) {
      const target = el.getBoundingClientRect()
      const view = viewport.getBoundingClientRect()
      viewport.scrollBy({
        top: target.top - view.top - (view.height - target.height) / 2,
        behavior: scrollBehavior(),
      })
    } else {
      el.scrollIntoView({ block: "center", behavior: scrollBehavior() })
    }
    const focusable =
      el.querySelector<HTMLElement>("textarea, input, select") ??
      el.querySelector<HTMLElement>("[role=radio]")
    focusable?.focus({ preventScroll: true })
  }, [isLinked, fromPage])

  if (isClaimed) return <div className={className}>{children}</div>

  return (
    <div
      ref={ref}
      data-anchor={anchorKey(anchor)}
      className={cn(
        "relative rounded-md outline-offset-2 transition-all duration-200 ease-out motion-reduce:transition-none",
        isLinked && "outline-2 outline-solid outline-violet-500 dark:outline-violet-400",
        isPreviewed && "outline-2 outline-solid outline-violet-300 dark:outline-violet-600",
        className,
      )}
    >
      {children}
    </div>
  )
}

function AutoTextarea({
  value,
  onChange,
  mono,
  label,
}: {
  value: string
  onChange: (value: string) => void
  mono?: boolean
  label: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }, [value])
  return (
    <Textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={1}
      aria-label={label}
      className={cn(
        "min-h-0 resize-none px-2.5 py-1.5 text-xs leading-relaxed md:text-xs",
        NO_INNER_RING,
        "transition-colors duration-200 ease-out motion-reduce:transition-none",
        "hover:border-violet-300 dark:hover:border-violet-500/50",
        mono && "font-mono",
      )}
    />
  )
}

function InlineTitle({
  value,
  onChange,
  label,
  editing,
  mono,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  editing: boolean
  mono?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const wasEditing = useRef(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!editing || !el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }, [editing, value])

  useEffect(() => {
    if (editing) {
      wasEditing.current = true
      ref.current?.focus({ preventScroll: true })
      return
    }
    if (!wasEditing.current) return
    wasEditing.current = false
    if (document.activeElement === document.body) {
      buttonRef.current?.focus({ preventScroll: true })
    }
  }, [editing])

  if (!editing) {
    return (
      <button
        ref={buttonRef}
        type="button"
        data-title-button="true"
        aria-label={`${label}: ${readableText(value)}`}
        className={cn(
          "flex min-w-0 flex-1 cursor-text items-center gap-1.5 rounded text-left text-xs font-medium",
          "transition-colors duration-200 hover:text-violet-700 motion-reduce:transition-none dark:hover:text-violet-300",
          "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-violet-400 focus-visible:outline-offset-2",
        )}
      >
        <span className="truncate">{readableText(value)}</span>
        {/* The title reads as plain text, so the affordance has to be standing
            — revealing it on hover only tells people who already guessed.
            Muted at rest, firming up with the rest of the card on hover.
            Decorative: the button's own label already carries the meaning. */}
        <Pencil
          className="h-3 w-3 shrink-0 text-muted-foreground/50 transition-colors duration-200 group-hover/card:text-muted-foreground motion-reduce:transition-none"
          aria-hidden="true"
        />
      </button>
    )
  }
  return (
    <Textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={1}
      aria-label={label}
      className={cn(
        "min-h-0 flex-1 resize-none px-2 py-1 text-xs leading-relaxed md:text-xs",
        NO_INNER_RING,
        mono && "font-mono",
      )}
    />
  )
}

function SectionHeading({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <div className="flex items-center gap-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {children}
      </h3>
      {count !== undefined && (
        <Badge
          variant="secondary"
          className="px-1.5 py-0 text-[11px] font-medium tabular-nums"
        >
          {count}
        </Badge>
      )}
    </div>
  )
}

function ItemIdChip({ itemId, hint }: { itemId: string; hint: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className="shrink-0 border-transparent bg-muted/60 px-1.5 font-mono text-[11px] font-normal text-muted-foreground/70"
        >
          {itemId}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  )
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <Label className="text-[11px] font-medium text-muted-foreground">{children}</Label>
  )
}

export function ClassicActivityPanel({
  open,
  onClose,
  bookLabel,
  leaves,
  answers,
  structure: rawStructure,
  outline,
  sectionType,
  activityTypes,
  onChangeType,
  onRegenerate,
  canRegenerate,
  onTextEdited,
  onAnswerEdited,
  onAnswersEdited,
  linkedAnchor,
  hoveredAnchor,
  linkedFromPage,
  onAnchorSelect,
  onAnchorHover,
  dirty,
  saving,
  onSave,
  onDiscard,
}: ClassicActivityPanelProps) {
  const { t } = useLingui()

  // Only FITB/MC get the structure's richer cards. Open-ended and underline now
  // extract into an EditableActivity too, but the classic editor renders them
  // entirely through the outline (as it did before they were extractable) — so
  // treat a structure of those kinds as "no rich structure" here.
  const structure =
    rawStructure &&
    (rawStructure.kind === "fill-in-the-blank" || rawStructure.kind === "multiple-choice")
      ? rawStructure
      : null

  const structureTextIds = useMemo(
    () => new Set(collectStructureTexts(structure).keys()),
    [structure],
  )
  const structureImageIds = useMemo(() => collectStructureImageIds(structure), [structure])
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
  // FITB/MC use the structure's richer cards; outline cards cover every other
  // type PLUS any answer unit a successful extraction didn't reach (e.g. a
  // checkbox group in an MC section) — never all-or-nothing, so no answer is
  // left without an editing surface.
  const visibleOutlineItems = useMemo(() => {
    if (!outline) return []
    if (!structure) return outline.items
    return outline.items.filter((item) =>
      [...item.inputs, ...item.options].every(
        (x) => !x.itemId || !groupedItemIds.has(x.itemId),
      ),
    )
  }, [outline, structure, groupedItemIds])
  const outlineTextIds = useMemo(
    () => new Set(collectOutlineTexts(outline, visibleOutlineItems).keys()),
    [outline, visibleOutlineItems],
  )
  const outlineImageIds = useMemo(
    () => collectOutlineItemImageIds(visibleOutlineItems),
    [visibleOutlineItems],
  )
  const outlineItemIds = useMemo(
    () => collectOutlineItemIds(visibleOutlineItems),
    [visibleOutlineItems],
  )

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
  // Includes boolean (correctness-flag) entries — an answer without a card
  // must still be visible and editable somewhere.
  const otherAnswerEntries = useMemo(
    () =>
      Object.entries(answers ?? {}).filter(
        ([itemId]) => !groupedItemIds.has(itemId) && !outlineItemIds.has(itemId),
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

  const [panelWidth, setPanelWidth] = useState(readStoredWidth)
  const startResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      const grip = e.currentTarget
      const pointerId = e.pointerId
      const startX = e.clientX
      const startWidth = panelWidth
      const clamp = (ev: PointerEvent) =>
        Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, startWidth + (startX - ev.clientX)))

      const onMove = (ev: PointerEvent) => setPanelWidth(clamp(ev))
      const finish = (ev: PointerEvent) => {
        grip.removeEventListener("pointermove", onMove)
        grip.removeEventListener("pointerup", finish)
        grip.removeEventListener("pointercancel", finish)
        grip.releasePointerCapture?.(pointerId)
        writeStoredWidth(clamp(ev))
      }

      grip.setPointerCapture?.(pointerId)
      grip.addEventListener("pointermove", onMove)
      grip.addEventListener("pointerup", finish)
      grip.addEventListener("pointercancel", finish)
    },
    [panelWidth],
  )

  const [hintDismissed, setHintDismissed] = useState(readHintDismissed)
  const dismissHint = useCallback(() => {
    try {
      localStorage.setItem(HINT_DISMISSED_STORAGE_KEY, "1")
    } catch {
    }
    setHintDismissed(true)
  }, [])

  const handleTextChange = (dataId: string, value: string) => {
    setTexts((prev) => ({ ...prev, [dataId]: value }))
    onTextEdited(dataId, value)
  }

  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault()
        if (dirty && !saving) onSave()
        return
      }
      if (e.key !== "Escape") return
      if (linkedAnchor) {
        e.preventDefault()
        ;(document.activeElement as HTMLElement | null)?.blur()
        onAnchorSelect(null)
      } else if (panelRef.current?.contains(document.activeElement)) {
        onClose()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, dirty, saving, onSave, onClose, linkedAnchor, onAnchorSelect])

  const linkContext = useMemo<LinkContextValue>(
    () => ({
      linked: linkedAnchor,
      hovered: hoveredAnchor,
      fromPage: linkedFromPage,
    }),
    [linkedAnchor, hoveredAnchor, linkedFromPage],
  )

  const anchorAt = (target: EventTarget | null): ActivityAnchor | null =>
    parseAnchorKey(
      (target as HTMLElement | null)?.closest?.("[data-anchor]")?.getAttribute("data-anchor"),
    )
  const linkDelegation = {
    onMouseOver: (e: React.MouseEvent) => onAnchorHover(anchorAt(e.target)),
    onMouseLeave: () => onAnchorHover(null),
    onClick: (e: React.MouseEvent) => onAnchorSelect(anchorAt(e.target)),
    onFocusCapture: (e: React.FocusEvent) => {
      if ((e.target as HTMLElement).dataset?.titleButton) return
      const anchor = anchorAt(e.target)
      if (anchor) onAnchorSelect(anchor)
    },
  }

  const textField = (dataId: string, mono: boolean, label: string) => (
    <Anchored anchor={textAnchor(dataId)}>
      <AutoTextarea
        value={texts[dataId] ?? ""}
        onChange={(value) => handleTextChange(dataId, value)}
        mono={mono}
        label={label}
      />
    </Anchored>
  )

  const captionedText = (entry: ActivityOutlineText, label: string) => (
    <div className="space-y-1">
      <FieldLabel>{label}</FieldLabel>
      {entry.dataId ? (
        textField(entry.dataId, false, label)
      ) : (
        <p className="text-xs leading-relaxed text-muted-foreground">{entry.text}</p>
      )}
    </div>
  )

  const answerInput = (itemId: string) => (
    <Input
      value={String(answers?.[itemId] ?? "")}
      onChange={(e) => onAnswerEdited(itemId, e.target.value)}
      placeholder={t`Correct answer (alternatives separated by |)`}
      aria-label={t`Correct answer`}
      className={cn(
        "h-7 border-emerald-300 bg-white text-xs dark:border-emerald-500/40 dark:bg-emerald-950/30",
        NO_INNER_RING,
      )}
    />
  )

  const answerField = (itemId: string) => (
    <div key={itemId} className="flex items-center gap-2">
      <Anchored anchor={answerAnchor(itemId)} className="flex-1">
        {answerInput(itemId)}
      </Anchored>
      <ItemIdChip itemId={itemId} hint={t`Answer key reference`} />
    </div>
  )

  const answersHeading = (label: ReactNode) => (
    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
      <Check className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  )

  const answerZone = (children: ReactNode) => (
    <div className="space-y-2 border-l-2 border-emerald-400 pl-2.5 dark:border-emerald-500/60">
      {children}
    </div>
  )

  const imageThumb = (imageId: string, className: string, alt?: string) => (
    <Anchored key={imageId} anchor={imageAnchor(imageId)} className="inline-flex">
      <img
        src={`${BASE_URL}/books/${bookLabel}/images/${imageId}`}
        alt={alt ?? ""}
        title={imageId}
        className={className}
      />
    </Anchored>
  )

  const ANSWER_AREA_CLASS = "space-y-2 rounded-md border border-dashed bg-muted/40 p-2.5"

  const answerArea = (itemId: string | undefined, index: number, children: ReactNode) =>
    itemId ? (
      <Anchored key={itemId} anchor={answerAnchor(itemId)} className={ANSWER_AREA_CLASS}>
        {children}
      </Anchored>
    ) : (
      <div key={index} className={ANSWER_AREA_CLASS}>
        {children}
      </div>
    )

  const optionRow = (itemId: string | undefined, index: number, children: ReactNode) =>
    itemId ? (
      <Anchored key={itemId} anchor={answerAnchor(itemId)} className="flex items-center gap-2">
        {children}
      </Anchored>
    ) : (
      <div key={index} className="flex items-center gap-2">
        {children}
      </div>
    )

  const correctRadio = (value: string, disabled = false) => (
    <RadioGroupItem
      value={value}
      disabled={disabled}
      aria-label={t`Correct answer`}
      title={disabled ? t`This option has no answer key entry` : undefined}
      className="shrink-0 border-emerald-500 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400"
    />
  )

  const correctOf = (ids: (string | undefined)[]) =>
    ids.find((id) => id && isCorrectAnswer(answers?.[id])) ?? NO_CHOICE_ID

  const selectedValueOf = (item: ActivityOutlineItem, itemId: string): string => {
    const stored = String(answers?.[itemId] ?? "").trim().toLowerCase()
    if (!stored) return NO_CHOICE_ID
    const match = item.options.find((o) => (o.value ?? "").trim().toLowerCase() === stored)
    return match?.value ?? NO_CHOICE_ID
  }

  const optionTextControl = (item: ActivityOutlineItem, optIndex: number) => {
    const o = item.options[optIndex]
    if (o.text?.dataId) {
      const dataId = o.text.dataId
      return (
        <Anchored anchor={textAnchor(dataId)} className="flex-1">
          <Input
            value={texts[dataId] ?? ""}
            onChange={(e) => handleTextChange(dataId, e.target.value)}
            placeholder={t`Option text`}
            aria-label={t`Option text`}
            className={cn("h-7 text-xs", NO_INNER_RING)}
          />
        </Anchored>
      )
    }
    return (
      <span className="flex-1 text-xs text-muted-foreground">
        {o.text?.text ?? o.itemId ?? o.value ?? ""}
      </span>
    )
  }

  const CARD_CLASS =
    "group/card space-y-2.5 rounded-lg border bg-card p-3 transition-colors duration-200 ease-out hover:border-muted-foreground/30 motion-reduce:transition-none"

  const itemCard = (opts: {
    key: string
    index: number
    label: string
    titleField?: { dataId: string; label: string; mono?: boolean }
    anchor?: ActivityAnchor
    itemId?: string
    unanswered?: boolean
    children: ReactNode
  }) => {
    const isSelected = Boolean(opts.anchor && sameAnchor(linkedAnchor, opts.anchor))
    const editingTitle = Boolean(opts.titleField) && isSelected
    const head = (
      <>
        <div className={cn("flex gap-2", editingTitle ? "items-start" : "items-center")}>
          <span
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-semibold tabular-nums text-muted-foreground",
              editingTitle && "mt-0.5",
            )}
          >
            {opts.index}
          </span>
          {opts.titleField ? (
            <InlineTitle
              value={texts[opts.titleField.dataId] ?? ""}
              onChange={(v) => handleTextChange(opts.titleField!.dataId, v)}
              label={opts.titleField.label}
              mono={opts.titleField.mono}
              editing={editingTitle}
            />
          ) : (
            <span className="min-w-0 flex-1 truncate text-xs font-medium">{opts.label}</span>
          )}
          {opts.unanswered && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                  aria-label={t`No answer set`}
                />
              </TooltipTrigger>
              <TooltipContent>{t`No answer set`}</TooltipContent>
            </Tooltip>
          )}
          {opts.itemId && <ItemIdChip itemId={opts.itemId} hint={t`Answer key reference`} />}
        </div>
        {opts.children}
      </>
    )
    if (!opts.anchor) {
      return (
        <div key={opts.key} className={CARD_CLASS}>
          {head}
        </div>
      )
    }
    return (
      <Anchored
        key={opts.key}
        anchor={opts.anchor}
        className={cn(
          CARD_CLASS,
          "cursor-pointer [&_input]:cursor-auto [&_textarea]:cursor-auto [&_input[type=checkbox]]:cursor-pointer",
        )}
      >
        {/* Inside the Anchored, not around it — the card must not read its own
            claim and render itself inert. */}
        <ClaimedAnchorContext.Provider value={anchorKey(opts.anchor)}>
          {head}
        </ClaimedAnchorContext.Provider>
      </Anchored>
    )
  }

  const outlineItemCard = (item: ActivityOutlineItem, i: number) => {
    const valueItemId = item.choice === "value" ? item.options[0]?.itemId : undefined
    const anchorItemId = item.inputs[0]?.itemId ?? valueItemId
    const cardAnchor = item.prompts[0]?.dataId
      ? textAnchor(item.prompts[0].dataId)
      : item.number?.dataId
        ? textAnchor(item.number.dataId)
        : anchorItemId
          ? answerAnchor(anchorItemId)
          : undefined

    const filled: boolean[] = []
    for (const input of item.inputs) {
      const id = input.itemId
      if (id && answers && id in answers && typeof answers[id] !== "boolean") {
        filled.push(Boolean(String(answers[id] ?? "").trim()))
      }
    }
    if (item.choice === "value" && valueItemId) {
      filled.push(Boolean(String(answers?.[valueItemId] ?? "").trim()))
    } else if (
      (item.choice === "single" || item.choice === "multi") &&
      item.options.length > 0
    ) {
      filled.push(item.options.some((o) => isCorrectAnswer(answers?.[o.itemId ?? ""])))
    }

    const titlePrompt = item.prompts[0]?.dataId ? item.prompts[0] : undefined
    const bodyPrompts = item.prompts.filter((p) => p !== titlePrompt)

    return itemCard({
      key: String(i),
      index: i + 1,
      label: item.options.length > 0 ? t`Question` : t`Item`,
      titleField: titlePrompt?.dataId
        ? { dataId: titlePrompt.dataId, label: t`Instruction` }
        : undefined,
      unanswered: filled.length > 0 && filled.some((ok) => !ok),
      anchor: cardAnchor,
      itemId: anchorItemId,
      children: (
        <>
          {item.number?.dataId && (
            <div className="space-y-1">
              <FieldLabel>{t`Label`}</FieldLabel>
              <Anchored anchor={textAnchor(item.number.dataId)} className="w-24">
                <Input
                  value={texts[item.number.dataId] ?? ""}
                  onChange={(e) => handleTextChange(item.number!.dataId!, e.target.value)}
                  className={cn("h-7 text-xs", NO_INNER_RING)}
                  aria-label={t`Label`}
                />
              </Anchored>
            </div>
          )}
          {bodyPrompts.length > 0 && (
            <div className="space-y-1">
              <FieldLabel>{t`Instruction`}</FieldLabel>
              {bodyPrompts.map((p, pi) =>
                p.dataId ? (
                  <div key={p.dataId}>{textField(p.dataId, false, t`Instruction`)}</div>
                ) : (
                  <p key={pi} className="text-xs leading-relaxed text-muted-foreground">
                    {p.text}
                  </p>
                ),
              )}
            </div>
          )}
          {item.imageIds.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {item.imageIds.map((id) =>
                imageThumb(id, "max-h-24 rounded border object-contain"),
              )}
            </div>
          )}
          {/* Writable answer areas — visually distinct from the editable
              question texts above. Anchored even when the answer accepts
              anything, so clicking the blank in the page still lands here. */}
          {item.inputs.map((input, k) =>
            answerArea(
              input.itemId,
              k,
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                    <TextCursorInput className="h-3.5 w-3.5" aria-hidden="true" />
                    {t`Answer area`}
                  </span>
                  <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[11px] font-normal">
                    {input.kind === "textarea"
                      ? t`Long answer`
                      : input.kind === "select"
                        ? t`Dropdown`
                        : t`Short answer`}
                  </Badge>
                </div>
                {input.itemId &&
                answers &&
                input.itemId in answers &&
                typeof answers[input.itemId] !== "boolean" ? (
                  <div className="flex items-center gap-2">
                    {answerInput(input.itemId)}
                    <ItemIdChip itemId={input.itemId} hint={t`Answer key reference`} />
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">{t`Accepts any answer`}</p>
                )}
              </>,
            ),
          )}
          {/* True/false-style: options share one item-id, the answer is the
              selected option's value. Options without value attributes can't
              drive radios — fall back to the raw answer field. */}
          {item.choice === "value" &&
            item.options.length > 0 &&
            valueItemId &&
            (item.options.every((o) => o.value !== undefined)
              ? answerZone(
                  <>
                    {answersHeading(t`Answer`)}
                    {/* The options share one item-id — the whole row is that
                        single answer, so it anchors as one unit. */}
                    <Anchored anchor={answerAnchor(valueItemId)}>
                      <RadioGroup
                        value={selectedValueOf(item, valueItemId)}
                        onValueChange={(v) => onAnswersEdited({ [valueItemId]: v })}
                        className="flex flex-wrap items-center gap-4"
                      >
                        {item.options.map((o, oi) => (
                          <div key={oi} className="flex items-center gap-1.5">
                            {correctRadio(o.value!)}
                            {o.text?.dataId ? (
                              <Anchored anchor={textAnchor(o.text.dataId)} className="w-16">
                                <Input
                                  value={texts[o.text.dataId] ?? ""}
                                  onChange={(e) =>
                                    handleTextChange(o.text!.dataId!, e.target.value)
                                  }
                                  className={cn("h-7 text-xs", NO_INNER_RING)}
                                  aria-label={t`Option text`}
                                />
                              </Anchored>
                            ) : (
                              <span className="text-xs">{o.text?.text ?? o.value}</span>
                            )}
                          </div>
                        ))}
                      </RadioGroup>
                    </Anchored>
                  </>,
                )
              : answers &&
                  valueItemId in answers &&
                  typeof answers[valueItemId] !== "boolean"
                ? answerZone(
                    <>
                      {answersHeading(t`Answer`)}
                      {answerField(valueItemId)}
                    </>,
                  )
                : null)}
          {/* Single-choice (MC-style): the selected radio marks the correct
              option. Multi-select: every checked option is correct. */}
          {item.choice === "single" &&
            item.options.length > 0 &&
            answerZone(
              <>
                {answersHeading(t`Options — the selected radio marks the correct answer`)}
                <RadioGroup
                  value={correctOf(item.options.map((o) => o.itemId))}
                  onValueChange={(id) => {
                    if (!item.options.some((x) => x.itemId === id)) return
                    onAnswersEdited(
                      Object.fromEntries(
                        item.options.filter((x) => x.itemId).map((x) => [x.itemId!, x.itemId === id]),
                      ),
                    )
                  }}
                  className="gap-2"
                >
                  {item.options.map((o, oi) =>
                    optionRow(o.itemId, oi, (
                      <>
                        {correctRadio(o.itemId ?? `${NO_CHOICE_ID}-${oi}`, !o.itemId)}
                        {o.imageId &&
                          imageThumb(o.imageId, "h-8 w-8 rounded border object-cover shrink-0")}
                        {optionTextControl(item, oi)}
                      </>
                    )),
                  )}
                </RadioGroup>
              </>,
            )}
          {item.choice === "multi" &&
            item.options.length > 0 &&
            answerZone(
              <>
                {answersHeading(t`Options — checked options are the correct answers`)}
                {item.options.map((o, oi) =>
                  optionRow(o.itemId, oi, (
                    <>
                      <input
                        type="checkbox"
                        checked={isCorrectAnswer(answers?.[o.itemId ?? ""])}
                        onChange={(e) => {
                          if (o.itemId) onAnswersEdited({ [o.itemId]: e.target.checked })
                        }}
                        aria-label={t`Correct answer`}
                        className="h-4 w-4 shrink-0 cursor-pointer accent-emerald-600"
                      />
                      {o.imageId &&
                        imageThumb(o.imageId, "h-8 w-8 rounded border object-cover shrink-0")}
                      {optionTextControl(item, oi)}
                    </>
                  )),
                )}
              </>,
            )}
        </>
      ),
    })
  }

  // Per-field fallback: whatever the outline missed but the extractor found
  // must still be visible and editable.
  const headerTexts = {
    title: outline?.title ?? (structure?.title?.dataId ? structure.title : undefined),
    badges: outline?.badges ?? [],
    instructions:
      outline && outline.instructions.length > 0
        ? outline.instructions
        : structure?.instructions?.dataId
          ? [structure.instructions]
          : [],
  }
  const hasHeader =
    headerTexts.title !== undefined ||
    headerTexts.badges.length > 0 ||
    headerTexts.instructions.length > 0

  const isEmpty =
    !hasHeader &&
    !structure &&
    visibleOutlineItems.length === 0 &&
    otherAnswerEntries.length === 0 &&
    otherTextLeaves.length === 0 &&
    otherImageLeaves.length === 0

  return (
    <div
      ref={panelRef}
      // inert while closed — the panel is only moved off-screen by the
      // transform, so without it Tab still reaches its inputs and the browser
      // scrolls the hidden panel into view.
      inert={!open}
      style={{ width: panelWidth }}
      className={cn(
        "absolute top-0 right-0 z-30 flex h-full flex-col border-l bg-background shadow-xl",
        "transition-transform duration-200 ease-out motion-reduce:transition-none",
        open ? "translate-x-0" : "translate-x-full",
      )}
    >
      {/* Drag-to-resize edge */}
      <div
        onPointerDown={startResize}
        role="separator"
        aria-orientation="vertical"
        aria-label={t`Resize panel`}
        className="absolute inset-y-0 left-0 z-40 w-1.5 cursor-col-resize bg-transparent transition-colors duration-200 hover:bg-violet-400/50 motion-reduce:transition-none"
      />

      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
          <Puzzle className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <h2 className="flex-1 text-sm font-semibold">{t`Activity content`}</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-7 w-7 text-muted-foreground"
          aria-label={t`Close`}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Link affordance — the panel and the page are one surface. Explains
          itself once, then gets out of the way; the pinned state always shows,
          since that one is a mode the user needs a way out of. */}
      {(linkedAnchor || !hintDismissed) && (
        <div className="flex shrink-0 items-start gap-2 border-b bg-violet-50/60 px-4 py-2 dark:bg-violet-500/10">
          <MousePointerClick
            className="mt-px h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-300"
            aria-hidden="true"
          />
          <p className="flex-1 text-[11px] leading-snug text-muted-foreground">
            {linkedAnchor
              ? t`Pinned to one element — press Esc to release it and go back to previewing on hover.`
              : t`Hover a card to find it in the page and click to pin it — or click anything in the page to edit it here.`}
          </p>
          {!linkedAnchor && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={dismissHint}
              className="-my-0.5 h-5 w-5 shrink-0 text-muted-foreground"
              aria-label={t`Dismiss`}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}

      {/* Activity type + regenerate — pinned so it stays reachable in long
          activities. */}
      {activityTypes && sectionType && (
        <div className="shrink-0 space-y-1.5 border-b px-4 py-2.5">
          <FieldLabel>{t`Activity type`}</FieldLabel>
          <div className="flex items-center gap-2">
            <Select value={sectionType} onValueChange={onChangeType}>
              <SelectTrigger className="h-7 min-w-0 flex-1 text-xs" aria-label={t`Activity type`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {!(sectionType in activityTypes) && (
                  <SelectItem value={sectionType} className="text-xs">
                    {getSectionTypeLabel(sectionType)}
                  </SelectItem>
                )}
                {/* The config values are LLM-facing descriptions — show the
                    human name and keep the description as a hover tooltip. */}
                {Object.entries(activityTypes).map(([key, description]) => (
                  <SelectItem key={key} value={key} title={description} className="text-xs">
                    {getSectionTypeLabel(key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onRegenerate}
                    disabled={!canRegenerate}
                    className="h-7 gap-1.5 border-violet-300 px-2.5 text-xs font-medium text-violet-700 hover:bg-violet-50 hover:text-violet-800 dark:border-violet-500/40 dark:text-violet-300 dark:hover:bg-violet-500/10"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {t`Regenerate`}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {t`Regenerate this activity with AI (requires a saved state and an API key)`}
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t`Changing the type regenerates the activity when you save.`}
          </p>
        </div>
      )}

      {/* Form */}
      <LinkContext.Provider value={linkContext}>
        <ScrollArea className="min-h-0 flex-1" {...linkDelegation}>
          <div className="space-y-5 p-4">
            {isEmpty && (
              <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <Puzzle className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                </span>
                <p className="text-xs font-medium">{t`Nothing to edit yet`}</p>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {t`This activity has no addressable text or answers. Regenerate it, or use "Edit layout" to change the page directly.`}
                </p>
              </div>
            )}

            {/* Page header: title, badges, instructions — pinned at the top for
                every activity type. */}
            {hasHeader && (
              <div className="space-y-2">
                <SectionHeading>{t`Header`}</SectionHeading>
                {headerTexts.title && captionedText(headerTexts.title, t`Title`)}
                {headerTexts.badges.map((b, bi) => (
                  <div key={b.dataId ?? bi} className="space-y-1">
                    <FieldLabel>{t`Badge`}</FieldLabel>
                    {b.dataId ? (
                      <Anchored anchor={textAnchor(b.dataId)} className="w-40">
                        <Input
                          value={texts[b.dataId] ?? ""}
                          onChange={(e) => handleTextChange(b.dataId!, e.target.value)}
                          className={cn("h-7 text-xs", NO_INNER_RING)}
                          aria-label={t`Badge`}
                        />
                      </Anchored>
                    ) : (
                      <p className="text-xs text-muted-foreground">{b.text}</p>
                    )}
                  </div>
                ))}
                {headerTexts.instructions.length > 0 && (
                  <div className="space-y-1">
                    <FieldLabel>{t`Instructions`}</FieldLabel>
                    {headerTexts.instructions.map((ins, ii) =>
                      ins.dataId ? (
                        <div key={ins.dataId}>
                          {textField(ins.dataId, false, t`Instructions`)}
                        </div>
                      ) : (
                        <p key={ii} className="text-xs leading-relaxed text-muted-foreground">
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
              <div className="space-y-2.5">
                <SectionHeading count={structure.steps.length}>{t`Items`}</SectionHeading>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {t`Select an item to edit its text — [[blank:…]] marks where a blank appears, so keep it to keep the blank.`}
                </p>
                {structure.steps.map((step, si) => {
                  const titleSentence = step.sentences.find((s) => s.dataId)
                  return itemCard({
                    key: step.id,
                    index: si + 1,
                    label: t`Item`,
                    titleField: titleSentence?.dataId
                      ? {
                          dataId: titleSentence.dataId,
                          label: t`Sentence with blank markers`,
                          mono: true,
                        }
                      : undefined,
                    unanswered: step.blanks.some(
                      (b) => !String(answers?.[b.itemId] ?? "").trim(),
                    ),
                    anchor: titleSentence?.dataId
                      ? textAnchor(titleSentence.dataId)
                      : step.blanks[0]
                        ? answerAnchor(step.blanks[0].itemId)
                        : undefined,
                    children: (
                      <>
                        {step.image && (
                          <img
                            src={imageSrc(bookLabel, step.image)}
                            alt={step.image.alt ?? ""}
                            className="max-h-24 rounded border object-contain"
                          />
                        )}
                        {step.sentences
                          .filter((s) => s !== titleSentence)
                          .map((sentence, sni) =>
                            sentence.dataId ? (
                              <div key={sni}>
                                {textField(sentence.dataId, true, t`Sentence with blank markers`)}
                              </div>
                            ) : (
                              <p key={sni} className="font-mono text-xs text-muted-foreground">
                                {sentence.text}
                              </p>
                            ),
                          )}
                        {answerZone(
                          <>
                            {answersHeading(
                              step.blanks.length === 1 ? t`Answer` : t`Answers`,
                            )}
                            {step.blanks.map((blank) => answerField(blank.itemId))}
                          </>,
                        )}
                      </>
                    ),
                  })
                })}
              </div>
            )}

            {structure && structure.kind === "multiple-choice" && (
              <div className="space-y-2.5">
                <SectionHeading count={structure.steps.length}>{t`Questions`}</SectionHeading>
                {structure.steps.map((step, si) =>
                  itemCard({
                    key: step.id,
                    index: si + 1,
                    label: t`Question`,
                    titleField: step.prompt?.dataId
                      ? { dataId: step.prompt.dataId, label: t`Question prompt` }
                      : undefined,
                    unanswered: !step.options.some((o) =>
                      isCorrectAnswer(answers?.[o.itemId]),
                    ),
                    anchor: step.prompt?.dataId
                      ? textAnchor(step.prompt.dataId)
                      : step.options[0]
                        ? answerAnchor(step.options[0].itemId)
                        : undefined,
                    children: (
                      <>
                        {step.image && (
                          <img
                            src={imageSrc(bookLabel, step.image)}
                            alt={step.image.alt ?? ""}
                            className="max-h-24 rounded border object-contain"
                          />
                        )}
                        {/* The prompt lives in the card title — see itemCard. */}
                        {answerZone(
                          <>
                            {answersHeading(
                              t`Options — the selected radio marks the correct answer`,
                            )}
                            <RadioGroup
                              value={correctOf(step.options.map((o) => o.itemId))}
                              onValueChange={(id) =>
                                onAnswersEdited(
                                  Object.fromEntries(
                                    step.options.map((o) => [o.itemId, o.itemId === id]),
                                  ),
                                )
                              }
                              className="gap-2"
                            >
                              {step.options.map((option, oi) =>
                                optionRow(option.itemId, oi, (
                                  <>
                                    {correctRadio(option.itemId)}
                                    {option.image && (
                                      <img
                                        src={imageSrc(bookLabel, option.image)}
                                        alt={option.image.alt ?? ""}
                                        className="h-8 w-8 shrink-0 rounded border object-cover"
                                      />
                                    )}
                                    {option.text?.dataId ? (
                                      <Anchored
                                        anchor={textAnchor(option.text.dataId)}
                                        className="flex-1"
                                      >
                                        <Input
                                          value={texts[option.text.dataId] ?? ""}
                                          onChange={(e) =>
                                            handleTextChange(
                                              option.text!.dataId!,
                                              e.target.value,
                                            )
                                          }
                                          placeholder={t`Option text`}
                                          aria-label={t`Option text`}
                                          className={cn("h-7 text-xs", NO_INNER_RING)}
                                        />
                                      </Anchored>
                                    ) : (
                                      <span className="flex-1 text-xs text-muted-foreground">
                                        {option.text?.text ?? option.itemId}
                                      </span>
                                    )}
                                  </>
                                )),
                              )}
                            </RadioGroup>
                          </>,
                        )}
                      </>
                    ),
                  }),
                )}
              </div>
            )}

            {/* Outline item cards — every activity type the structure doesn't
                cover (open-ended, true/false, multi-select, tables), plus answer
                units a successful FITB/MC extraction missed. */}
            {visibleOutlineItems.length > 0 && (
              <div className="space-y-2.5">
                <SectionHeading count={visibleOutlineItems.length}>
                  {structure ? t`Other items` : t`Items`}
                </SectionHeading>
                {visibleOutlineItems.map((item, i) => outlineItemCard(item, i))}
              </div>
            )}

            {/* Ungrouped answers (flat — always shown when present). Boolean
                entries are correctness flags: checked = correct. */}
            {otherAnswerEntries.length > 0 &&
              answerZone(
                <>
                  {answersHeading(
                    otherAnswerEntries.length === 1 ? t`Answer` : t`Answers`,
                  )}
                  {otherAnswerEntries.map(([itemId, value]) =>
                    typeof value === "boolean" ? (
                      <Anchored key={itemId} anchor={answerAnchor(itemId)}>
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isCorrectAnswer(value)}
                            onChange={(e) => onAnswersEdited({ [itemId]: e.target.checked })}
                            aria-label={t`Correct answer`}
                            className="h-4 w-4 shrink-0 cursor-pointer accent-emerald-600"
                          />
                          <ItemIdChip itemId={itemId} hint={t`Answer key reference`} />
                        </label>
                      </Anchored>
                    ) : (
                      answerField(itemId)
                    ),
                  )}
                </>,
              )}

            {/* Ungrouped texts */}
            {otherTextLeaves.length > 0 && (
              <div className="space-y-2">
                <SectionHeading count={otherTextLeaves.length}>
                  {structure || visibleOutlineItems.length > 0 ? t`Other text` : t`Text`}
                </SectionHeading>
                {otherTextLeaves.map((leaf) => (
                  <div key={leaf.nodeId} className="space-y-1">
                    {leaf.role && leaf.role !== "paragraph" && (
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {leaf.role}
                      </span>
                    )}
                    {textField(leaf.nodeId, false, t`Activity text`)}
                  </div>
                ))}
              </div>
            )}

            {/* Ungrouped images (read-only — swapping happens in the layout editor) */}
            {otherImageLeaves.length > 0 && (
              <div className="space-y-2">
                <SectionHeading count={otherImageLeaves.length}>
                  <span className="flex items-center gap-1.5">
                    <ImageIcon className="h-3 w-3" aria-hidden="true" />
                    {t`Images`}
                  </span>
                </SectionHeading>
                <div className="grid grid-cols-3 gap-2">
                  {otherImageLeaves.map((leaf) =>
                    imageThumb(
                      leaf.nodeId,
                      "h-20 w-full rounded border bg-white object-contain",
                      leaf.text ?? "",
                    ),
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {t`To replace an image, use "Edit layout" and click the image.`}
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </LinkContext.Provider>

      {/* Save bar */}
      <div className="flex shrink-0 items-center gap-2 border-t bg-background p-3">
        <span className="flex flex-1 items-center gap-1.5 text-[11px] text-muted-foreground">
          {dirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />}
          {dirty ? t`Unsaved changes` : t`All changes saved`}
        </span>
        <Button
          type="button"
          variant="secondary"
          onClick={onDiscard}
          disabled={!dirty || saving}
          className="h-8 px-3 text-xs"
        >
          {t`Discard`}
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                type="button"
                onClick={onSave}
                disabled={!dirty || saving}
                className="h-8 gap-1.5 bg-violet-600 px-4 text-xs text-white hover:bg-violet-700"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                {saving ? t`Saving…` : t`Save activity`}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{t`Save activity (⌘S)`}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
