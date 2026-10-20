import { Trans } from "@lingui/react/macro"
import { KeyRound, ShieldCheck } from "lucide-react"
import { useNeedsTextProvider } from "@/hooks/use-api-key"
import { SettingsHeading, SettingsLead } from "./ui"
import { ProvidersList } from "./providers/ProvidersList"

export function ProvidersSection() {
  const needsProvider = useNeedsTextProvider()
  return (
    <>
      <SettingsHeading>
        <Trans>AI providers</Trans>
      </SettingsHeading>
      <SettingsLead>
        <Trans>Connect the engines that run the pipeline and narrate books. Keys stay on this machine; CLI providers reuse the login already on it.</Trans>
      </SettingsLead>

      {needsProvider && (
        <p className="mb-4 flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-[13px] text-muted-foreground">
          <KeyRound className="size-4 shrink-0 text-brand-600" aria-hidden />
          <Trans>No provider connected yet. Open one below and sign in or add a key to start processing books.</Trans>
        </p>
      )}

      <ProvidersList />

      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 text-emerald-600" />
        <Trans>Credentials are kept in this machine&apos;s local storage and sent only to the provider you configure.</Trans>
      </div>
    </>
  )
}
