import { useMemo, useRef, useState } from "react"
import { Check, ChevronsUpDown, Search } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import type { ElevenLabsVoice } from "@/api/client"
import {
  formatElevenLabsVoiceLabel,
  useElevenLabsVoices,
} from "@/hooks/use-elevenlabs-voices"

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

/** Searchable text for a voice: name, category, and any label values. */
function searchableText(voice: ElevenLabsVoice): string {
  return [
    voice.name,
    voice.voice_id,
    voice.category,
    ...Object.values(voice.labels ?? {}),
    ...(voice.verified_languages ?? []).flatMap((l) => [l.language, l.accent]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
}

interface ElevenLabsVoiceComboboxProps {
  /** The stored ElevenLabs voice ID (may be empty, or an ID not in this account). */
  value: string
  onChange: (voiceId: string) => void
  className?: string
}

/**
 * Voice picker that shows names instead of IDs.
 *
 * ElevenLabs voice IDs are opaque (`21m00Tcm4TlvDq8ikWAM`), and voices.yaml
 * stores exactly those IDs, so a plain text input gives the user nothing to
 * recognise. This resolves them against the account's voice list.
 *
 * Degrades to a free-text input when no list is available (no ElevenLabs key
 * configured, or the lookup failed), so a pasted ID always remains possible.
 */
export function ElevenLabsVoiceCombobox({
  value,
  onChange,
  className,
}: ElevenLabsVoiceComboboxProps) {
  const { t } = useLingui()
  const { voices, describeVoice, isUnavailable, hasKey } = useElevenLabsVoices()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return voices
    return voices.filter((voice) => searchableText(voice).includes(q))
  }, [voices, query])

  // No list to offer — fall back to free text so a pasted ID still works.
  if (isUnavailable) {
    return (
      <div className="space-y-1">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn("h-7 text-xs", className)}
          placeholder={t`e.g. 21m00Tcm4TlvDq8ikWAM`}
        />
        {!hasKey ? (
          <p className="text-[10px] text-muted-foreground">
            <Trans>Add an ElevenLabs API key in Settings to pick voices by name.</Trans>
          </p>
        ) : null}
      </div>
    )
  }

  // describeVoice also covers the voices we ship, so a premade default the
  // account hasn't added still reads as a name rather than a raw ID.
  const triggerLabel = value ? describeVoice(value) : t`Default voice`
  // Getting the ID back unchanged means we have no name for it from either the
  // account list or the voices we ship — most likely a typo or a stale ID.
  const isUnknownVoice = Boolean(value) && triggerLabel === value

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) setQuery("")
  }

  const pick = (voiceId: string) => {
    onChange(voiceId)
    handleOpenChange(false)
  }

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
                if (e.key === "Enter" && filtered.length > 0) {
                  e.preventDefault()
                  pick(filtered[0].voice_id)
                }
              }}
              placeholder={t`Search voices`}
              prependIcon={<Search className="h-3.5 w-3.5" aria-hidden="true" />}
              className="h-8 text-[12px]"
            />
          </div>

          <div className="max-h-64 overflow-y-auto p-1.5">
            {!query.trim() ? (
              <VoiceRow
                label={t`Default voice`}
                selected={!value}
                onSelect={() => pick("")}
              />
            ) : null}

            {filtered.map((voice) => (
              <VoiceRow
                key={voice.voice_id}
                label={formatElevenLabsVoiceLabel(voice)}
                detail={voice.voice_id.slice(0, 8)}
                selected={voice.voice_id === value}
                onSelect={() => pick(voice.voice_id)}
              />
            ))}

            {filtered.length === 0 ? (
              <p className="px-2 py-4 text-center text-[12px] text-muted-foreground">
                <Trans>No voices found</Trans>
              </p>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>

      {/* An unrecognised ID still has to be readable and editable rather than
          looking like a broken empty control. Only warn when we genuinely have no
          name for it — a premade voice we can name works fine even when it isn't
          in the account's own list, so flagging that would just alarm. */}
      {isUnknownVoice ? (
        <p className="text-[10px] text-muted-foreground">
          <Trans>This voice ID is not in your ElevenLabs account.</Trans>
        </p>
      ) : null}
    </div>
  )
}
