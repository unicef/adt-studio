import { useState } from "react"
import { cn } from "@/lib/utils"
import type { ProviderDescriptor } from "./contract"
import { ROLE_GROUPS } from "./data"
import { EASE, ProviderTile, RailStatus } from "./shared"
import { ProviderEditor } from "./ProviderEditor"
import { requiredFieldsFilled, useProvidersV2 } from "./useProvidersV2"

function firstSelection(store: ReturnType<typeof useProvidersV2>): string {
  const configured = store.descriptors.find((d) => requiredFieldsFilled(d, store.credentials[d.manifest.id] ?? {}) && Object.keys(store.credentials[d.manifest.id] ?? {}).length > 0)
  return configured?.manifest.id ?? ROLE_GROUPS[0].ids[0]
}

export function VariantMasterDetail() {
  const store = useProvidersV2()
  const [selected, setSelected] = useState<string>(() => firstSelection(store))
  const byId = (id: string): ProviderDescriptor | undefined => store.descriptors.find((d) => d.manifest.id === id)
  const active = byId(selected)

  return (
    <div className="grid min-h-[520px] grid-cols-[268px_1fr] gap-4">
      <div className="flex flex-col gap-5 overflow-auto rounded-2xl border bg-card p-2.5 shadow-sm">
        {ROLE_GROUPS.map((group) => (
          <div key={group.key}>
            <div className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">{group.label}</div>
            <div className="flex flex-col gap-0.5">
              {group.ids.map((id) => {
                const descriptor = byId(id)
                if (!descriptor) return null
                const isActive = selected === id
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSelected(id)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors duration-150",
                      EASE,
                      isActive ? "bg-muted" : "hover:bg-muted/50",
                    )}
                  >
                    <ProviderTile id={id} className="size-7" />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{descriptor.manifest.displayName}</span>
                    <RailStatus descriptor={descriptor} store={store} />
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        {active && (
          <div key={active.manifest.id} className={cn("transition-opacity duration-200 starting:opacity-0 motion-reduce:transition-none", EASE)}>
            <div className="mb-5 flex items-center gap-3.5">
              <ProviderTile id={active.manifest.id} className="size-12" />
              <div className="min-w-0">
                <h2 className="text-[17px] font-bold tracking-[-0.01em]">{active.manifest.displayName}</h2>
                <p className="mt-0.5 text-[12px] text-muted-foreground">{active.manifest.docsUrl ? new URL(active.manifest.docsUrl).host : ""}</p>
              </div>
            </div>
            <ProviderEditor descriptor={active} store={store} active />
          </div>
        )}
      </div>
    </div>
  )
}
