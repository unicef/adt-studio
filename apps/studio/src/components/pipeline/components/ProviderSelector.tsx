import { useState, useRef, useEffect } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ChevronDown, Settings } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  useActiveProvider,
  PROVIDER_PRIORITY,
  type ProviderType,
} from "@/hooks/use-active-provider"
import { useSettingsDialog } from "@/hooks/use-settings-dialog"

/**
 * ProviderSelector — displays the active LLM provider and allows switching
 * when multiple providers are configured.
 *
 * - No providers configured → inline message with link to Settings
 * - Single provider configured → static provider name + model (no dropdown)
 * - Multiple providers configured → custom dropdown listing all 4 providers
 *
 * Uses a custom dropdown instead of radix Select so that disabled/unconfigured
 * providers remain clickable (opening the Settings dialog for credential entry).
 */
export function ProviderSelector() {
  const { t } = useLingui()
  const {
    activeProvider,
    allProviders,
    configuredProviders,
    setActiveProvider,
    hasMultipleProviders,
  } = useActiveProvider()
  const { openSettings } = useSettingsDialog()

  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
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
        setOpen(false)
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [open])

  // No providers configured — show message with link to Settings
  if (configuredProviders.length === 0) {
    return (
      <button
        type="button"
        onClick={openSettings}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        aria-label={t`Configure provider credentials`}
      >
        <Settings className="w-3.5 h-3.5" />
        <span>
          <Trans>Configure a provider to run</Trans>
        </span>
      </button>
    )
  }

  // Single provider configured — static display, no dropdown
  if (!hasMultipleProviders && activeProvider) {
    return (
      <div
        className="flex items-center gap-2 text-sm text-muted-foreground"
        aria-label={t`Active provider: ${activeProvider.label}`}
      >
        <span className="font-medium text-foreground">
          {activeProvider.label}
        </span>
        <span className="text-xs text-muted-foreground truncate max-w-[140px]">
          {activeProvider.model}
        </span>
      </div>
    )
  }

  // Multiple providers configured — custom dropdown
  const handleSelect = (type: ProviderType, configured: boolean) => {
    if (!configured) {
      // Unconfigured provider → open Settings dialog
      openSettings()
      setOpen(false)
      return
    }
    setActiveProvider(type)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex h-8 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm",
          "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "hover:bg-accent/50 transition-colors"
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t`Select LLM provider`}
      >
        {activeProvider && (
          <span className="flex items-center gap-2 truncate">
            <span className="font-medium">{activeProvider.label}</span>
            <span className="text-xs text-muted-foreground truncate max-w-[120px]">
              {activeProvider.model}
            </span>
          </span>
        )}
        <ChevronDown className={cn("h-3.5 w-3.5 opacity-50 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t`LLM providers`}
          className="absolute z-50 mt-1 min-w-[200px] rounded-md border bg-popover text-popover-foreground shadow-md"
        >
          {PROVIDER_PRIORITY.map((type) => {
            const provider = allProviders.find((p) => p.type === type)
            if (!provider) return null
            const isActive = activeProvider?.type === type
            const isDisabled = !provider.configured
            return (
              <button
                key={type}
                type="button"
                role="option"
                aria-selected={isActive}
                aria-disabled={isDisabled}
                onClick={() => handleSelect(type, provider.configured)}
                className={cn(
                  "flex w-full items-center justify-between px-3 py-2 text-sm cursor-pointer",
                  "hover:bg-accent hover:text-accent-foreground transition-colors",
                  isActive && "bg-accent/50",
                  isDisabled && "opacity-60"
                )}
              >
                <span className="flex items-center gap-2">
                  <span className={cn(isDisabled && "text-muted-foreground")}>
                    {provider.label}
                  </span>
                  {isDisabled && (
                    <span className="text-xs text-muted-foreground italic">
                      <Trans>credentials needed</Trans>
                    </span>
                  )}
                </span>
                {isActive && (
                  <span className="h-2 w-2 rounded-full bg-foreground" />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
