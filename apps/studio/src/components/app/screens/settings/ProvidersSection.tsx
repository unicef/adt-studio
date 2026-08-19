import { Trans } from "@lingui/react/macro"
import { ShieldCheck } from "lucide-react"
import { SettingsHeading, SettingsLead } from "./ui"
import { ProvidersList } from "./providers-v2/ProvidersList"

export function ProvidersSection() {
  return (
    <>
      <SettingsHeading>
        <Trans>AI providers</Trans>
      </SettingsHeading>
      <SettingsLead>
        <Trans>Connect the engines that run the pipeline and narrate books. Keys stay on this machine; CLI providers reuse the login already on it.</Trans>
      </SettingsLead>

      <ProvidersList />

      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 text-emerald-600" />
        <Trans>Credentials are kept in this machine&apos;s local storage and sent only to the provider you configure.</Trans>
      </div>
    </>
  )
}
