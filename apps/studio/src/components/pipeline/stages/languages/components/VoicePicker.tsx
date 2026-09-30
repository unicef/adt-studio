import { useMemo, useRef, useState, type ReactNode } from "react"
import { Check, ChevronsUpDown, Search } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"

export interface VoiceOption {
  /** The value stored in config (a voice id or provider voice name). */
  value: string
  /** What the user reads in the list. */
  label: string
  /** The bare voice name to persist as the narrator label, when it differs
   *  from `label`. `label` may carry list-only decoration ("Valentina
   *  (Female)"), but the persisted label reaches end users in the exported
   *  reader's narrator picker, so it has to stay a name. Defaults to `label`. */
  name?: string
  /** Muted right-hand text — a locale, or a truncated id. */
  detail?: string
  /** Extra text the search box should match on beyond label and value. */
  search?: string
}

interface VoiceRowProps {
  label: string
  detail?: string
  selected?: boolean
  onSelect: () => void
}

function VoiceRow({ label, detail, selected, onSelect }: VoiceRowProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] transition-colors",
        "hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
        selected && "bg-violet-50",
      )}
    >
      <span className="w-4 shrink-0">
        {selected ? (
          <Check className="h-3.5 w-3.5 text-violet-600" aria-hidden="true" />
        ) : null}
      </span>
      <span className="truncate">{label}</span>
      {detail ? (
        <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
          {detail}
        </span>
      ) : null}
    </button>
  )
}

interface VoicePickerProps {
  value: string
  /** `label` is the human-readable name for the picked voice, when one is
   *  known — persisted as the narrator label and shown to end users. */
  onChange: (value: string, label?: string) => void
  options: VoiceOption[]
  /** Text on the closed control. Callers resolve this themselves so a value
   *  absent from `options` can still render as a name. */
  triggerLabel: string
  /** Label for the row that clears the value back to the provider default. */
  defaultOptionLabel: string
  /** Placeholder for the free-text input used when `options` is empty. */
  freeTextPlaceholder: string
  /** True while the caller is still fetching its list. Keeps the picker on
   *  screen instead of flashing the free-text input and swapping back once the
   *  voices arrive — which would also drop focus mid-keystroke. */
  isLoading?: boolean
  /** Shown under the control when there are no options — typically why. */
  unavailableHint?: ReactNode
  /** Shown under the control when a value is set but unrecognised. */
  unknownValueHint?: ReactNode
  className?: string
}

/**
 * Voice picker shared by every provider.
 *
 * Providers differ in where their voices come from — ElevenLabs and Azure are
 * fetched live, OpenAI and Gemini are fixed lists — but the control is the
 * same, so the list is passed in and this owns only the interaction.
 *
 * Typing a value the list doesn't contain always remains possible: the search
 * box offers it as a "use this" row, and with no list at all the control falls
 * back to a plain text input. A provider can add a voice tomorrow without
 * making it unreachable here.
 */
export function VoicePicker({
  value,
  onChange,
  options,
  triggerLabel,
  defaultOptionLabel,
  freeTextPlaceholder,
  isLoading = false,
  unavailableHint,
  unknownValueHint,
  className,
}: VoicePickerProps) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((option) =>
      `${option.label} ${option.value} ${option.search ?? ""}`.toLowerCase().includes(q),
    )
  }, [options, query])

  // No list to offer — a plain input so a known voice can still be typed. A
  // list still in flight is not "no list": swapping controls mid-fetch would
  // jump the layout and steal focus from anyone already typing.
  if (options.length === 0 && !isLoading) {
    return (
      <div className="space-y-1">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn("h-7 text-xs", className)}
          placeholder={freeTextPlaceholder}
        />
        {unavailableHint ? (
          <p className="text-[10px] text-muted-foreground">{unavailableHint}</p>
        ) : null}
      </div>
    )
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) setQuery("")
  }

  const pick = (nextValue: string, nextLabel?: string) => {
    onChange(nextValue, nextLabel)
    handleOpenChange(false)
  }

  // `label` is what the row shows; `name` is what gets persisted. They differ
  // wherever the list decorates a voice ("Valentina (Female)") — the persisted
  // one reaches end users as the narrator's name, so it must stay bare.
  const pickOption = (option: VoiceOption) => pick(option.value, option.name ?? option.label)

  const trimmedQuery = query.trim()
  // Offer the typed text when it matches nothing, so a voice the provider has
  // added since this list was built is still reachable.
  const showCustom =
    trimmedQuery.length > 0 &&
    !options.some((option) => option.value.toLowerCase() === trimmedQuery.toLowerCase())

  return (
    <div className="space-y-1">
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex h-7 w-full items-center gap-1.5 rounded-md border border-input bg-background px-2 text-xs",
              "ring-offset-0 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-violet-500",
              "data-[state=open]:ring-1 data-[state=open]:ring-inset data-[state=open]:ring-violet-500",
              className,
            )}
          >
            <span className="truncate">{triggerLabel}</span>
            <ChevronsUpDown className="ml-auto h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={4}
          className="w-[300px] p-0"
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            inputRef.current?.focus()
          }}
        >
          <div className="border-b p-2">
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return
                e.preventDefault()
                if (filtered.length > 0) pickOption(filtered[0])
                else if (showCustom) pick(trimmedQuery)
              }}
              placeholder={t`Search voices`}
              prependIcon={<Search className="h-3.5 w-3.5" aria-hidden="true" />}
              className="h-8 text-[12px]"
            />
          </div>

          <div className="max-h-64 overflow-y-auto p-1.5">
            {!trimmedQuery ? (
              <VoiceRow
                label={defaultOptionLabel}
                selected={!value}
                onSelect={() => pick("")}
              />
            ) : null}

            {filtered.map((option) => (
              <VoiceRow
                key={option.value}
                label={option.label}
                detail={option.detail}
                selected={option.value === value}
                onSelect={() => pickOption(option)}
              />
            ))}

            {showCustom ? (
              <VoiceRow
                label={t`Use "${trimmedQuery}"`}
                selected={trimmedQuery === value}
                onSelect={() => pick(trimmedQuery)}
              />
            ) : null}

            {filtered.length === 0 && !showCustom ? (
              <p className="px-2 py-4 text-center text-[12px] text-muted-foreground">
                <Trans>No voices found</Trans>
              </p>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>

      {unknownValueHint ? (
        <p className="text-[10px] text-muted-foreground">{unknownValueHint}</p>
      ) : null}
    </div>
  )
}
