import { describe, expect, it } from "vitest";
import { webLink } from "./webLinks";

describe("web invitations", () => {
  it("puts only progress counts in the fragment, not the server query", () => {
    const url = new URL(webLink("https://wishing.example/?old=secret", "invite", { questions: 7, contests: 2, sample: true }));
    expect(url.search).toBe("");
    expect(url.hash).toBe("#invite?questions=7&contests=2&sample=1");
  });
  it("game links never contain ballot progress", () => {
    expect(webLink("https://wishing.example", "daily", { questions: 7, contests: 2, sample: true })).toBe("https://wishing.example/#daily");
  });
  it("requires a real configured web address and bounds counts", () => {
    expect(() => webLink(undefined, "daily")).toThrow(/EXPO_PUBLIC_WEB_URL/);
    expect(() => webLink("javascript:alert(1)", "daily")).toThrow();
    expect(webLink("https://wishing.example", "invite", { questions: -9, contests: Infinity, sample: false })).toContain("questions=0&contests=0");
  });
});
