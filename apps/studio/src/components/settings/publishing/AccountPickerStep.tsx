import { useState } from "react"
import { Trans } from "@lingui/react/macro"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { CloudflareOAuthAccount } from "@/api/client"
import { WizardStepShell } from "./WizardStepShell"

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
        <Button onClick={() => onConfirm(selected)} disabled={!selected || isConfirming}>
          {isConfirming && (
            <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          )}
          <Trans>Use this account</Trans>
        </Button>
      }
    >
      <div role="radiogroup" className="flex flex-col gap-2" data-testid="oauth-account-picker">
        {accounts.map((account) => {
          const isSelected = account.id === selected
          return (
            <label
              key={account.id}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-[background-color,border-color] duration-200 motion-reduce:transition-none",
                isSelected ? "border-primary bg-primary/5" : "border-border bg-background",
              )}
            >
              <input
                type="radio"
                name="cloudflare-account"
                className="size-4 accent-primary"
                value={account.id}
                checked={isSelected}
                onChange={() => setSelected(account.id)}
              />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-foreground">
                  {account.name || account.id}
                </span>
                <span className="truncate font-mono text-xs text-muted-foreground">
                  {account.id}
                </span>
              </span>
            </label>
          )
        })}
      </div>
    </WizardStepShell>
  )
}
