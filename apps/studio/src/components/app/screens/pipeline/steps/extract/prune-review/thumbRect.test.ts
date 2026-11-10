import { describe, expect, it } from "vitest"
import { fitRect, thumbRect } from "./thumbRect"

const close = (value: number | undefined, expected: number) => expect(value).toBeCloseTo(expected, 3)

describe("thumbRect", () => {
  it("maps PDF points to the page image and then to a thumbnail with the same shape", () => {
    const rect = thumbRect({ x: 100, y: 200, width: 50, height: 25 }, { w: 1000, h: 2000 }, 0.5, "cover")
    close(rect?.left, 20)
    close(rect?.top, 20)
    close(rect?.width, 10)
    close(rect?.height, 2.5)
  })

  it("letterboxes a wide page inside a portrait card when the page is contained", () => {
    const rect = fitRect({ left: 0, top: 0, width: 100, height: 100 }, 2, 0.5, "contain")
    close(rect?.left, 0)
    close(rect?.width, 100)
    close(rect?.top, 37.5)
    close(rect?.height, 25)
  })

  it("crops a tall page evenly top and bottom when the page covers a wider card", () => {
    const middle = fitRect({ left: 25, top: 40, width: 50, height: 20 }, 0.5, 1, "cover")
    close(middle?.left, 25)
    close(middle?.width, 50)
    close(middle?.top, 30)
    close(middle?.height, 40)
  })

  it("clips regions that fall partly outside a cropped card and drops ones fully outside", () => {
    const edge = fitRect({ left: 10, top: 0, width: 20, height: 30 }, 0.5, 1, "cover")
    close(edge?.top, 0)
    close(edge?.height, 10)
    expect(fitRect({ left: 10, top: 0, width: 20, height: 10 }, 0.5, 1, "cover")).toBeNull()
  })

  it("returns nothing without bounds or a page size", () => {
    expect(thumbRect(undefined, { w: 100, h: 100 }, 1, "cover")).toBeNull()
    expect(thumbRect({ x: 0, y: 0, width: 1, height: 1 }, null, 1, "cover")).toBeNull()
  })

  it("places the Práticas blurred strip on page 47 where it sits on the page", () => {
    const rect = thumbRect({ x: 283.88446044921875, y: 659.8201904296875, width: 59.985504150390625, height: 14.400961875915527 }, { w: 1163, h: 1560 }, 1163 / 1560, "cover")
    expect(rect?.left).toBeCloseTo(48.82, 2)
    expect(rect?.top).toBeCloseTo(84.59, 2)
  })
})
