import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Globe, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ExpiryChoice } from "./ExpiryChoice"
import {
  DEFAULT_EXPIRY_CHOICE,
  expiryChoiceToIso,
  type ExpiryChoiceValue,
} from "./expiry-options"

interface PublishStartStateProps {
  kind: "first" | "again"
  isRunning: boolean
  hasFailed?: boolean
  onPublish: (expiresAt: string | null) => void
}

export function PublishStartState({
  kind,
  isRunning,
  hasFailed = false,
  onPublish,
}: PublishStartStateProps) {
  const { t } = useLingui()
  const [choice, setChoice] = useState<ExpiryChoiceValue>(DEFAULT_EXPIRY_CHOICE)

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-6 text-muted-foreground">
        {kind === "first" ? (
          <Trans>
            Publishing puts a frozen copy of the book online — exactly as it looks right now — and
            gives you a link to share. You keep editing freely afterwards: the shared copy only
            changes when you choose "Update site".
          </Trans>
        ) : (
          <Trans>
            Publishing again puts the book online as it looks right now, with a fresh link. The old
            link stays closed.
          </Trans>
        )}
      </p>

      <ExpiryChoice
        value={choice}
        onChange={setChoice}
        disabled={isRunning}
        label={t`How long should the link work?`}
      />
      <p className="-mt-1 text-xs leading-5 text-muted-foreground">
        <Trans>You can change this later, or stop sharing at any time.</Trans>
      </p>

      <div>
        <Button
          data-testid="publish-start-button"
          disabled={isRunning}
          onClick={() => onPublish(expiryChoiceToIso(choice))}
        >
          {isRunning ? (
            <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <Globe aria-hidden="true" />
          )}
          {isRunning ? (
            <Trans>Publishing…</Trans>
          ) : hasFailed ? (
            <Trans>Try publishing again</Trans>
          ) : kind === "first" ? (
            <Trans>Publish and get a link</Trans>
          ) : (
            <Trans>Publish again</Trans>
          )}
        </Button>
      </div>
    </div>
  )
}
