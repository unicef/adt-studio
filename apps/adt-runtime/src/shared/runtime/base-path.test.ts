// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { runtimeDir, toSnakeCaseDirName } from "./base-path"

describe("toSnakeCaseDirName", () => {
  it("lowercases and separates words with underscores", () => {
    expect(toSnakeCaseDirName("pt-BR")).toBe("pt_br")
    expect(toSnakeCaseDirName("en-us")).toBe("en_us")
    expect(toSnakeCaseDirName("interface_translations")).toBe("interface_translations")
    expect(toSnakeCaseDirName("es")).toBe("es")
  })

  it("strips accents, special characters and spaces", () => {
    expect(toSnakeCaseDirName("Áudios Extras")).toBe("audios_extras")
    expect(toSnakeCaseDirName("ção--#1")).toBe("cao_1")
  })

  it("never starts with a digit", () => {
    expect(toSnakeCaseDirName("1-unidade")).toBe("dir_1_unidade")
  })
})

describe("runtimeDir", () => {
  afterEach(() => {
    document.head.innerHTML = ""
  })

  it("keeps folder names as-is without the adt-dir-naming meta", () => {
    expect(runtimeDir("pt-BR")).toBe("pt-BR")
  })

  it("maps folder names to snake_case when the page opts in", () => {
    document.head.innerHTML = '<meta name="adt-dir-naming" content="snake_case" />'
    expect(runtimeDir("pt-BR")).toBe("pt_br")
  })
})
