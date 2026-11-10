import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { StepRail } from "../shared/ui"
import type { ValidationTab } from "./useValidationTab"

export function ValidationRail({
  hex,
  tab,
  onTab,
  issueCount,
  reviewCount,
  reviewerEnabled,
  sessionCount,
}: {
  hex: string
  tab: ValidationTab
  onTab: (tab: ValidationTab) => void
  issueCount: number
  reviewCount: number
  reviewerEnabled: boolean
  sessionCount: number
}) {
  const { t } = useLingui()
  return (
    <StepRail
      heading={<Trans>Checks</Trans>}
      hex={hex}
      searchPlaceholder={t`Find a check`}
      entries={[
        {
          key: "accessibility",
          title: t`Accessibility`,
          count: issueCount,
          subtitle: t`${plural(issueCount, { one: "# problem", other: "# problems" })} · ${plural(reviewCount, { one: "# to check", other: "# to check" })}`,
        },
        ...(reviewerEnabled
          ? [
              {
                key: "reviewer",
                title: t`Reviews`,
                count: sessionCount,
                subtitle:
                  sessionCount > 0
                    ? t`${plural(sessionCount, { one: "# review from Preview", other: "# reviews from Preview" })}`
                    : t`None yet. Start one in Preview.`,
              },
            ]
          : []),
      ]}
      activeKey={tab}
      onSelect={(key) => onTab(key === "reviewer" ? "reviewer" : "accessibility")}
      footer={<Trans>Whole-book checks on the packaged output, plus reviewer findings captured from Preview.</Trans>}
    />
  )
}
