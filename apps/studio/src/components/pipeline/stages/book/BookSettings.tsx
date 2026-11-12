import { useState } from "react"
import { Trans } from "@lingui/react/macro"
import { ProviderCardGroups } from "@/components/app/screens/settings/providers/ProviderCardGroups"
import { useProviders } from "@/components/app/screens/settings/providers/useProviders"
import { BookModelSettings } from "./BookModelSettings"

export function BookSettings({ bookLabel, tab = "general" }: { bookLabel: string; tab?: string }) {
  if (tab === "models") {
    return (
      <div className="mx-auto w-full max-w-4xl p-4">
        <BookModelSettings bookLabel={bookLabel} />
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-[15px] font-semibold tracking-tight text-[#0a0a0a]">
          <Trans>API keys</Trans>
        </h3>
        <p className="text-[12.5px] leading-relaxed text-[#737373]">
          <Trans>Configure the provider credentials used when ADT Studio runs AI pipeline steps on this machine.</Trans>
        </p>
      </div>
      <ApiKeyCards />
    </div>
  )
}

/**
 * The same provider cards as Settings → AI providers, so a key is entered,
 * checked and shown the same way in both places. Each card saves on its own
 * and shows its live check, so a refused key is visible right here.
 */
function ApiKeyCards() {
  const store = useProviders()
  const [openId, setOpenId] = useState<string | null>(null)
  return (
    <ProviderCardGroups
      store={store}
      openId={openId}
      onToggle={(cardKey) => setOpenId((prev) => (prev === cardKey ? null : cardKey))}
    />
  )
}
