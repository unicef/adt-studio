import { useEffect, useState } from "react"
import { Trans } from "@lingui/react/macro"
import { ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { SettingsHeading, SettingsLead } from "./ui"
import { VariantAccordion } from "./providers-v2/VariantAccordion"
import { VariantCards } from "./providers-v2/VariantCards"
import { VariantMasterDetail } from "./providers-v2/VariantMasterDetail"

type ProvidersVariant = "accordion" | "cards" | "master-detail"

const VARIANT_KEY = "adt:providers-variant-v2"
const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]"

const VARIANTS: { id: ProvidersVariant; label: string }[] = [
  { id: "accordion", label: "Accordion" },
  { id: "cards", label: "Cards" },
  { id: "master-detail", label: "Master · detail" },
]

function VariantSwitch({ value, onChange }: { value: ProvidersVariant; onChange: (value: ProvidersVariant) => void }) {
  const activeIndex = VARIANTS.findIndex((v) => v.id === value)
  return (
    <div className="relative grid grid-cols-3 gap-1 rounded-lg border bg-muted/50 p-1">
      <span
        aria-hidden
        className={cn("absolute inset-y-1 w-[calc(33.333%-3px)] rounded-md bg-card shadow-sm transition-transform duration-300 motion-reduce:transition-none", EASE)}
        style={{ transform: `translateX(calc(${activeIndex} * (100% + 4px)))` }}
      />
      {VARIANTS.map((variant) => (
        <button
          key={variant.id}
          type="button"
          onClick={() => onChange(variant.id)}
          className={cn(
            "relative z-10 whitespace-nowrap rounded-md px-3 py-1 text-[12px] font-medium transition-colors duration-150",
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
    return stored === "cards" || stored === "master-detail" ? stored : "accordion"
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
        <Trans>Connect the engines that run the pipeline and narrate books. Keys stay on this machine; CLI providers reuse the login already on it.</Trans>
      </SettingsLead>

      <div key={variant} className={cn("transition-opacity duration-300 starting:opacity-0 motion-reduce:transition-none", EASE)}>
        {variant === "accordion" ? <VariantAccordion /> : variant === "cards" ? <VariantCards /> : <VariantMasterDetail />}
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 text-emerald-600" />
        <Trans>Credentials are kept in this machine&apos;s local storage and sent only to the provider you configure.</Trans>
      </div>
    </>
  )
}
