import { useLingui } from "@lingui/react/macro"
import { PanelRightClose } from "lucide-react"

export interface AiPanelShellProps {
  title: React.ReactNode
  meta?: React.ReactNode
  onCollapse: () => void
  children: React.ReactNode
  footer: React.ReactNode
}

/**
 * Frame shared by the AI rail panels: header with the panel switcher, a
 * scrolling body, and a pinned composer.
 */
export function AiPanelShell({
  title,
  meta,
  onCollapse,
  children,
  footer,
}: AiPanelShellProps) {
  const { t } = useLingui()

  return (
    <div className="flex h-full w-[326px] flex-col border-l bg-card">
      <div className="flex items-center gap-2 border-b px-3.5 py-3">
        {title}
        <span className="ml-auto min-w-0 truncate text-[11px] text-muted-foreground">
          {meta}
        </span>
        <button
          type="button"
          onClick={onCollapse}
          title={t`Hide the AI panel`}
          aria-label={t`Hide the AI panel`}
          className="-mr-1 grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <PanelRightClose className="size-3.5" />
        </button>
      </div>
      {children}
      <div className="border-t p-3">{footer}</div>
    </div>
  )
}
