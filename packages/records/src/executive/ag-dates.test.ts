import { describe, expect, it } from "vitest";
import { parseHeaderDate } from "./shared";

describe("OAG opinion header dates", () => {
  it("reads the OCR variants printed by the scanned opinion letters", () => {
    expect(parseHeaderDate("GREG ABBOTT\nMay 27,2014\nThe Honorable", 2014)).toBe("2014-05-27");
    expect(parseHeaderDate("GREG ABBOTT\nFebruary lo,2003\nThe", 2003)).toBe("2003-02-10");
    expect(parseHeaderDate("GREG ABBOTT\nMarch 13.2003\nThe", 2003)).toBe("2003-03-13");
    expect(parseHeaderDate("GREG ABBOTT\nMarch 282003\nThe", 2003)).toBe("2003-03-28");
    expect(parseHeaderDate("GREG ABBOTT\nMarch 3 1,2003\nThe", 2003)).toBe("2003-03-31");
  });
  it("rejects impossible dates and dates far from the publication folder instead of adopting a body date", () => {
    expect(parseHeaderDate("GREG ABBOTT\nFebruary 30,2003", 2003)).toBeUndefined();
    expect(parseHeaderDate("GREG ABBOTT\nMay 7,1975", 2014)).toBeUndefined();
    expect(parseHeaderDate("no date here", 2014)).toBeUndefined();
  });
});
