import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { useLingui as useLinguiRuntime } from "@lingui/react"
import { AlertTriangle, Moon, RotateCcw, Sun } from "lucide-react"
import {
  DEFAULT_READER_COLORS,
  isSafeReaderCssColor,
  type ReaderColorToken,
} from "@adt/types"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { cn } from "@/lib/utils"
import type { ReaderColorMode, ReaderUiDraft } from "../hooks/use-reader-ui-draft"
import { contrastRatio, toHex } from "../lib/color"
import { READER_CONTRAST_PAIRS, READER_TOKEN_GROUPS, READER_TOKEN_LABELS } from "../lib/token-groups"
import { READER_STEP_ACCENT } from "../lib/accent"

interface ColorControlsProps {
  draft: ReaderUiDraft
  /** Limit to some groups (ids from READER_TOKEN_GROUPS). */
  groups?: string[]
  /** Hide the light/dark switch and edit this mode only. */
  mode?: ReaderColorMode
  /** Control the light/dark switch from outside (shared with search results). */
  selectedMode?: ReaderColorMode
  onModeChange?: (mode: ReaderColorMode) => void
  dense?: boolean
  className?: string
}

export function effectiveColor(draft: ReaderUiDraft, mode: ReaderColorMode, token: ReaderColorToken): string {
  return draft.value[mode]?.[token] ?? DEFAULT_READER_COLORS[mode][token]
}

export function TokenRow({
  draft,
  mode,
  token,
  dense,
}: {
  draft: ReaderUiDraft
  mode: ReaderColorMode
  token: ReaderColorToken
  dense?: boolean
}) {
  const { t } = useLingui()
  const { i18n } = useLinguiRuntime()
  const override = draft.value[mode]?.[token]
  const effective = effectiveColor(draft, mode, token)
  const [text, setText] = useState<string | null>(null)
  const label = i18n._(READER_TOKEN_LABELS[token])
  const invalid = text !== null && text.trim() !== "" && !isSafeReaderCssColor(text)

  const commitText = () => {
    if (text === null) return
    const value = text.trim()
    if (value === "") draft.setColor(mode, token, undefined)
    else if (isSafeReaderCssColor(value)) draft.setColor(mode, token, value)
    setText(null)
  }

  return (
    <div className={cn("flex items-center gap-2", dense ? "py-0.5" : "py-1")}>
      <label
        className="relative h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded-md ring-1 ring-border shadow-sm"
        style={{ background: effective }}
        title={t`Pick a colour for ${label}`}
      >
        <input
          type="color"
          aria-label={label}
          value={toHex(effective)}
          onChange={(e) => draft.setColor(mode, token, e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-xs", override ? "font-medium text-foreground" : "text-muted-foreground")}>
          {label}
        </div>
        {!dense ? (
          <input
            type="text"
            spellCheck={false}
            aria-label={t`${label} value`}
            aria-invalid={invalid || undefined}
            value={text ?? override ?? ""}
            placeholder={toHex(effective)}
            onChange={(e) => setText(e.target.value)}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitText()
              if (e.key === "Escape") setText(null)
            }}
            className={cn(
              "mt-0.5 h-6 w-full rounded border bg-transparent px-1.5 font-mono text-[11px] outline-none focus:ring-1 focus:ring-ring",
              invalid ? "border-red-400" : "border-transparent hover:border-border",
            )}
          />
        ) : null}
      </div>
      {override ? (
        <button
          type="button"
          onClick={() => draft.setColor(mode, token, undefined)}
          title={t`Use the default`}
          aria-label={t`Reset ${label} to the default`}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      ) : (
        <span className="h-6 w-6 shrink-0" />
      )}
    </div>
  )
}

/** Contrast warnings for the pairs a reader actually reads. */
export function ContrastWarnings({ draft, mode }: { draft: ReaderUiDraft; mode: ReaderColorMode }) {
  const { i18n } = useLinguiRuntime()
  const low = READER_CONTRAST_PAIRS.map(([fg, bg]) => ({
    fg,
    bg,
    ratio: contrastRatio(effectiveColor(draft, mode, fg), effectiveColor(draft, mode, bg)),
  })).filter((pair) => pair.ratio < 4.5)
  if (low.length === 0) return null
  return (
    <div className="flex flex-col gap-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
      {low.map(({ fg, bg, ratio }) => {
        const fgLabel = i18n._(READER_TOKEN_LABELS[fg])
        const bgLabel = i18n._(READER_TOKEN_LABELS[bg])
        const value = ratio.toFixed(1)
        return (
          <div key={`${fg}-${bg}`} className="flex items-start gap-1.5">
            <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
            <span>
              <Trans>
                {fgLabel} on {bgLabel}: contrast {value}:1 (WCAG AA needs 4.5:1)
              </Trans>
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** Light / dark switch for the colour editors. */
export function ColorModeSwitch({ mode, onChange }: { mode: ReaderColorMode; onChange: (mode: ReaderColorMode) => void }) {
  const { t } = useLingui()
  return (
    <SegmentedControl
      color={READER_STEP_ACCENT}
      value={mode}
      onValueChange={onChange}
      options={[
        { value: "light", label: t`Light`, icon: <Sun className="h-3.5 w-3.5" /> },
        { value: "dark", label: t`Dark`, icon: <Moon className="h-3.5 w-3.5" /> },
      ]}
    />
  )
}

/** shadcn colour tokens for the light and dark chrome. */
export function ColorControls({
  draft,
  groups,
  mode: fixedMode,
  selectedMode: controlledMode,
  onModeChange,
  dense,
  className,
}: ColorControlsProps) {
  const { i18n } = useLinguiRuntime()
  const [localMode, setLocalMode] = useState<ReaderColorMode>("light")
  const selectedMode = controlledMode ?? localMode
  const setMode = onModeChange ?? setLocalMode
  const mode = fixedMode ?? selectedMode
  const shown = READER_TOKEN_GROUPS.filter((group) => !groups || groups.includes(group.id))

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {!fixedMode ? <ColorModeSwitch mode={mode} onChange={setMode} /> : null}
      {shown.map((group) => (
        <div key={group.id} className="flex flex-col">
          {shown.length > 1 ? (
            <span className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {i18n._(group.label)}
            </span>
          ) : null}
          {group.tokens.map((token) => (
            <TokenRow key={`${mode}-${token}`} draft={draft} mode={mode} token={token} dense={dense} />
          ))}
        </div>
      ))}
      <ContrastWarnings draft={draft} mode={mode} />
    </div>
  )
}
