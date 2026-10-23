import { Trans } from "@lingui/react/macro"
import { StepEmptyHint } from "../ui"

export function NoMatches({ query, noun, onClear }: { query: string; noun: string; onClear: () => void }) {
  const text = query.trim()
  return (
    <StepEmptyHint>
      <span className="flex flex-col items-center gap-2">
        {text ? <Trans>No {noun} match “{text}”</Trans> : <Trans>No {noun} to show</Trans>}
        {text && (
          <button type="button" onClick={onClear} className="font-medium text-foreground underline-offset-4 hover:underline">
            <Trans>Clear search</Trans>
          </button>
        )}
      </span>
    </StepEmptyHint>
  )
}
