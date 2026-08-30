import { useLingui } from "@lingui/react/macro"
import { Check, History, Pencil, Plus, Trash2 } from "lucide-react"
import { ActionMenu, type ActionMenuEntry } from "@/components/ui/action-menu"
import type { ChatThreadSummary } from "@/api/client"

export interface ChatThreadMenuProps {
  threads: ChatThreadSummary[]
  activeThreadId: string | null
  onSelect: (threadId: string) => void
  onCreate: () => void
  onRename: (threadId: string) => void
  onDelete: (threadId: string) => void
  disabled?: boolean
}

const MAX_LISTED_THREADS = 12

export function ChatThreadMenu({
  threads,
  activeThreadId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  disabled,
}: ChatThreadMenuProps) {
  const { t } = useLingui()
  const listed = threads.slice(0, MAX_LISTED_THREADS)

  const entries: ActionMenuEntry[] = [
    { icon: Plus, label: t`New chat`, onClick: onCreate },
    { separator: true },
    ...listed.map((thread) => ({
      icon: thread.threadId === activeThreadId ? Check : undefined,
      label: thread.title || t`Untitled chat`,
      onClick: () => onSelect(thread.threadId),
    })),
    { separator: true },
    {
      icon: Pencil,
      label: t`Rename this chat`,
      onClick: () => activeThreadId && onRename(activeThreadId),
      hidden: !activeThreadId,
    },
    {
      icon: Trash2,
      label: t`Delete this chat`,
      onClick: () => activeThreadId && onDelete(activeThreadId),
      danger: true,
      hidden: !activeThreadId,
    },
  ]

  return (
    <ActionMenu
      trigger={<History className="size-3.5" />}
      triggerAriaLabel={t`Chat history`}
      triggerClassName="grid size-10 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      triggerDisabled={disabled}
      items={entries}
      menuClassName="w-60"
    />
  )
}
