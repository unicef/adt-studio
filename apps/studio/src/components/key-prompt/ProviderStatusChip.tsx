import { Trans, useLingui } from "@lingui/react/macro"
import { useConnectProvider } from "@/hooks/use-connect-provider"
import { useNeedsTextProvider, useRejectedTextProvider } from "@/hooks/use-api-key"

const CHIP_CLASS =
  "flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"

/**
 * Status chip for the flow top bar: shown while no AI provider can run text
 * steps, or while the provider that would run them has a key it refuses, so a
 * new user learns before building a book that extraction needs a working one.
 * Never blocks the flow.
 */
export function ProviderStatusChip() {
  const needsProvider = useNeedsTextProvider()
  const rejected = useRejectedTextProvider()
  if (needsProvider) return <NoProviderChip />
  if (rejected) return <RejectedKeyChip providerId={rejected.providerId} name={rejected.displayName} />
  return null
}

function NoProviderChip() {
  const { t } = useLingui()
  const connect = useConnectProvider({ from: "add-book" })
  return (
    <button
      type="button"
      onClick={connect}
      aria-label={t`No AI provider. Connect an AI provider.`}
      className={CHIP_CLASS}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-amber-500" />
      <Trans>No AI provider</Trans>
      <span className="text-brand-700 dark:text-brand-300">
        <Trans>Connect</Trans>
      </span>
    </button>
  )
}

function RejectedKeyChip({ providerId, name }: { providerId: string; name: string }) {
  const { t } = useLingui()
  const update = useConnectProvider({ from: "add-book", providerId })
  return (
    <button
      type="button"
      onClick={update}
      aria-label={t`The ${name} key was rejected. Update the key.`}
      className={CHIP_CLASS}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-red-500" />
      <Trans>{name} key rejected</Trans>
      <span className="text-brand-700 dark:text-brand-300">
        <Trans>Update</Trans>
      </span>
    </button>
  )
}
