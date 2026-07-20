import { useEffect, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { Trans } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import { useBooks, useDeleteBook } from "@/hooks/use-books"
import { usePageTitle } from "@/hooks/use-page-title"
import { useSettingsDialog } from "@/routes/__root"
import { DeleteBookDialog } from "@/components/books/DeleteBookDialog"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AppSidebar } from "./AppSidebar"
import { CommandPalette } from "./CommandPalette"
import { AddBookDialog } from "./AddBookDialog"
import { HomeScreen } from "./screens/HomeScreen"
import { LibraryScreen } from "./screens/LibraryScreen"
import { HandoffsScreen } from "./screens/HandoffsScreen"
import { SettingsScreen } from "./screens/SettingsScreen"
import { Kbd } from "./ui/Kbd"
import type { RedesignView } from "./types"
import "./redesign.css"

const SHORTCUTS: { keys: string[]; label: MessageDescriptor }[] = [
  { keys: ["⌘", "K"], label: msg`Open command palette` },
  { keys: ["G", "H"], label: msg`Go to Home` },
  { keys: ["G", "L"], label: msg`Go to Library` },
  { keys: ["N"], label: msg`Add a book` },
  { keys: ["?"], label: msg`Show this help` },
]

/** Mock count matching the design's Split & merge sample data. */
const HANDOFFS_COUNT = 3

export function RedesignShell() {
  const { t, i18n } = useLingui()
  usePageTitle(t`ADT Studio`)
  const { openSettings } = useSettingsDialog()
  const { data: books, isLoading, error } = useBooks()
  const deleteMutation = useDeleteBook()

  const [view, setView] = useState<RedesignView>("home")
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

  const bookList = books ?? []
  const locale = i18n.locale

  const navigateView = (next: RedesignView) => {
    setView(next)
    setPaletteOpen(false)
  }

  return (
    <div className="adt-redesign flex h-full w-full overflow-hidden bg-background text-foreground">
      <AppSidebar
        activeView={view}
        onNavigate={navigateView}
        libraryCount={bookList.length}
        handoffsCount={HANDOFFS_COUNT}
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenAdd={() => setAddOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      />

      <div className="min-h-0 min-w-0 flex-1">
        {view === "handoffs" ? (
          <HandoffsScreen />
        ) : view === "settings" ? (
          <SettingsScreen onOpenApiKeys={openSettings} />
        ) : isLoading ? (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">
            <Trans>Loading…</Trans>
          </div>
        ) : error ? (
          <div className="grid h-full place-items-center p-6 text-center text-sm text-destructive">
            {t`Failed to load books:`} {error.message}
          </div>
        ) : view === "home" ? (
          <HomeScreen books={bookList} locale={locale} onOpenAdd={() => setAddOpen(true)} onNavigate={navigateView} />
        ) : (
          <LibraryScreen books={bookList} locale={locale} onOpenAdd={() => setAddOpen(true)} onDelete={setDeleteLabel} />
        )}
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        books={bookList}
        locale={locale}
        onNavigate={navigateView}
        onOpenAdd={() => {
          setPaletteOpen(false)
          setAddOpen(true)
        }}
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
  )
}
