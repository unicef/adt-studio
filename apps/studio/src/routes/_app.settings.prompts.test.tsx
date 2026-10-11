// @vitest-environment jsdom
import { useState } from "react"
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createRouter, createRootRoute, createRoute, createMemoryHistory, RouterProvider, Outlet, Link } from "@tanstack/react-router"
import { useFloatingSave } from "@/components/pipeline/components/floating-save"
import { Route } from "./_app.settings.prompts"
vi.mock("@/components/close-guard/CloseGuard", () => ({ useCloseIntent: () => {} }))
vi.mock("@/components/pipeline/pipeline-i18n", () => ({ getStageLabelI18n: (slug: string) => slug }))
vi.mock("@/components/pipeline/settings-tabs", () => ({ getSettingsTabLabel: (_stage: string, tab: string) => tab }))
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: {children: unknown}) => children,
  useLingui: () => ({ t: (parts: TemplateStringsArray, ...args: unknown[]) => parts.reduce((s, p, i) => s+p+(args[i] ?? ""), ""), i18n: { _: (value: {message?: string}) => value.message ?? "" } }),
}))
vi.mock("@/components/app/screens/settings/PromptsSection", () => ({ PromptsSection: function TestPrompt() {
  const [dirty, setDirty] = useState(false)
  useFloatingSave({ id: "global-prompts", dirty, saving: false, onSave: async () => { setDirty(false) }, onDiscard: () => setDirty(false) })
  return <><button onClick={() => setDirty(true)}>Type prompt</button><Link to="/other">Leave settings</Link></>
} }))
afterEach(cleanup)
it("the real global prompts route keeps the shared navigation guard mounted", async () => {
  const root = createRootRoute({ component: Outlet })
  const prompts = createRoute({ getParentRoute: () => root, path: "/prompts", component: Route.options.component })
  const other = createRoute({ getParentRoute: () => root, path: "/other", component: () => <div>Other page</div> })
  const router = createRouter({ routeTree: root.addChildren([prompts, other]), history: createMemoryHistory({ initialEntries: ["/prompts"] }) })
  render(<QueryClientProvider client={new QueryClient()}><RouterProvider router={router} /></QueryClientProvider>)
  fireEvent.click(await screen.findByText("Type prompt"))
  fireEvent.click(screen.getByText("Leave settings"))
  expect(await screen.findByRole("alertdialog")).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Stay" }))
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  expect(router.state.location.pathname).toBe("/prompts")
  fireEvent.click(screen.getByText("Leave settings"))
  fireEvent.click(await screen.findByRole("button", { name: "Save & leave" }))
  await waitFor(() => expect(router.state.location.pathname).toBe("/other"))
})
