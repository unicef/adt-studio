import { Trans } from "@lingui/react/macro"
import { ApiKeyDialog } from "./ApiKeyDialog"

export function ApiKeysSettings() {
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
      />
    </div>
  )
}
