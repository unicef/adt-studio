import { Fragment, useLayoutEffect, useRef } from "react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { useLingui } from "@lingui/react/macro"
import { useContextMenu, useEditorSelector, useSelectedIds, type MenuActionId } from "adt-html-editor"
import {
  ArrowUpLeft,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Lock,
  LockOpen,
  Paintbrush,
  PaintBucket,
  Trash2,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

const ICONS: Record<MenuActionId, LucideIcon> = {
  duplicate: CopyPlus,
  delete: Trash2,
  copy: Copy,
  paste: ClipboardPaste,
  "copy-style": Paintbrush,
  "paste-style": PaintBucket,
  "select-parent": ArrowUpLeft,
  lock: Lock,
}

export function CanvasContextMenu() {
  const { t } = useLingui()
  const menu = useContextMenu()
  const selectedIds = useSelectedIds()
  const locked = useEditorSelector((state) => state.locked)
  const unlocking = selectedIds.length > 0 && selectedIds.every((id) => Boolean(locked[id]))
  const returnFocus = useRef<HTMLElement | null>(null)

  useLayoutEffect(() => {
    if (menu.open) returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }, [menu.open])

  const labels: Record<MenuActionId, string> = {
    duplicate: t`Duplicate`,
    delete: t`Delete`,
    copy: t`Copy`,
    paste: t`Paste`,
    "copy-style": t`Copy style`,
    "paste-style": t`Paste style`,
    "select-parent": t`Select parent`,
    lock: unlocking ? t`Unlock` : t`Lock`,
  }

  return (
    <DropdownMenuPrimitive.Root open={menu.open} onOpenChange={(open) => !open && menu.close()}>
      <DropdownMenuPrimitive.Trigger asChild>
        <span aria-hidden className="pointer-events-none fixed size-0" style={{ left: menu.x, top: menu.y }} />
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align="start"
          side="bottom"
          collisionPadding={8}
          aria-label={t`Element actions`}
          onContextMenu={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true })
          }}
          className="z-[70] min-w-[180px] rounded-md border bg-popover py-1 text-xs text-popover-foreground shadow-md"
        >
          {menu.actions.map((action) => {
            const Icon = action.id === "lock" && unlocking ? LockOpen : ICONS[action.id]
            const danger = action.id === "delete"
            return (
              <Fragment key={action.id}>
                {action.separatorBefore && <DropdownMenuPrimitive.Separator className="my-1 border-t" />}
                <DropdownMenuPrimitive.Item
                  disabled={action.disabled}
                  onSelect={() => menu.run(action.id)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left outline-none transition-colors data-[highlighted]:bg-accent data-[disabled]:cursor-default data-[disabled]:opacity-30",
                    danger && "text-red-600 data-[highlighted]:bg-red-50 dark:data-[highlighted]:bg-red-950/30",
                  )}
                >
                  <Icon className={cn("size-3.5", !danger && "text-muted-foreground")} />
                  {labels[action.id]}
                </DropdownMenuPrimitive.Item>
              </Fragment>
            )
          })}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  )
}
