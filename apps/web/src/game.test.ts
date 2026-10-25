import { describe, expect, it } from "vitest";
import { dailyRounds, readProgress, resultGrid, utcDay } from "./game";
import { inviteLink, readInvite } from "./sharing";

describe("daily fictional quote game", () => {
  it("is deterministic with unique rounds and valid remapped answers", () => {
    const first = dailyRounds("2026-10-25");
    expect(first).toEqual(dailyRounds("2026-10-25"));
    expect(new Set(first.map((round) => round.id)).size).toBe(3);
    expect(first.every((round) => round.answer >= 0 && round.answer < round.plans.length)).toBe(true);
    expect(first).not.toEqual(dailyRounds("2026-10-26"));
    expect(resultGrid(first, first.map((round) => round.answer))).toBe("🟩🟩🟩");
    expect(resultGrid(first, first.map((round) => (round.answer + 1) % 3))).toBe("🟨🟨🟨");
  });
  it("uses a shared UTC rollover", () => {
    expect(utcDay(new Date("2026-10-25T23:59:59Z"))).toBe("2026-10-25");
    expect(utcDay(new Date("2026-10-26T00:00:00Z"))).toBe("2026-10-26");
  });
  it("recovers from corrupted or incompatible saved progress", () => {
    expect(readProgress("[0,2,1]")).toEqual([0,2,1]);
    for (const raw of [null, "bad", "{}", "[3]", "[-1]", '["1"]', "[0,1,2,0]"]) expect(readProgress(raw)).toEqual([]);
  });
});
describe("private share links", () => {
  it("accepts bounded counts only and drops extra query data", () => {
    const invite = readInvite("#invite?questions=9&contests=2&sample=1&pick=candidate");
    expect(invite).toEqual({ questions: 9, contests: 2, sample: true });
    const url = new URL(inviteLink("https://example.org/?address=private", invite));
    expect(url.search).toBe("");
    expect(url.hash).toBe("#invite?questions=9&contests=2&sample=1");
    expect(readInvite("#invite?questions=-2&contests=999999&sample=oops")).toEqual({ questions: 0, contests: 0, sample: false });
  });
});
