import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"
import { ApiKeyDialog } from "./ApiKeyDialog"

type BookApiKeyDialogContextValue = {
  openApiKeyDialog: () => void
}

const BookApiKeyDialogContext = createContext<BookApiKeyDialogContextValue>({
  openApiKeyDialog: () => {},
})

export function useBookApiKeyDialog() {
  return useContext(BookApiKeyDialogContext)
}

export function BookApiKeyDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)

  const openApiKeyDialog = useCallback(() => setOpen(true), [])
  const contextValue = useMemo(
    () => ({ openApiKeyDialog }),
    [openApiKeyDialog],
  )

  return (
    <BookApiKeyDialogContext value={contextValue}>
      {children}
      <ApiKeyDialog
        open={open}
        onOpenChange={setOpen}
      />
    </BookApiKeyDialogContext>
  )
}
