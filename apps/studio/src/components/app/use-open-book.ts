import { useNavigate } from "@tanstack/react-router"

/** Opening a book lands on its pipeline. Shared so every surface that shows a
 *  book — home cards, library rows, search results — agrees on the target. */
export function useOpenBook(): (label: string) => void {
  const navigate = useNavigate()
  return (label: string) => navigate({ to: "/pipeline/$label", params: { label }, search: {} })
}
