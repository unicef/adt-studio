import { useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ProviderDescriptor } from "./contract"
import { ROLE_GROUPS } from "./data"
import { EASE, ProviderTile, RailStatus, localize } from "./shared"
import { ProviderEditor } from "./ProviderEditor"
import { useProvidersV2 } from "./useProvidersV2"
import { GroupHeading } from "./GroupHeading"

function Row({ descriptor, open, onToggle, store }: { descriptor: ProviderDescriptor; open: boolean; onToggle: () => void; store: ReturnType<typeof useProvidersV2> }) {
  const { i18n } = useLingui()
  const m = descriptor.manifest
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn("flex w-full items-center gap-3.5 px-4 py-3 text-left transition-colors duration-150", EASE, open ? "bg-muted/40" : "hover:bg-muted/30")}
      >
        <ProviderTile id={m.id} className="size-9" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold leading-tight">{m.displayName}</span>
          <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
            {m.localizedHelp ? localize(m.localizedHelp, i18n.locale) : m.docsUrl ? new URL(m.docsUrl).host : ""}
          </span>
        </span>
        <RailStatus descriptor={descriptor} store={store} />
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-300", EASE, open && "rotate-180")} />
      </button>
      <div className={cn("grid transition-[grid-template-rows] duration-300 motion-reduce:transition-none", EASE)} style={{ gridTemplateRows: open ? "1fr" : "0fr" }}>
        <div className="overflow-hidden">
          <div className={cn("border-t bg-muted/20 px-4 py-4 transition-opacity duration-300 motion-reduce:transition-none", open ? "opacity-100" : "opacity-0")}>
            <ProviderEditor descriptor={descriptor} store={store} active={open} onSaved={onToggle} />
          </div>
        </div>
      </div>
    </div>
  )
}

export function VariantAccordion() {
  const store = useProvidersV2()
  const [openId, setOpenId] = useState<string | null>(null)
  const byId = (id: string) => store.descriptors.find((d) => d.manifest.id === id)

  return (
    <div className="flex flex-col gap-7">
      {ROLE_GROUPS.map((group) => (
        <section key={group.key}>
          <GroupHeading label={group.label} hint={group.hint} />
          <div className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
            {group.ids.map((id) => {
              const descriptor = byId(id)
              if (!descriptor) return null
              return (
                <Row
                  key={id}
                  descriptor={descriptor}
                  open={openId === id}
                  onToggle={() => setOpenId((prev) => (prev === id ? null : id))}
                  store={store}
                />
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
