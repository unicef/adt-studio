import { Trans, useLingui } from "@lingui/react/macro"

export interface ScreenFallbackProps {
  error?: Error | null
}

export function ScreenFallback({ error }: ScreenFallbackProps) {
  const { t } = useLingui()

  if (error) {
    return (
      <div className="grid h-full place-items-center p-6 text-center text-sm text-destructive">
        {t`Failed to load books:`} {error.message}
      </div>
    )
  }

  return (
    <div className="grid h-full place-items-center text-sm text-muted-foreground">
      <Trans>Loading…</Trans>
    </div>
  )
}
