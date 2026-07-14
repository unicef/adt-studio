// @vitest-environment jsdom
import { cleanup, render, act } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import { afterEach, describe, expect, it } from "vitest"
import { translationsAtom } from "@/features/language/state/language.atoms"
import { useKidsTranslation } from "./useKidsTranslation"

afterEach(() => {
  cleanup()
  localStorage.clear()
})

function TranslationProbe() {
  const { tk } = useKidsTranslation()
  return (
    <span data-testid="translation">
      {tk("kids-buddy-hello", "Hello ${name}", { name: "Mina" })}
    </span>
  )
}

describe("useKidsTranslation", () => {
  it("reflects the current translationsAtom value", () => {
    const store = createStore()
    store.set(translationsAtom, {
      "kids-buddy-hello": "Hi ${name}",
    })

    const { getByTestId } = render(
      <Provider store={store}>
        <TranslationProbe />
      </Provider>,
    )

    expect(getByTestId("translation").textContent).toBe("Hi Mina")

    act(() => {
      store.set(translationsAtom, {
        "kids-buddy-hello": "Welcome ${name}",
      })
    })

    expect(getByTestId("translation").textContent).toBe("Welcome Mina")
  })
})
