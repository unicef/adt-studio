import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { ROLE_GROUPS } from "./data"
import { EASE, ProviderTile } from "./shared"
import { ProviderEditor } from "./ProviderEditor"
import { useProvidersV2 } from "./useProvidersV2"
import { GroupHeading } from "./GroupHeading"

export function VariantCards() {
  const store = useProvidersV2()
  const byId = (id: string) => store.descriptors.find((d) => d.manifest.id === id)

  return (
    <div className="flex flex-col gap-7">
      {ROLE_GROUPS.map((group) => (
        <section key={group.key}>
          <GroupHeading label={group.label} hint={group.hint} />
          <div className="grid items-start gap-3 md:grid-cols-2">
            {group.ids.map((id) => {
              const descriptor = byId(id)
              if (!descriptor) return null
              const m = descriptor.manifest
              return (
                <article
                  key={id}
                  className={cn(
                    "rounded-2xl border bg-card p-5 shadow-sm transition-shadow duration-300 hover:shadow-md motion-reduce:transition-none",
                    EASE,
                  )}
                >
                  <div className="mb-4 flex items-center gap-3">
                    <ProviderTile id={m.id} className="size-10" />
                    <div className="min-w-0">
                      <h3 className="truncate text-[14.5px] font-semibold leading-tight">{m.displayName}</h3>
                      <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                        {m.modalities.includes("tts") && !m.modalities.includes("structured-text") ? (
                          <Trans>Speech / voices</Trans>
                        ) : (
                          <Trans>Text &amp; reasoning</Trans>
                        )}
                      </p>
                    </div>
                  </div>
                  <ProviderEditor descriptor={descriptor} store={store} active />
                </article>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
