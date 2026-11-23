import { Trans } from "@lingui/react/macro"
import { ProviderCardGroups } from "@/components/app/screens/settings/providers/ProviderCardGroups"
import { useProviders } from "@/components/app/screens/settings/providers/useProviders"
import { useLinkedCard } from "@/components/app/screens/settings/providers/useLinkedCard"
import { BookModelSettings } from "./BookModelSettings"
import { HistoryRecoveryPanel } from "./HistoryRecoveryPanel"

export function BookSettings({ bookLabel, tab = "general" }: { bookLabel: string; tab?: string }) {
  // Book-wide repair tool for damaged identity history. It is rarely needed,
  // so it lives here rather than on a stage landing page.
  if (tab === "history") {
    return (
      <div className="mx-auto w-full max-w-4xl p-4">
        <HistoryRecoveryPanel bookLabel={bookLabel} />
      </div>
    )
  }

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
          <Trans>Configure the provider credentials used when ADT Studio runs AI pipeline steps on this machine.</Trans>{" "}
          <Trans>These keys are shared with Settings → AI providers and apply to every book.</Trans>
        </p>
      </div>
      <ApiKeyCards bookLabel={bookLabel} />
    </div>
  )
}

/**
 * The same provider cards as Settings → AI providers, so a key is entered,
 * checked and shown the same way in both places. Each card saves on its own
 * and shows its live check, so a refused key is visible right here.
 */
function ApiKeyCards({ bookLabel }: { bookLabel: string }) {
  const store = useProviders()
  // A "key rejected" link (the book's settings cog) points at the card by hash.
  const cards = useLinkedCard()
  return <ProviderCardGroups store={store} {...cards} bookLabel={bookLabel} />
}
