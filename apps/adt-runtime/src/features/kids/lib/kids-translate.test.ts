import { describe, expect, it } from "vitest"
import { kidsTranslate } from "./kids-translate"

describe("kidsTranslate", () => {
  it("uses the translated template when the key is present and interpolates variables", () => {
    expect(
      kidsTranslate(
        { "kids-buddy-hello": "Hi ${name}" },
        "kids-buddy-hello",
        "Hello ${name}",
        { name: "Mina" },
      ),
    ).toBe("Hi Mina")
  })

  it("uses the fallback when the key is missing and interpolates variables", () => {
    expect(
      kidsTranslate({}, "kids-buddy-hello", "Hello ${name}", {
        name: "Mina",
      }),
    ).toBe("Hello Mina")
  })

  it("uses the fallback when the translated template is empty", () => {
    expect(
      kidsTranslate({ "kids-buddy-hello": "" }, "kids-buddy-hello", "Hello"),
    ).toBe("Hello")
  })

  it("replaces missing variables with an empty string", () => {
    expect(
      kidsTranslate(
        { "kids-buddy-hello": "Hi ${name}" },
        "kids-buddy-hello",
        "Hello ${name}",
        {},
      ),
    ).toBe("Hi ")
  })
})
