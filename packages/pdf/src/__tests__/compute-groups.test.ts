import { describe, it, expect } from "vitest";
import { computeGroups } from "../extract.js";

describe("computeGroups", () => {
  it("single base with no overrides yields one group per page", () => {
    expect(computeGroups(0, 5)).toEqual([[0], [1], [2], [3], [4]]);
  });

  it("spread base keeps the cover solo then pairs sequentially", () => {
    expect(computeGroups(0, 5, { spreadMode: true })).toEqual([
      [0],
      [1, 2],
      [3, 4],
    ]);
  });

  it("spread base leaves a trailing odd page standalone", () => {
    expect(computeGroups(0, 4, { spreadMode: true })).toEqual([
      [0],
      [1, 2],
      [3],
    ]);
  });

  it("single base merges a lead page (1-indexed) with the following page", () => {
    // Merge page 3 (index 2) with page 4 (index 3) in a 5-page book.
    expect(computeGroups(0, 5, { spreadPairs: [3] })).toEqual([
      [0],
      [1],
      [2, 3],
      [4],
    ]);
  });

  it("single base merges multiple non-adjacent pairs", () => {
    expect(computeGroups(0, 6, { spreadPairs: [2, 5] })).toEqual([
      [0],
      [1, 2],
      [3],
      [4, 5],
    ]);
  });

  it("ignores a lead whose partner falls outside the range", () => {
    // Page 5 is the last page; it has no partner to merge with.
    expect(computeGroups(0, 5, { spreadPairs: [5] })).toEqual([
      [0],
      [1],
      [2],
      [3],
      [4],
    ]);
  });

  it("resolves overlapping leads greedily without double-merging a page", () => {
    // Leads 2 and 3 conflict on page 3; the earlier lead wins.
    expect(computeGroups(0, 5, { spreadPairs: [2, 3] })).toEqual([
      [0],
      [1, 2],
      [3],
      [4],
    ]);
  });

  it("respects a start offset when converting lead page numbers", () => {
    // Range pages 3..7 (indices 2..6); merge page 4 (index 3) with page 5.
    expect(computeGroups(2, 7, { spreadPairs: [4] })).toEqual([
      [2],
      [3, 4],
      [5],
      [6],
    ]);
  });

  it("spread base ignores spreadPairs (automatic pairing wins)", () => {
    expect(computeGroups(0, 5, { spreadMode: true, spreadPairs: [4] })).toEqual([
      [0],
      [1, 2],
      [3, 4],
    ]);
  });
});
