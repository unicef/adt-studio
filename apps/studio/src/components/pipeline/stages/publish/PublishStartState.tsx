import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Globe, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AccessChoice } from "./AccessChoice"
import { ExpiryChoice } from "./ExpiryChoice"
import {
  DEFAULT_INCLUDE_CHOICE,
  IncludeChoice,
  includeChoiceToFeatures,
  type IncludeChoiceValue,
} from "./IncludeChoice"
import {
  DEFAULT_ACCESS_CHOICE,
  generateAccessCode,
  isValidAccessCode,
  normalizeAccessCodeInput,
  type AccessChoiceValue,
} from "./access-code"
import {
  DEFAULT_EXPIRY_CHOICE,
  expiryChoiceToIso,
  type ExpiryChoiceValue,
} from "./expiry-options"
import type { AvailableExportFeatures } from "@/hooks/use-export-features"
import type { PublishFeatureSelection } from "@adt/types"

interface PublishStartStateProps {
  /** What this book actually has, resolved by the caller — this form stays a leaf so it can be
   *  rendered in a test without the pipeline's run context. */
  available: AvailableExportFeatures
  kind: "first" | "again"
  isRunning: boolean
  /** Set when something else on the panel is the primary way forward — today that is
   *  "Resume sharing" on a revoked publication. */
  secondary?: boolean
  onPublish: (options: {
    expiresAt: string | null
    accessCode: string | null
    features?: PublishFeatureSelection
  }) => void
}

export function PublishStartState({
  available,
  kind,
  isRunning,
  secondary = false,
  onPublish,
}: PublishStartStateProps) {
  const { t } = useLingui()
  const [choice, setChoice] = useState<ExpiryChoiceValue>(DEFAULT_EXPIRY_CHOICE)
  const [access, setAccess] = useState<AccessChoiceValue>(DEFAULT_ACCESS_CHOICE)
  /** Generated once per mount so the code the author is looking at is the code that gets
   *  published — it must not change under them while they copy it. */
  const [code, setCode] = useState(() => generateAccessCode())
  const [include, setInclude] = useState<IncludeChoiceValue>(DEFAULT_INCLUDE_CHOICE)
  const codeReady = access === "open" || isValidAccessCode(code)

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-6 text-muted-foreground">
        {kind === "first" ? (
          <Trans>
            Publishing puts a frozen copy of the book online — exactly as it looks right now — and
            gives you a link to share. You keep editing freely afterwards: the shared copy only
            changes when you choose "Update site".
          </Trans>
        ) : secondary ? (
          <Trans>
            Publishing again gets you a new address instead — the old link stays off, and you share
            the new one with everybody again.
          </Trans>
        ) : (
          <Trans>
            Publishing again puts the book online as it looks right now, with a fresh link. The old
            link stays closed.
          </Trans>
        )}
      </p>

      <AccessChoice
        value={access}
        onChange={setAccess}
        code={code}
        onCodeChange={(next) => setCode(normalizeAccessCodeInput(next))}
        onRegenerate={() => setCode(generateAccessCode())}
        disabled={isRunning}
      />

      <IncludeChoice
        value={include}
        onChange={setInclude}
        available={available}
        disabled={isRunning}
      />

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
          variant={secondary ? "outline" : "default"}
          disabled={isRunning || !codeReady}
          onClick={() =>
            onPublish({
              expiresAt: expiryChoiceToIso(choice),
              accessCode: access === "code" ? normalizeAccessCodeInput(code) : null,
              ...(includeChoiceToFeatures(include) === undefined
                ? {}
                : { features: includeChoiceToFeatures(include) }),
            })
          }
        >
          {isRunning ? (
            <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <Globe aria-hidden="true" />
          )}
          {isRunning ? (
            <Trans>Publishing…</Trans>
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
