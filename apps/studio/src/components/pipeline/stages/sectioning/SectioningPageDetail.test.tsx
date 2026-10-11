// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

const { tMock } = vi.hoisted(() => ({
  tMock(strings: TemplateStringsArray, ...values: unknown[]) {
    return strings.map((part, i) => part + (i < values.length ? String(values[i]) : "")).join("")
  },
}))
vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({ t: tMock }),
  Trans: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}))

const updateSectioning = vi.fn(async () => ({ version: 2 }))
const cloneSection = vi.fn(async () => ({ version: 2 }))
const getPage = vi.fn()
const queryClient = { invalidateQueries: vi.fn(async () => {}), setQueryData: vi.fn() }
vi.mock("@/api/client", async (original) => ({
  ...await original<typeof import("@/api/client")>(),
  api: {
    updateSectioning: (...args: unknown[]) => updateSectioning(...args),
    cloneSection: (...args: unknown[]) => cloneSection(...args),
    getActiveConfig: async () => ({ merged: {} }),
    getPage: (...args: unknown[]) => getPage(...args),
  },
}))

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { merged: { section_types: { text: "Text" } } } }),
  useQueryClient: () => queryClient,
}))

vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    disabled,
  }: {
    children: React.ReactNode
    disabled?: boolean
  }) => (
    <div data-testid="section-type-select" data-disabled={disabled ? "true" : "false"}>
      {children}
    </div>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Module-level `msg` macros need the lingui compiler, which isn't in play here.
vi.mock("@/lib/section-constants", () => ({
  getSectionTypeLabel: (key: string) => key,
  getSectionTypeDescription: () => "",
}))

vi.mock("@/hooks/use-pages", () => ({ usePageImage: () => ({ data: undefined }) }))
vi.mock("@/hooks/use-page-mutations", () => ({ invalidateStoryboardDependents: vi.fn() }))
vi.mock("../../components/StepViewRouter", () => ({
  useStepHeader: () => ({ headerSlotEl: null }),
}))
vi.mock("../../components/change-summary", () => ({
  usePendingChanges: () => ({ label: null, labelKey: undefined }),
}))

// Capture the entry the component registers with the shared floating save bar,
// so the test can trigger the bar's Save exactly as the real bar would.
let savedEntry: {
  onSave?: () => void
  onSaveStay?: () => Promise<void>
  resetStages?: string[]
} = {}
vi.mock("../../components/floating-save", () => ({
  useFloatingSave: (entry: {
    onSave?: () => void
    onSaveStay?: () => Promise<void>
    resetStages?: string[]
  }) => {
    savedEntry = entry
  },
}))

// Two completed downstream stages, so a save has something to reset.
vi.mock("@/hooks/use-downstream-with-output", () => ({
  useDownstreamWithOutput: () => ["storyboard", "package"],
}))

// The component deliberately does NOT consult this hook — render mode must not
// gate the save confirmation. Mocked anyway so that re-introducing the old
// fixed-layout exemption makes the second test below fail instead of silently
// reinstating the bug.
const isFixedLayout = vi.fn(() => false)
vi.mock("@/hooks/use-fixed-layout", () => ({
  useIsFixedLayout: () => isFixedLayout(),
}))

// The confirmation dialog is stubbed down to a marker: this suite is about
// WHETHER it is raised, not how it renders (covered by CascadeResetDialog.test).
vi.mock("../../components/CascadeResetDialog", () => ({
  CascadeResetDialog: ({
    title,
    onConfirm,
  }: {
    title: React.ReactNode
    onConfirm: () => void
  }) => (
    <div data-testid="cascade-dialog">
      {title}
      <button type="button" onClick={onConfirm}>confirm operation</button>
    </div>
  ),
}))

// Stub the tree editor down to one button that reports a local section edit,
// which is what makes the component dirty.
vi.mock("@/components/section-tree-editor/SectionTreeEditor", () => ({
  SectionTreeEditor: ({
    section,
    onChange,
    disabled,
  }: {
    section: { sectionId: string }
    onChange: (next: unknown) => void
    disabled?: boolean
  }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange({ ...section, sectionType: "edited" })}
    >
      edit
    </button>
  ),
}))

vi.mock("@/components/pipeline/stages/storyboard/components/SectionActionsDropdown", () => ({
  SectionActionsDropdown: ({ onClone }: { onClone: () => void }) => (
    <button type="button" onClick={onClone}>duplicate section</button>
  ),
}))

import { SectioningPageDetail } from "./SectioningPageDetail"
import { ApiError, type PageDetail } from "@/api/client"

const page = {
  pageId: "bk_p1",
  pageNumber: 1,
  text: "hello",
  imageClassification: null,
  imageCropping: null,
  versions: { sectioning: 1 },
  sectioningTree: {
    reasoning: "r",
    sections: [{ sectionId: "bk_p1_sec001", sectionType: "text", nodes: [] }],
  },
} as unknown as PageDetail

