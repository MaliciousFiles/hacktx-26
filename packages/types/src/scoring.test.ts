import { describe, expect, it } from "vitest";
import { issueAlignment, userIssuePosition } from "./scoring";

describe("issueAlignment", () => {
  it("is 1 for identical positions and 0 for opposite poles", () => {
    expect(issueAlignment(0.5, 0.5)).toBe(1);
    expect(issueAlignment(1, -1)).toBe(0);
  });

  it("never scores a closer candidate lower", () => {
    expect(issueAlignment(0, 0.2)).toBeGreaterThan(issueAlignment(0, 0.9));
  });
});

describe("userIssuePosition", () => {
  it("returns the chosen pole when there is one card", () => {
    expect(userIssuePosition([{ position: 1, weight: 1 }])).toBe(1);
    expect(userIssuePosition([{ position: -1, weight: 0.5 }])).toBe(-1);
  });

  it("averages by weight and treats a skip (no choices) as missing", () => {
    expect(userIssuePosition([])).toBeNull();
    expect(userIssuePosition([{ position: 1, weight: 0 }])).toBeNull();
    expect(
      userIssuePosition([
        { position: 1, weight: 1 },
        { position: -1, weight: 1 },
      ]),
    ).toBe(0);
    expect(
      userIssuePosition([
        { position: 1, weight: 3 },
        { position: -1, weight: 1 },
      ]),
    ).toBe(0.5);
  });

  it("ignores a negative weight instead of flipping the sign", () => {
    expect(
      userIssuePosition([
        { position: 1, weight: 1 },
        { position: -1, weight: -5 },
      ]),
    ).toBe(1);
  });
});
