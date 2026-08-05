import { KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SettingsCard, SettingsField } from "@/components/pipeline/components/SettingsCard"
import { useBookApiKeyDialog } from "@/components/settings/BookApiKeyDialogProvider"
import { Trans } from "@lingui/react/macro"
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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4">
      <SettingsCard
        title={<Trans>API keys</Trans>}
        description={<Trans>Configure the provider credentials used when ADT Studio runs AI pipeline steps on this machine.</Trans>}
      >
        <ApiKeysSettingsField />
      </SettingsCard>
    </div>
  )
}

function ApiKeysSettingsField() {
  const { openApiKeyDialog } = useBookApiKeyDialog()

  return (
    <SettingsField
      label={<Trans>Provider credentials</Trans>}
      hint={<Trans>Keys are stored locally in this browser or desktop session and are sent only with run requests.</Trans>}
    >
      <Button type="button" variant="outline" className="w-fit gap-2" onClick={openApiKeyDialog}>
        <KeyRound className="h-4 w-4" />
        <Trans>Open API key settings</Trans>
      </Button>
    </SettingsField>
  )
}
