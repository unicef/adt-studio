import { Trans, useLingui } from "@lingui/react/macro"
import { useConnectProvider } from "@/hooks/use-connect-provider"
import { useNeedsTextProvider } from "@/hooks/use-api-key"

/**
 * Status chip for the flow top bar: shown while no AI provider can run text
 * steps, so a new user learns before building a book that extraction needs one.
 * Never blocks the flow.
 */
export function ProviderStatusChip() {
  const { t } = useLingui()
  const connect = useConnectProvider()
  const needsProvider = useNeedsTextProvider()
  if (!needsProvider) return null
  return (
    <button
      type="button"
      onClick={connect}
      aria-label={t`No AI provider. Connect an AI provider.`}
      className="flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <span aria-hidden className="size-1.5 rounded-full bg-amber-500" />
      <Trans>No AI provider</Trans>
      <span className="text-brand-700 dark:text-brand-300">
        <Trans>Connect</Trans>
      </span>
    </button>
  )
}
