import { useMemo } from "react"
import { Trans } from "@lingui/react/macro"
import { useApiKey } from "@/hooks/use-api-key"
import { ApiKeyDialog } from "./ApiKeyDialog"

export function ApiKeysSettings() {
  const {
    apiKey,
    setApiKey,
    anthropicKey,
    setAnthropicKey,
    googleKey,
    setGoogleKey,
    customBaseUrl,
    setCustomBaseUrl,
    customApiKey,
    setCustomApiKey,
    azureKey,
    setAzureKey,
    azureRegion,
    setAzureRegion,
    setGeminiKey,
    elevenLabsKey,
    setElevenLabsKey,
  } = useApiKey()

  const saveGoogleKey = useMemo(
    () => (key: string) => {
      setGoogleKey(key)
      setGeminiKey(key)
    },
    [setGeminiKey, setGoogleKey],
  )

  return (
    <div className="mx-auto flex w-full flex-col gap-6 p-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          <Trans>API keys</Trans>
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
          <Trans>Configure provider credentials used by AI pipeline features on this machine.</Trans>
        </p>
      </header>

      <ApiKeyDialog
        embedded
        open
        onOpenChange={() => {}}
        apiKey={apiKey}
        onSaveApiKey={setApiKey}
        anthropicKey={anthropicKey}
        onSaveAnthropicKey={setAnthropicKey}
        googleKey={googleKey}
        onSaveGoogleKey={saveGoogleKey}
        customBaseUrl={customBaseUrl}
        onSaveCustomBaseUrl={setCustomBaseUrl}
        customApiKey={customApiKey}
        onSaveCustomApiKey={setCustomApiKey}
        azureKey={azureKey}
        onSaveAzureKey={setAzureKey}
        azureRegion={azureRegion}
        onSaveAzureRegion={setAzureRegion}
        elevenLabsKey={elevenLabsKey}
        onSaveElevenLabsKey={setElevenLabsKey}
      />
    </div>
  )
}
