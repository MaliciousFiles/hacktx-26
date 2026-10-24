import { describe, expect, it } from "vitest";
import { issueAlignment } from "./scoring";

describe("issueAlignment", () => {
  it("is 1 for identical positions and 0 for opposite poles", () => {
    expect(issueAlignment(0.5, 0.5)).toBe(1);
    expect(issueAlignment(1, -1)).toBe(0);
  });

  it("never scores a closer candidate lower", () => {
    expect(issueAlignment(0, 0.2)).toBeGreaterThan(issueAlignment(0, 0.9));
  });
});
