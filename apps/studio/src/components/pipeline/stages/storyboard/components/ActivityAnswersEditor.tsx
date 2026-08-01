import { useMemo } from "react"
import { X } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  parseActivityLabels,
  parseItemTokens,
  type ActivityItem,
} from "../lib/activity-answer-labels"

// eslint-disable-next-line lingui/no-unlocalized-strings -- internal Select sentinel, never shown to users
const NONE = "__none__"

interface ActivityAnswersEditorProps {
  answers: Record<string, string | boolean | number>
  /** The section's rendered HTML — source of the slot/item labels AND, for
   *  custom activities, the grader's actual answer key. */
  html?: string
  onUpdateAnswer: (key: string, value: string) => void
  disabled?: boolean
}

function numPrefix(s: string): number {
  return parseInt(s.replace(/\D/g, ""), 10) || 0
}

/** A tile shown by its label with the raw id kept visible (muted) alongside. */
function ItemTag({ id, label }: { id: string; label?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span>{label || id}</span>
      {label ? (
        <span className="text-[10px] font-mono text-muted-foreground">{id}</span>
      ) : null}
    </span>
  )
}

/**
 * Answer editor for activities. Drag-and-drop answers are shown and edited by
 * their visible labels ("Top left space → Tile D") with dropdowns of the real
 * tiles, instead of the opaque "slot-1 → item-1" stored in the answer key. The
 * tile id is kept visible next to each label. Literal answers (crossword cells,
 * fill-in slots) keep a free-text input.
 *
 * For custom activities the displayed values come from the HTML's
 * `data-correct-items` / `data-answer` — the SAME attributes the inline grader
 * reads — so the panel always reflects what actually grades (and any drift from
 * the derived `activityAnswers` map self-heals when the user edits).
 */
export function ActivityAnswersEditor({
  answers,
  html,
  onUpdateAnswer,
  disabled,
}: ActivityAnswersEditorProps) {
  const { t } = useLingui()
  const labels = useMemo(() => parseActivityLabels(html ?? ""), [html])

  // The HTML answer key wins over the derived map; fall back to it for
  // templated activities (which carry no answer attributes in their HTML).
  const valueOf = (key: string): string =>
    key in labels.htmlAnswers
      ? labels.htmlAnswers[key]
      : String(answers[key] ?? "")

  const keys = useMemo(() => {
    const set = new Set<string>([
      ...Object.keys(answers),
      ...Object.keys(labels.htmlAnswers),
    ])
    return Array.from(set).sort((a, b) => numPrefix(a) - numPrefix(b))
  }, [answers, labels.htmlAnswers])

  // A drop-target answer whose value references known tiles → edit by label.
  const isItemBased = (key: string): boolean =>
    labels.items.length > 0 &&
    key in labels.targetLabels &&
    parseItemTokens(valueOf(key)).every((tok) => tok in labels.itemLabels)

  // Single-assignment (jigsaw) when no item-based slot holds more than one tile.
  const singleMode = keys.every(
    (k) => !isItemBased(k) || parseItemTokens(valueOf(k)).length <= 1,
  )

  return (
    <div>
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
        {t`Answers`}
      </h3>
      <div className="space-y-2">
        {keys.map((key) => {
          if (isItemBased(key)) {
            return (
              <ItemAnswerRow
                key={key}
                slotKey={key}
                slotLabel={labels.targetLabels[key]}
                selected={parseItemTokens(valueOf(key))}
                items={labels.items}
                itemLabels={labels.itemLabels}
                singleMode={singleMode}
                onUpdate={onUpdateAnswer}
                disabled={disabled}
                noneLabel={t`— none —`}
                addLabel={t`Add tile`}
              />
            )
          }
          return (
            <LiteralAnswerRow
              key={key}
              answerKey={key}
              label={labels.targetLabels[key]}
              value={valueOf(key)}
              onUpdate={onUpdateAnswer}
              disabled={disabled}
            />
          )
        })}
      </div>
    </div>
  )
}

function SlotHeader({ label, id }: { label?: string; id: string }) {
  return (
    <div className="flex items-baseline gap-2 mb-1">
      <span className="text-xs font-medium text-foreground">{label || id}</span>
      {label ? (
        <span className="text-[10px] font-mono text-muted-foreground">{id}</span>
      ) : null}
    </div>
  )
}

function ItemAnswerRow({
  slotKey,
  slotLabel,
  selected,
  items,
  itemLabels,
  singleMode,
  onUpdate,
  disabled,
  noneLabel,
  addLabel,
}: {
  slotKey: string
  slotLabel?: string
  selected: string[]
  items: ActivityItem[]
  itemLabels: Record<string, string>
  singleMode: boolean
  onUpdate: (key: string, value: string) => void
  disabled?: boolean
  noneLabel: string
  addLabel: string
}) {
  const remaining = items.filter((it) => !selected.includes(it.id))
  const current = selected[0]

  return (
    <div className="px-3 py-2 rounded border bg-amber-50/60">
      <SlotHeader label={slotLabel} id={slotKey} />

      {singleMode ? (
        <Select
          value={current ?? NONE}
          onValueChange={(v) => onUpdate(slotKey, v === NONE ? "" : v)}
          disabled={disabled}
        >
          <SelectTrigger className="h-7 text-xs bg-white">
            <SelectValue>
              {current ? (
                <ItemTag id={current} label={itemLabels[current]} />
              ) : (
                <span className="text-muted-foreground">{noneLabel}</span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE} className="text-xs text-muted-foreground">
              {noneLabel}
            </SelectItem>
            {items.map((it) => (
              <SelectItem key={it.id} value={it.id} className="text-xs">
                <ItemTag id={it.id} label={it.label} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          {selected.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 text-[11px] rounded bg-amber-100 text-amber-900 pl-2 pr-1 py-0.5"
            >
              <ItemTag id={id} label={itemLabels[id]} />
              <button
                type="button"
                onClick={() =>
                  onUpdate(slotKey, selected.filter((x) => x !== id).join(","))
                }
                disabled={disabled}
                className="rounded hover:bg-amber-200 disabled:opacity-40 cursor-pointer disabled:cursor-default"
                title={itemLabels[id] || id}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {remaining.length > 0 ? (
            <Select
              value=""
              onValueChange={(v) => onUpdate(slotKey, [...selected, v].join(","))}
              disabled={disabled}
            >
              <SelectTrigger className="h-6 w-auto gap-1 text-[11px] px-2 py-0 bg-white border-dashed">
                <SelectValue placeholder={addLabel} />
              </SelectTrigger>
              <SelectContent>
                {remaining.map((it) => (
                  <SelectItem key={it.id} value={it.id} className="text-xs">
                    <ItemTag id={it.id} label={it.label} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      )}
    </div>
  )
}

function LiteralAnswerRow({
  answerKey,
  label,
  value,
  onUpdate,
  disabled,
}: {
  answerKey: string
  label?: string
  value: string
  onUpdate: (key: string, value: string) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded border bg-amber-50/60">
      <span className="shrink-0 text-[10px] font-medium text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">
        {label || answerKey}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onUpdate(answerKey, e.target.value)}
        disabled={disabled}
        className="flex-1 min-w-0 text-xs rounded border border-transparent bg-transparent px-1.5 py-1 hover:border-border hover:bg-white focus:border-ring focus:bg-white focus:outline-none focus:ring-1 focus:ring-ring transition-colors disabled:opacity-50 disabled:cursor-default"
      />
    </div>
  )
}
