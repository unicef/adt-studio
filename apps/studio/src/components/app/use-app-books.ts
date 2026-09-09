import { useLingui } from "@lingui/react/macro"
import type { BookSummary } from "@/api/client"
import { useBooks } from "@/hooks/use-books"

const NO_BOOKS: BookSummary[] = []

export function useAppBooks() {
  const { i18n } = useLingui()
  const { data, isLoading, error } = useBooks()
  return { books: data ?? NO_BOOKS, locale: i18n.locale, isLoading, error }
}