function renderDetail() {
  return render(
    <SectioningPageDetail
      bookLabel="bk"
      pageId="bk_p1"
      page={page}
      navigationExtra={null}
      navigationArrows={null}
    />,
  )
}

/** Make a local edit, then trigger the floating bar's Save. */
function editAndSave() {
  fireEvent.click(screen.getByText("edit"))
  // The bar lives outside this tree, so its Save is invoked through the
  // registered entry rather than by clicking a rendered button.
  act(() => {
    savedEntry.onSave?.()
  })
}

describe("SectioningPageDetail — save confirmation", () => {
  beforeEach(() => {
    savedEntry = {}
    updateSectioning.mockClear()
    cloneSection.mockClear()
    isFixedLayout.mockReturnValue(false)
  })
  afterEach(cleanup)

  it("confirms before saving when completed downstream stages would be reset", () => {
    renderDetail()
    expect(savedEntry.resetStages).toEqual(["storyboard", "package"])
    editAndSave()

    expect(screen.getByTestId("cascade-dialog")).toBeTruthy()
    // Nothing is written until the user confirms.
    expect(updateSectioning).not.toHaveBeenCalled()
  })

  it("confirms for fixed-layout books too, since the API resets them all the same", () => {
    // `markStoryboardChainStale` in apps/api/src/routes/pages.ts clears the whole
    // chain for every page-sectioning save regardless of render mode, and quiz
    // generation reads the semantic sectioning even in fixed-layout. Skipping the
    // warning here would silently discard completed audio and packaged output.
    isFixedLayout.mockReturnValue(true)
    renderDetail()
    editAndSave()

    expect(screen.getByTestId("cascade-dialog")).toBeTruthy()
    expect(updateSectioning).not.toHaveBeenCalled()
  })

  it("returns the in-flight save so navigation waits for the existing PUT", async () => {
    let resolveUpdate!: (value: { version: number }) => void
    const updateResult = new Promise<{ version: number }>((resolve) => {
      resolveUpdate = resolve
    })
    updateSectioning.mockImplementationOnce(() => updateResult)
    renderDetail()
    fireEvent.click(screen.getByText("edit"))

    let first!: Promise<void>
    let second!: Promise<void>
    act(() => {
      first = savedEntry.onSaveStay?.() as Promise<void>
      second = savedEntry.onSaveStay?.() as Promise<void>
    })

    expect(first).toBe(second)
    expect(updateSectioning).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveUpdate({ version: 2 })
      await first
    })
  })

  it("allows saving after explicitly retaining an overlapping draft at the refreshed version", async () => {
    getPage.mockResolvedValue({ ...page, versions: { sectioning: 2 }, sectioningTree: { ...page.sectioningTree, sections: [{ ...page.sectioningTree!.sections[0], sectionType: "remote" }] } })
    updateSectioning.mockRejectedValueOnce(new ApiError("Content changed", 409))
    renderDetail()
    fireEvent.click(screen.getByText("edit"))
    await act(async () => { await expect(savedEntry.onSaveStay!()).rejects.toThrow("Content changed") })
    fireEvent.click(screen.getByRole("button", { name: "Keep my conflicting edits" }))
    await act(async () => { await savedEntry.onSaveStay!() })
    expect(updateSectioning).toHaveBeenLastCalledWith("bk", "bk_p1", expect.objectContaining({ baseVersion: 2, sections: [expect.objectContaining({ sectionType: "edited" })] }))
  })

  it("disables every editor while a structural operation is in flight", async () => {
    let resolveClone!: (value: { version: number }) => void
    const cloneResult = new Promise<{ version: number }>((resolve) => {
      resolveClone = resolve
    })
    cloneSection.mockImplementationOnce(() => cloneResult)
    renderDetail()

    const editButton = screen.getByRole("button", { name: "edit" }) as HTMLButtonElement
    const typeSelect = screen.getByTestId("section-type-select")
    expect(editButton.disabled).toBe(false)
    expect(typeSelect.getAttribute("data-disabled")).toBe("false")

    fireEvent.click(screen.getByRole("button", { name: "duplicate section" }))
    fireEvent.click(screen.getByRole("button", { name: "confirm operation" }))

    expect(cloneSection).toHaveBeenCalledTimes(1)
    expect(editButton.disabled).toBe(true)
    expect(typeSelect.getAttribute("data-disabled")).toBe("true")

    await act(async () => {
      resolveClone({ version: 2 })
      await cloneResult
    })

    expect(editButton.disabled).toBe(false)
    expect(typeSelect.getAttribute("data-disabled")).toBe("false")
  })
})
