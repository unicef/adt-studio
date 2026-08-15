import { useEffect, useState } from "react"
import { Trans } from "@lingui/react/macro"
import { ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { SettingsHeading, SettingsLead } from "./ui"
import { ProvidersConductor } from "./ProvidersConductor"
import { ProvidersT3 } from "./ProvidersT3"

type ProvidersVariant = "conductor" | "t3"

const VARIANT_KEY = "adt:providers-variant"
const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]"

const VARIANTS: { id: ProvidersVariant; label: string }[] = [
  { id: "conductor", label: "Conductor" },
  { id: "t3", label: "T3 Chat" },
]

function VariantSwitch({
  value,
  onChange,
}: {
  value: ProvidersVariant
  onChange: (value: ProvidersVariant) => void
}) {
  const activeIndex = VARIANTS.findIndex((v) => v.id === value)
  return (
    <div className="relative inline-grid grid-cols-2 gap-1 rounded-lg border bg-muted/50 p-1">
      <span
        aria-hidden
        className={cn("absolute inset-y-1 w-[calc(50%-2px)] rounded-md bg-card shadow-sm transition-transform duration-300 motion-reduce:transition-none", EASE)}
        style={{ transform: `translateX(${activeIndex * 100}%)` }}
      />
      {VARIANTS.map((variant) => (
        <button
          key={variant.id}
          type="button"
          onClick={() => onChange(variant.id)}
          className={cn(
            "relative z-10 rounded-md px-3 py-1 text-[12px] font-medium transition-colors duration-150",
            EASE,
            value === variant.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {variant.label}
        </button>
      ))}
    </div>
  )
}

export function ProvidersSection() {
  const [variant, setVariant] = useState<ProvidersVariant>(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(VARIANT_KEY) : null
    return stored === "t3" ? "t3" : "conductor"
  })

  useEffect(() => {
    window.localStorage.setItem(VARIANT_KEY, variant)
  }, [variant])

  return (
    <>
      <div className="mb-1 flex items-start justify-between gap-4">
        <SettingsHeading>
          <Trans>AI providers</Trans>
        </SettingsHeading>
        <VariantSwitch value={variant} onChange={setVariant} />
      </div>
      <SettingsLead>
        <Trans>API keys for the AI pipeline. Keys are stored locally on this machine and never leave it except to call the provider.</Trans>
      </SettingsLead>

      <div key={variant} className={cn("transition-opacity duration-300 starting:opacity-0 motion-reduce:transition-none", EASE)}>
        {variant === "conductor" ? <ProvidersConductor /> : <ProvidersT3 />}
      </div>

      <div className="mt-3.5 flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 text-emerald-600" />
        <Trans>Keys are kept in this machine's local storage. Custom uses any OpenAI-compatible endpoint; Azure powers Speech TTS.</Trans>
      </div>
    </>
  )
}
