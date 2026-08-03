import { useState, type ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { Check, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ExternalLinkButton } from "./ExternalLinkButton"
import { PermissionList } from "./PermissionList"
import { WizardStepShell } from "./WizardStepShell"
import { CLOUDFLARE_API_TOKENS_URL, CLOUDFLARE_WORKERS_URL } from "./cloudflare-links"

interface Instruction {
  id: string
  text: ReactNode
  extra?: ReactNode
}

const INSTRUCTIONS: readonly Instruction[] = [
  {
    id: "open-tokens",
    text: <Trans>Open your Cloudflare API tokens page.</Trans>,
    extra: (
      <ExternalLinkButton href={CLOUDFLARE_API_TOKENS_URL}>
        <Trans>Open Cloudflare tokens page</Trans>
      </ExternalLinkButton>
    ),
  },
  {
    id: "create-custom",
    text: (
      <Trans>
        Select <strong>Create Token</strong>, then <strong>Create Custom Token</strong> — the last
        option in the list.
      </Trans>
    ),
  },
  {
    id: "name",
    text: (
      <Trans>
        Give the token a name you will recognise later, for example <strong>ADT Studio</strong>.
      </Trans>
    ),
  },
  {
    id: "permissions",
    text: (
      <Trans>
        Under <strong>Permissions</strong>, add these four rows exactly. Use{" "}
        <strong>+ Add more</strong> to get an extra row.
      </Trans>
    ),
    extra: <PermissionList />,
  },
  {
    id: "resources",
    text: (
      <Trans>
        Under <strong>Account Resources</strong>, leave <strong>Include</strong> selected and choose
        your account.
      </Trans>
    ),
  },
  {
    id: "create",
    text: (
      <Trans>
        Select <strong>Continue to summary</strong>, then <strong>Create Token</strong>.
      </Trans>
    ),
  },
  {
    id: "copy-token",
    text: (
      <Trans>
        Copy the token that appears. Cloudflare shows it only once — keep the page open until you
        have pasted it in the next step.
      </Trans>
    ),
  },
  {
    id: "account-id",
    text: (
      <Trans>
        Last thing: copy your <strong>Account ID</strong>. Open Workers &amp; Pages in Cloudflare —
        the Account ID is in the column on the right.
      </Trans>
    ),
    extra: (
      <ExternalLinkButton href={CLOUDFLARE_WORKERS_URL}>
        <Trans>Open Workers &amp; Pages</Trans>
      </ExternalLinkButton>
    ),
  },
]

interface CreateTokenStepProps {
  stepNumber: number
  stepCount: number
  onBack: () => void
  onContinue: () => void
}

export function CreateTokenStep({
  stepNumber,
  stepCount,
  onBack,
  onContinue,
}: CreateTokenStepProps) {
  const [ticked, setTicked] = useState<Record<string, boolean>>({})
  const doneCount = INSTRUCTIONS.filter((instruction) => ticked[instruction.id]).length

  return (
    <WizardStepShell
      stepNumber={stepNumber}
      stepCount={stepCount}
      title={<Trans>Create your Cloudflare token</Trans>}
      description={
        <Trans>
          A token is a long password you create in Cloudflare that lets the Studio put books into
          your account — nothing else. You can delete it at any time, and doing so only stops
          publishing. Follow these steps in Cloudflare, then come back here.
        </Trans>
      }
      footer={
        <>
          <Button variant="outline" onClick={onBack}>
            <Trans>Back</Trans>
          </Button>
          <Button onClick={onContinue}>
            <Trans>I have my token</Trans>
          </Button>
          <span className="text-xs text-muted-foreground" aria-live="polite">
            <Trans>
              {doneCount} of {INSTRUCTIONS.length} ticked off
            </Trans>
          </span>
        </>
      }
    >
      <ol className="flex flex-col gap-2">
        {INSTRUCTIONS.map((instruction, index) => {
          const isTicked = Boolean(ticked[instruction.id])
          return (
            <li
              key={instruction.id}
              className={cn(
                "rounded-lg border p-3 transition-[background-color,border-color,opacity] duration-200 motion-reduce:transition-none",
                isTicked ? "border-border/60 bg-muted/20" : "border-border bg-background",
              )}
            >
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={isTicked}
                  onChange={(event) =>
                    setTicked((prev) => ({ ...prev, [instruction.id]: event.target.checked }))
                  }
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-[background-color,border-color,color] duration-200 motion-reduce:transition-none",
                    isTicked
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
                  )}
                >
                  {isTicked ? (
                    <Check className="size-3.5 motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-200" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span
                  className={cn(
                    "text-sm leading-6 transition-colors duration-200 motion-reduce:transition-none",
                    isTicked ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {instruction.text}
                </span>
              </label>
              {instruction.extra && <div className="mt-2.5 pl-9">{instruction.extra}</div>}
            </li>
          )
        })}
      </ol>

      <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm leading-6 text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <Trans>
          Ticking the boxes is just for you — nothing is sent anywhere. The token itself stays on
          this computer.
        </Trans>
      </p>
    </WizardStepShell>
  )
}
