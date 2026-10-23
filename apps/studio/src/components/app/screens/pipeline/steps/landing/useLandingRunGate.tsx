import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { useBookStructuredTextAvailability } from "@/hooks/use-api-key"

export interface LandingCheck {
  ok: boolean
  reason: ReactNode
}

export interface LandingRunGate {
  hasProvider: boolean
  blocked: boolean
  disabledReason: ReactNode | undefined
}

export function useLandingRunGate(label: string, slug: string, checks: LandingCheck[] = []): LandingRunGate {
  const hasProvider = useBookStructuredTextAvailability(label)
  const stageName = getStageLabelI18n(slug)
  const failing = [{ ok: hasProvider, reason: <Trans>Set up AI access in Book settings to run {stageName}.</Trans> }, ...checks].find(
    (check) => !check.ok,
  )
  return { hasProvider, blocked: !!failing, disabledReason: failing?.reason }
}
