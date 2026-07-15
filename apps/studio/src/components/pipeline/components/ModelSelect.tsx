import { useState, useRef, useEffect } from "react"
import { ChevronDown, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLingui } from "@lingui/react/macro"

export interface ModelGroup {
  provider: string
  models: string[]
}

interface ModelSelectProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  groups: ModelGroup[]
  /** CSS classes for the outer container (width, margin, etc.) */
  className?: string
  /** CSS classes merged onto the inner input element (height, font-size, etc.) */
  inputClassName?: string
  /** When true (default), selected values are prefixed as "provider:model". When false, only the bare model name is emitted. */
  prefixProvider?: boolean
}

export function ModelSelect({
  value,
  onChange,
  placeholder = "openai:gpt-5.4",
  groups,
  className,
  inputClassName,
  prefixProvider = true,
}: ModelSelectProps) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const closeDropdown = () => {
    setOpen(false)
    setSearch("")
    setIsSearching(false)
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown()
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  // Close on escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeDropdown()
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [open])

  const formatModelId = (provider: string, model: string) =>
    prefixProvider ? `${provider}:${model}` : model

  const selectModel = (provider: string, model: string) => {
    onChange(formatModelId(provider, model))
    closeDropdown()
  }

  const clearValue = () => {
    onChange("")
    setSearch("")
    setIsSearching(false)
  }

  const handleInputChange = (val: string) => {
    setSearch(val)
    setIsSearching(true)
    if (!open) setOpen(true)
  }

  const commitSearch = () => {
    const trimmed = search.trim()
    if (!trimmed) { closeDropdown(); return }
    // If it exactly matches a dropdown item, use formatModelId for consistency
    for (const g of groups) {
      for (const m of g.models) {
        const full = `${g.provider}:${m}`
        if (trimmed === full || trimmed === m) {
          onChange(formatModelId(g.provider, m))
          closeDropdown()
          return
        }
      }
    }
    // Otherwise commit as-is (custom free-text)
    onChange(trimmed)
    closeDropdown()
  }

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      commitSearch()
    }
  }

  const handleBlur = () => {
    // Delay to allow click events on dropdown items to fire first
    setTimeout(() => {
      if (containerRef.current?.contains(document.activeElement)) return
      closeDropdown()
    }, 150)
  }

  const query = search.toLowerCase()

  const filtered = groups
    .map((g) => ({
      ...g,
      models: g.models.filter((m) => {
        const full = `${g.provider}:${m}`.toLowerCase()
        return full.includes(query) || m.toLowerCase().includes(query)
      }),
    }))
    .filter((g) => g.models.length > 0)

  const displayValue = isSearching ? search : value

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="flex items-center">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={displayValue}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={() => setOpen(true)}
            onBlur={handleBlur}
            onKeyDown={handleInputKeyDown}
            placeholder={placeholder}
            className={cn(
              "flex h-10 w-full rounded-md border border-input bg-background pl-3 pr-16 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
              inputClassName
            )}
          />
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
            {value && (
              <button
                type="button"
                onClick={clearValue}
                className="p-1 rounded hover:bg-muted text-muted-foreground"
                tabIndex={-1}
                aria-label={t`Clear model`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => { setOpen(!open); if (!open) inputRef.current?.focus() }}
              className="p-1 rounded hover:bg-muted text-muted-foreground"
              tabIndex={-1}
              aria-label={t`Toggle model list`}
            >
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
            </button>
          </div>
        </div>
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md">
          {filtered.map((group) => (
            <div key={group.provider}>
              <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {group.provider}
              </div>
              {group.models.map((model) => {
                const fullId = formatModelId(group.provider, model)
                const isSelected = value === fullId
                return (
                  <button
                    key={`${group.provider}:${model}`}
                    type="button"
                    onClick={() => selectModel(group.provider, model)}
                    className={cn(
                      "flex w-full items-center px-3 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground",
                      isSelected && "bg-accent text-accent-foreground"
                    )}
                  >
                    {prefixProvider && <span className="text-muted-foreground mr-1">{group.provider}:</span>}
                    <span>{model}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** LLM models for pipeline steps (text generation, structured output) */
export const LLM_MODEL_GROUPS: ModelGroup[] = [
  {
    provider: "openai",
    models: [
      "gpt-5.4",
      "gpt-5.4-mini",
      "gpt-5.4-nano",
      "gpt-5.2",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4.1-nano",
      "o3",
      "o4-mini",
    ],
  },
  {
    provider: "anthropic",
    models: [
      "claude-opus-4-6",
      "claude-sonnet-4-6",
      "claude-haiku-4-5",
    ],
  },
  {
    provider: "google",
    models: [
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
    ],
  },
  {
    provider: "custom",
    models: [
      "your-model-name",
    ],
  },
]

/** Image generation / image-edit models */
export const IMAGE_MODEL_GROUPS: ModelGroup[] = [
  {
    provider: "openai",
    models: [
      "gpt-image-2",
      "dall-e-3",
    ],
  },
]

/** TTS models for speech generation — OpenAI provider */
export const OPENAI_TTS_MODELS: ModelGroup[] = [
  {
    provider: "openai",
    models: [
      "gpt-4o-mini-tts",
      "tts-1",
      "tts-1-hd",
    ],
  },
]

/** TTS models for speech generation — Azure provider */
export const AZURE_TTS_MODELS: ModelGroup[] = [
  {
    provider: "azure",
    models: [
      "azure-tts",
    ],
  },
]

/** TTS models for speech generation — Gemini provider */
export const GEMINI_TTS_MODELS: ModelGroup[] = [
  {
    provider: "gemini",
    models: [
      "gemini-3.1-flash-tts-preview",
      "gemini-2.5-flash-preview-tts",
      "gemini-2.5-pro-preview-tts",
    ],
  },
]
