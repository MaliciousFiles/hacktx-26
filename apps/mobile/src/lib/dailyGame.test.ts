import { describe, expect, it } from "vitest";
import {
  CARDS_PER_DAY,
  FACT_BANK,
  bestStreak,
  dailyCards,
  rankTitle,
  readAnswers,
  resultGrid,
  scoreOf,
  utcDay,
} from "./dailyGame";

describe("fact or fairy tale", () => {
  it("deals the same balanced cards to everyone on a given day", () => {
    const cards = dailyCards("2026-10-25");
    expect(cards).toEqual(dailyCards("2026-10-25"));
    expect(cards).toHaveLength(CARDS_PER_DAY);
    expect(new Set(cards.map((card) => card.id)).size).toBe(CARDS_PER_DAY);
    expect(cards.filter((card) => card.fact)).toHaveLength(CARDS_PER_DAY / 2);
    expect(cards.map((card) => card.id)).not.toEqual(dailyCards("2026-10-26").map((c) => c.id));
  });

  it("only ever tells a fairy tale on a card that says so, and has enough of each", () => {
    for (const card of FACT_BANK) {
      expect(card.why.startsWith("Fairy tale!")).toBe(!card.fact);
    }
    expect(FACT_BANK.filter((card) => card.fact).length).toBeGreaterThanOrEqual(CARDS_PER_DAY * 2);
    expect(FACT_BANK.filter((card) => !card.fact).length).toBeGreaterThanOrEqual(CARDS_PER_DAY * 2);
    expect(new Set(FACT_BANK.map((card) => card.id)).size).toBe(FACT_BANK.length);
  });

  it("uses typographic quotes and apostrophes, which the storybook fonts draw correctly", () => {
    for (const card of FACT_BANK) {
      expect(`${card.claim} ${card.why}`).not.toMatch(/['"]/);
    }
  });

  it("scores, grids, streaks and ranks", () => {
    const cards = dailyCards("2026-10-25");
    const perfect = cards.map((card) => card.fact);
    expect(scoreOf(cards, perfect)).toBe(CARDS_PER_DAY);
    expect(resultGrid(cards, perfect)).toBe("🟩".repeat(CARDS_PER_DAY));
    expect(resultGrid(cards, perfect.slice(0, 2))).toBe("🟩🟩" + "⬜".repeat(CARDS_PER_DAY - 2));
    expect(
      resultGrid(
        cards,
        cards.map((card) => !card.fact),
      ),
    ).toBe("🟨".repeat(CARDS_PER_DAY));
    expect(bestStreak(cards, perfect)).toBe(CARDS_PER_DAY);
    expect(
      bestStreak(
        cards,
        cards.map((card) => !card.fact),
      ),
    ).toBe(0);
    expect(rankTitle(8, 8)).toBe("Royal Historian");
    expect(rankTitle(0, 8)).toBe("Frog in Waiting");
  });

  it("rolls over at midnight UTC", () => {
    expect(utcDay(new Date("2026-10-25T23:59:59Z"))).toBe("2026-10-25");
    expect(utcDay(new Date("2026-10-26T00:00:00Z"))).toBe("2026-10-26");
  });

  it("starts the day over when saved swipes are corrupt", () => {
    expect(readAnswers("[true,false]")).toEqual([true, false]);
    for (const raw of [null, "bad", "{}", "[1]", '["true"]', JSON.stringify(Array(9).fill(true))]) {
      expect(readAnswers(raw)).toEqual([]);
    }
  });
});
