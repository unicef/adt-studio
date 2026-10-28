import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { CloudflareOAuthAccount } from "@/api/client"
import { RadioDot } from "./RadioDot"
import { WizardStepShell } from "./WizardStepShell"

/** Two accounts often differ only in their id, so the tile carries the name's initial
 *  to give each card a distinct anchor at a glance. */
function initialOf(account: CloudflareOAuthAccount): string {
  const source = account.name.trim() || account.id
  return source.slice(0, 1).toUpperCase()
}

interface AccountPickerStepProps {
  stepNumber: number
  stepCount: number
  accounts: CloudflareOAuthAccount[]
  isConfirming: boolean
  onConfirm: (accountId: string) => void
}

export function AccountPickerStep({
  stepNumber,
  stepCount,
  accounts,
  isConfirming,
  onConfirm,
}: AccountPickerStepProps) {
  const { t } = useLingui()
  const [selected, setSelected] = useState(accounts[0]?.id ?? "")

  return (
    <WizardStepShell
      stepNumber={stepNumber}
      stepCount={stepCount}
      title={<Trans>Which Cloudflare account?</Trans>}
      description={
        <Trans>
          Your Cloudflare login covers more than one account. Pick the one your books should be
          published into — you can change it later by disconnecting and connecting again.
        </Trans>
      }
      footer={
        <Button
          className="ml-auto"
          onClick={() => onConfirm(selected)}
          disabled={!selected || isConfirming}
        >
          {isConfirming && (
            <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          )}
          <Trans>Use this account</Trans>
        </Button>
      }
    >
      <div
        role="radiogroup"
        aria-label={t`Cloudflare accounts`}
        data-testid="oauth-account-picker"
        className="grid gap-3 pt-1 sm:grid-cols-2 lg:grid-cols-3"
      >
        {accounts.map((account) => {
          const isSelected = account.id === selected
          return (
            <button
              key={account.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setSelected(account.id)}
              className={cn(
                "relative flex h-full cursor-pointer flex-col items-center gap-3 rounded-xl border px-4 py-5 text-center transition-all duration-200 motion-reduce:transition-none",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                isSelected
                  ? "border-indigo-300 bg-indigo-50/50 shadow-sm ring-1 ring-indigo-200"
                  : "bg-card hover:border-zinc-300 hover:shadow-sm",
              )}
            >
              <span className="absolute right-3 top-3">
                <RadioDot selected={isSelected} />
              </span>

              <span
                className={cn(
                  "flex size-12 shrink-0 items-center justify-center rounded-xl text-base font-semibold ring-1 transition-colors duration-200 motion-reduce:transition-none",
                  isSelected
                    ? "bg-indigo-700 text-white ring-indigo-700"
                    : "bg-white text-zinc-500 shadow-sm ring-zinc-200",
                )}
              >
                {initialOf(account)}
              </span>

              <span className="flex min-w-0 flex-col gap-1">
                <span
                  className={cn(
                    "line-clamp-2 break-words px-1 text-sm font-semibold leading-5 tracking-tight",
                    isSelected ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {account.name || <Trans>Unnamed account</Trans>}
                </span>
                <span className="truncate font-mono text-[10px] leading-4 text-muted-foreground/80">
                  {account.id}
                </span>
              </span>
            </button>
          )
        })}
      </div>

    </WizardStepShell>
  )
}
