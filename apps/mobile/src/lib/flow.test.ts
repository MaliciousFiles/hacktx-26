import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { JudicialCard, PoleCard, PolicyCard, TradeoffCard } from "@ftb/types";
import { describe, expect, it } from "vitest";
import { displayBucket, salienceFrom } from "../matching";
import {
  anchorsDone,
  judicialDeckDone,
  orderDeck,
  statementFor,
  swipeForVerdict,
  verdictOf,
} from "./deck";
import { CAST, packMasks, unpackMasks } from "./masks";
import { checkReveal } from "./reveal";
import {
  EMPTY_SESSION,
  parseSession,
  sessionReducer,
  starredCard,
  type LocalSession,
} from "./session";

const pole = (id: string, anchor: boolean): PoleCard => ({
  id,
  anchor,
  deck: "policy",
  kind: "pole",
  issueId: "housing.zoning",
  poleA: `${id} A`,
  poleB: `${id} B`,
  vector: { "housing.zoning": { a: 0.8, b: -0.8, weight: 1 } },
});
const tradeoff: TradeoffCard = {
  id: "t",
  anchor: false,
  deck: "policy",
  kind: "tradeoff",
  policy: "Buses",
  cost: "Taxes",
  policyIssues: ["infrastructure"],
  costIssues: ["economy.taxation"],
};
const judge = (id: string, anchor: boolean): JudicialCard => ({
  id,
  anchor,
  deck: "judicial",
  kind: "judicial_pole",
  dimension: "precedent",
  poleA: `${id} A`,
  poleB: `${id} B`,
  coordinates: { a: -1, b: 1 },
});

describe("deck", () => {
  const cards: PolicyCard[] = [
    judge("j1", false),
    pole("p1", false),
    tradeoff,
    judge("j2", true),
    pole("p2", true),
  ];

  it("puts policy anchors first, then policy, then the judicial deck", () => {
    expect(orderDeck(cards).map((card) => card.id)).toEqual(["p2", "p1", "t", "j2", "j1"]);
  });

  it("agree records the pole shown, disagree the other, for every flip (Suite D side-swap)", () => {
    for (const card of [pole("p", true), judge("j", true)]) {
      for (const flipped of [false, true]) {
        const shown = flipped ? "b" : "a";
        const other = flipped ? "a" : "b";
        expect(statementFor(card, flipped)).toBe(`${card.id} ${shown.toUpperCase()}`);
        const agree = swipeForVerdict(card, flipped, "agree", false);
        const disagree = swipeForVerdict(card, flipped, "disagree", false);
        expect(agree.chosen).toBe(shown);
        expect(disagree.chosen).toBe(other);
        expect(verdictOf(card, flipped, agree)).toBe("agree");
        expect(verdictOf(card, flipped, disagree)).toBe("disagree");
      }
    }
  });

  it("maps tradeoff swipes to worth it / not worth it whatever the flip", () => {
    for (const flipped of [false, true]) {
      expect(swipeForVerdict(tradeoff, flipped, "agree", false).chosen).toBe("accept");
      expect(swipeForVerdict(tradeoff, flipped, "disagree", false).chosen).toBe("decline");
    }
    expect(verdictOf(tradeoff, false, undefined)).toBeNull();
  });

  it("gates on anchors and the judicial deck, counting skips as done", () => {
    const skip = { kind: "pole", cardId: "p2", chosen: "skip", starred: false } as const;
    expect(anchorsDone(cards, [])).toBe(false);
    expect(anchorsDone(cards, [skip])).toBe(false);
    expect(
      anchorsDone(cards, [
        skip,
        { kind: "judicial_pole", cardId: "j2", chosen: "a", starred: false },
      ]),
    ).toBe(true);
    expect(
      judicialDeckDone(cards, [
        { kind: "judicial_pole", cardId: "j2", chosen: "skip", starred: false },
      ]),
    ).toBe(false);
  });
});

