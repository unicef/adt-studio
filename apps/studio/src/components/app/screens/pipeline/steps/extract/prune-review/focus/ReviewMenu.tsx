import { useLingui } from "@lingui/react/macro"
import { ClipboardCheck, ClipboardCopy, Eye, EyeOff, MoreHorizontal, RotateCcw, Sparkles, X } from "lucide-react"
import { ActionMenu, type ActionMenuEntry } from "@/components/ui/action-menu"
import type { JudgingApi } from "../judge/useJudging"
import type { ReviewSession } from "../step/useReviewSession"

export function ReviewMenu({
  session,
  judge,
  showAll,
  onShowAll,
  total,
  onAskAi,
  onClose,
}: {
  session: ReviewSession
  judge: JudgingApi
  showAll: boolean
  onShowAll: (value: boolean) => void
  total: number
  onAskAi: (() => void) | null
  onClose: (() => void) | null
}) {
  const { t } = useLingui()
  const items: ActionMenuEntry[] = [
    { icon: showAll ? EyeOff : Eye, label: showAll ? t`Only the ones worth checking` : t`Include every left-out picture (${total})`, onClick: () => onShowAll(!showAll) },
    { icon: Sparkles, label: t`Ask AI for a second look`, onClick: () => onAskAi?.(), hidden: !onAskAi },
    { separator: true },
    { icon: ClipboardCheck, label: judge.enabled ? t`Turn off judge mode` : t`Judge mode (for testing)`, onClick: () => judge.setEnabled(!judge.enabled) },
    { icon: ClipboardCopy, label: judge.copied ? t`Copied` : t`Copy results`, onClick: judge.copyResults, hidden: judge.stored === 0 },
    { separator: true },
    { icon: RotateCcw, label: t`Start over`, onClick: session.restart, hidden: !session.started },
    { icon: X, label: t`Close the review`, onClick: () => onClose?.(), hidden: !onClose },
  ]
  return (
    <ActionMenu
      trigger={<MoreHorizontal className="size-4" />}
      triggerAriaLabel={t`More review options`}
      triggerClassName="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      items={items}
    />
  )
}
