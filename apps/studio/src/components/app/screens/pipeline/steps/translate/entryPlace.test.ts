import { describe, expect, it } from "vitest"
import { entryPlace } from "./entryPlace"

describe("entryPlace", () => {
  it("reads page text, images and Easy Read", () => {
    expect(entryPlace("pg001_n0003")).toEqual({ kind: "page-text", pageId: "pg001" })
    expect(entryPlace("pg004_im002")).toEqual({ kind: "image", pageId: "pg004" })
    expect(entryPlace("pg004_im002_crop1_crop2")).toEqual({ kind: "image", pageId: "pg004" })
    expect(entryPlace("pg001_n0008_easy_read")).toEqual({ kind: "easy-read", pageId: "pg001" })
  })

  it("reads activity answers by their section's page", () => {
    expect(entryPlace("pg003_sec002_ans_a")).toEqual({ kind: "answer", pageId: "pg003" })
    expect(entryPlace("sec002_ans_a")).toEqual({ kind: "answer", pageId: null })
  })

  it("reads quiz parts", () => {
    expect(entryPlace("qz004_que")).toEqual({ kind: "quiz-question", quiz: 4 })
    expect(entryPlace("qz004_o2")).toEqual({ kind: "quiz-option", quiz: 4, option: 2 })
    expect(entryPlace("qz004_o2_exp")).toEqual({ kind: "quiz-explanation", quiz: 4, option: 2 })
  })

  it("reads glossary terms and definitions", () => {
    expect(entryPlace("gl012")).toEqual({ kind: "glossary-term", termId: "gl012" })
    expect(entryPlace("gl012_def")).toEqual({ kind: "glossary-definition", termId: "gl012" })
    expect(entryPlace("gl_manual_abc_def")).toEqual({ kind: "glossary-definition", termId: "gl_manual_abc" })
  })

  it("falls back for anything else", () => {
    expect(entryPlace("cover_title")).toEqual({ kind: "other" })
  })
})
