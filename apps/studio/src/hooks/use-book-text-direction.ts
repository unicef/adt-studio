import { getTextDirection, type TextDirection } from "@adt/types"
import { useActiveConfig } from "@/hooks/use-debug"
import { useBook } from "@/hooks/use-books"

/**
 * Writing direction of the book's source language — the configured editing
 * language, else the one detected at extraction. Returns "ltr" until the book
 * has loaded, the same default the packaged reader uses.
 */
export function useBookTextDirection(label: string): TextDirection {
  const { data: activeConfig } = useActiveConfig(label)
  const { data: book } = useBook(label)
  return getTextDirection(
    (activeConfig?.merged?.editing_language as string | undefined) ??
      book?.languageCode ??
      book?.metadata?.language_code,
  )
}
