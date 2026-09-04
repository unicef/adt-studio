import { useCallback, useEffect, useMemo, useState } from "react"
import { Outlet, useRouterState } from "@tanstack/react-router"
import { useLingui } from "@lingui/react/macro"
import { Trans } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import { useDeleteBook } from "@/hooks/use-books"
import { usePageTitle } from "@/hooks/use-page-title"
import { DeleteBookDialog } from "@/components/books/DeleteBookDialog"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AppSidebar } from "./AppSidebar"
import { CommandPalette } from "./CommandPalette"
import { AddBookDialog } from "./AddBookDialog"
import { AppShellContext } from "./AppShellContext"
import { useAppBooks } from "./use-app-books"
import { Kbd, MOD_KEY } from "./ui/Kbd"
import { ComingSoonBanner } from "./screens/settings/ui"
import { isFullBleedAppView } from "./nav"

// Only the palette has a handler; the rest are still unimplemented, so the
// dialog advertises this one and says the others are coming.
const SHORTCUTS: { keys: string[]; label: MessageDescriptor }[] = [
  { keys: [MOD_KEY, "K"], label: msg`Open command palette` },
]

export function AppLayout() {
  const { t, i18n } = useLingui()
  const pathname = useRouterState({
    select: (state) => state.matches[state.matches.length - 1]?.pathname ?? state.location.pathname,
  })
  const isFullBleed = isFullBleedAppView(pathname)
  usePageTitle(t`ADT Studio`)
  const { books, locale } = useAppBooks()
  const deleteMutation = useDeleteBook()

  const [paletteOpen, setPaletteOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [deleteLabel, setDeleteLabel] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const closePalette = useCallback(() => setPaletteOpen(false), [])
  const openAdd = useCallback(() => setAddOpen(true), [])
  const openAddFromPalette = useCallback(() => {
    setPaletteOpen(false)
    setAddOpen(true)
  }, [])

  const shell = useMemo(() => ({ openAdd, requestDelete: setDeleteLabel }), [openAdd])

  const handoffsCount = books.filter((b) => b.split || b.part).length

  return (
    <AppShellContext value={shell}>
      <div className="flex h-full w-full overflow-hidden bg-background text-foreground">
        {!isFullBleed && (
          <AppSidebar
            libraryCount={books.length}
            handoffsCount={handoffsCount}
            onOpenPalette={() => setPaletteOpen(true)}
            onOpenAdd={openAdd}
            onOpenShortcuts={() => setShortcutsOpen(true)}
          />
        )}

        <div className="min-h-0 min-w-0 flex-1">
          <Outlet />
        </div>

        <CommandPalette
          open={paletteOpen}
          onClose={closePalette}
          books={books}
          locale={locale}
          onOpenAdd={openAddFromPalette}
        />
        <AddBookDialog open={addOpen} onClose={() => setAddOpen(false)} />

        <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
          <DialogContent className="max-w-[440px]">
            <DialogHeader>
              <DialogTitle>
                <Trans>Keyboard shortcuts</Trans>
              </DialogTitle>
            </DialogHeader>
            <div className="-mt-1">
              {SHORTCUTS.map((s) => (
                <div key={s.keys.join("+")} className="flex items-center border-t py-2.5 first:border-t-0">
                  <span className="text-[13px]">{i18n._(s.label)}</span>
                  <Kbd keys={s.keys} className="ml-auto" />
                </div>
              ))}
              <ComingSoonBanner className="mt-2.5">
                <Trans>
                  More shortcuts — quick navigation, adding a book, opening this dialog — are still
                  in development.
                </Trans>
              </ComingSoonBanner>
            </div>
          </DialogContent>
        </Dialog>

        <DeleteBookDialog
          label={deleteLabel}
          isPending={deleteMutation.isPending}
          onConfirm={() => {
            if (deleteLabel) {
              deleteMutation.mutate(deleteLabel, { onSuccess: () => setDeleteLabel(null) })
            }
          }}
          onCancel={() => setDeleteLabel(null)}
        />
      </div>
    </AppShellContext>
  )
}
