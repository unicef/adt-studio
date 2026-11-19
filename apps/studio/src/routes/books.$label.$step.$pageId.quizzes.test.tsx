// @vitest-environment jsdom
import React from "react"
import { afterEach, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

const navigate = vi.fn()

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: React.ComponentType }) => ({
    options,
    useParams: () => ({ label: "book", step: "quizzes", pageId: "pg001" }),
  }),
  useNavigate: () => navigate,
}))

vi.mock("@/components/pipeline/components/StepViewRouter", () => ({
  StepViewRouter: ({ step, bookLabel, selectedPageId, onSelectPage }: {
    step: string
    bookLabel: string
    selectedPageId?: string
    onSelectPage: (pageId: string | null) => void
  }) => <button onClick={() => onSelectPage(null)}>{bookLabel}/{step}/{selectedPageId}</button>,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

it("#863: forwards a direct Quizzes URL's pageId and clears it through route navigation", async () => {
  const { Route } = await import("./books.$label.$step.$pageId")
  const Page = Route.options.component as React.ComponentType
  render(<Page />)

  fireEvent.click(screen.getByRole("button", { name: "book/quizzes/pg001" }))
  expect(navigate).toHaveBeenCalledExactlyOnceWith({
    to: "/books/$label/$step",
    params: { label: "book", step: "quizzes" },
  })
})
