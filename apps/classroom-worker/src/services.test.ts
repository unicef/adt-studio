import { describe, expect, it } from "vitest"
import { joinCode } from "./services.js"
describe("joinCode",()=>{it("creates six uppercase unambiguous characters",()=>{expect(joinCode()).toMatch(/^[A-Z0-9]{6}$/)})})