describe("session reducer", () => {
  const begun = sessionReducer(EMPTY_SESSION, {
    type: "begin",
    releaseId: "r1",
    ballotStyleId: "s1",
    order: { c: ["b", "a"] },
    flips: { p: true },
  });

  it("starts in explore with the pinned release", () => {
    expect(begun.phase).toBe("explore");
    expect(begun.releaseId).toBe("r1");
    expect(begun.order).toEqual({ c: ["b", "a"] });
  });

  it("keeps a star placed before the card was answered", () => {
    const starred = sessionReducer(begun, { type: "toggleStar", cardId: "p" });
    expect(starredCard(starred, "p")).toBe(true);
    const answered = sessionReducer(starred, {
      type: "answer",
      swipe: { kind: "pole", cardId: "p", chosen: "a", starred: false },
    });
    expect(answered.swipes).toEqual([{ kind: "pole", cardId: "p", chosen: "a", starred: true }]);
    expect(answered.pendingStars).toEqual([]);
  });

  it("locks picks and guesses after the reveal", () => {
    const walking = sessionReducer(begun, { type: "finishExplore" });
    const picked = sessionReducer(walking, {
      type: "pick",
      contestId: "c",
      pick: { kind: "candidate", candidateId: "a" },
    });
    const revealed = sessionReducer(picked, { type: "reveal", identities: { c: [] } });
    expect(revealed.phase).toBe("revealed");
    expect(sessionReducer(revealed, { type: "pick", contestId: "c", pick: { kind: "skip" } })).toBe(
      revealed,
    );
    expect(sessionReducer(revealed, { type: "backToExplore" }).phase).toBe("revealed");
  });

  it("round-trips through storage and rejects unknown versions", () => {
    expect(parseSession(JSON.stringify(begun))).toEqual(begun);
    expect(parseSession(JSON.stringify({ ...begun, version: 2 }))).toBeNull();
    expect(parseSession("not json")).toBeNull();
  });

  it("start over keeps nothing from the ballot", () => {
    const next: LocalSession = sessionReducer(begun, { type: "reset" });
    expect(next).toEqual(EMPTY_SESSION);
  });
});

describe("masks storage", () => {
  it("packs to cast indexes and back", () => {
    const map = { a: CAST[3]!, b: CAST[7]! };
    expect(packMasks(map)).toEqual({ a: 3, b: 7 });
    expect(unpackMasks(packMasks(map))).toEqual(map);
  });
});

describe("checkReveal", () => {
  const contest = { id: "c", candidateIds: ["a", "b"] };
  const res = (ids: string[], releaseId = "r1") => ({
    releaseId,
    contestId: "c",
    identities: ids.map((id) => ({ id, name: id })),
  });

  it("accepts exactly the contest's candidates", () => {
    expect(checkReveal(contest, "r1", res(["b", "a"]))).toHaveLength(2);
  });

  it("rejects a different release, missing, extra or duplicate ids", () => {
    expect(() => checkReveal(contest, "r1", res(["a", "b"], "r2"))).toThrow();
    expect(() => checkReveal(contest, "r1", res(["a"]))).toThrow();
    expect(() => checkReveal(contest, "r1", res(["a", "b", "x"]))).toThrow();
    expect(() => checkReveal(contest, "r1", res(["a", "a"]))).toThrow();
  });
});

describe("alignment display", () => {
  it("shows zero clarity as Clouded whatever the bucket says", () => {
    expect(displayBucket({ bucket: "happily_ever_after", matchClarity: 0 })).toBe("clouded");
    expect(displayBucket({ bucket: "good_company", matchClarity: 0.4 })).toBe("good_company");
  });

  it("stars raise salience without changing direction", () => {
    const card = pole("p", true);
    expect(
      salienceFrom([card], [{ kind: "pole", cardId: "p", chosen: "b", starred: true }]),
    ).toEqual({
      "housing.zoning": 2,
    });
    expect(
      salienceFrom([card], [{ kind: "pole", cardId: "p", chosen: "b", starred: false }]),
    ).toEqual({});
  });
});

describe("pre-reveal leak boundary", () => {
  const src = join(__dirname, "..");
  const root = join(src, "..", "..", "..");
  const identities = JSON.parse(
    readFileSync(join(root, "fixtures", "identities-fixture.json"), "utf-8"),
  ) as {
    contests: Record<string, { name: string; party?: string }[]>;
  };

  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return files(path);
      return /\.tsx?$/.test(name) && !name.endsWith(".test.ts") ? [path] : [];
    });
  }

  it("only data/reveal.ts reads the identities file", () => {
    const readers = files(src)
      .filter((file) => readFileSync(file, "utf-8").includes("identities-fixture"))
      .map((file) => file.slice(src.length + 1));
    expect(readers).toEqual([join("data", "reveal.ts")]);
  });

  it("the masked release contains no identity name or party", () => {
    const release = readFileSync(join(root, "fixtures", "release-fixture.json"), "utf-8");
    for (const list of Object.values(identities.contests)) {
      for (const identity of list) {
        expect(release).not.toContain(identity.name);
        if (identity.party) expect(release).not.toContain(identity.party);
      }
    }
  });

  it("the share card takes only the allowlisted props", () => {
    const text = readFileSync(join(src, "components", "ShareCard.tsx"), "utf-8");
    const body = /export interface ShareCardProps \{([^}]*)\}/.exec(text)?.[1] ?? "";
    const keys = [...body.matchAll(/^\s*(\w+)\??:/gm)].map((match) => match[1]);
    expect(keys).toEqual(["statKey", "statValue"]);
  });
});
