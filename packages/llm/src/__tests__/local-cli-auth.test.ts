import { describe, expect, it } from "vitest"
import { join } from "node:path"
import {
  claudeCliCredentialPaths,
  codexCliCredentialPaths,
  hasLocalCliLogin,
} from "../providers/shared/local-cli-auth.js"

const homeDir = join("/home", "operator")

describe("claudeCliCredentialPaths", () => {
  it("defaults to the home directory store", () => {
    expect(claudeCliCredentialPaths({ env: {}, homeDir })).toEqual([
      join(homeDir, ".claude", ".credentials.json"),
    ])
  })

  it("prefers CLAUDE_CONFIG_DIR without dropping the default", () => {
    expect(
      claudeCliCredentialPaths({ env: { CLAUDE_CONFIG_DIR: "/etc/claude" }, homeDir }),
    ).toEqual([
      join("/etc/claude", ".credentials.json"),
      join(homeDir, ".claude", ".credentials.json"),
    ])
  })

  it("ignores a blank CLAUDE_CONFIG_DIR", () => {
    expect(claudeCliCredentialPaths({ env: { CLAUDE_CONFIG_DIR: "  " }, homeDir })).toEqual([
      join(homeDir, ".claude", ".credentials.json"),
    ])
  })
})

describe("codexCliCredentialPaths", () => {
  it("defaults to the home directory store", () => {
    expect(codexCliCredentialPaths({ env: {}, homeDir })).toEqual([
      join(homeDir, ".codex", "auth.json"),
    ])
  })

  it("honours CODEX_HOME", () => {
    expect(codexCliCredentialPaths({ env: { CODEX_HOME: "/srv/codex" }, homeDir })).toEqual([
      join("/srv/codex", "auth.json"),
    ])
  })
})

describe("hasLocalCliLogin", () => {
  it("is true when any candidate exists", () => {
    expect(
      hasLocalCliLogin(["/a", "/b"], { fileExists: (path) => path === "/b" }),
    ).toBe(true)
  })

  it("is false when none exists", () => {
    expect(hasLocalCliLogin(["/a", "/b"], { fileExists: () => false })).toBe(false)
  })
})
