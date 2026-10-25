import { describe, expect, it } from "vitest";
import { ballotRows, isChosen, shareMessage } from "./shareBallot";

const contests = [
  { id: "c1", title: "City Council, Place 4" },
  { id: "c2", title: "Proposition A", measure: {} as never },
  { id: "c3", title: "County Judge" },
  { id: "c4", title: "School Board" },
];
const lantern = { character: "The Lantern Keeper", title: "t", imageUrl: "" };

describe("fairy-tale ballot", () => {
  const rows = ballotRows(
    contests,
    {
      c1: { kind: "candidate", candidateId: "cand-1" },
      c2: { kind: "measure", choice: "no" },
      c3: { kind: "undecided" },
    },
    (id) => (id === "cand-1" ? lantern : undefined),
  );

  it("maps each pick to a character or an honest blank, and leaves propositions off", () => {
    expect(rows.map((row) => row.kind)).toEqual(["character", "undecided", "none"]);
  });

  it("shares only characters, never a candidate id or real name", () => {
    const message = shareMessage(rows, false);
    expect(message).toContain("City Council, Place 4: The Lantern Keeper");
    expect(message).not.toContain("Proposition A");
    expect(rows.some((row) => row.contest === "Proposition A")).toBe(false);
    expect(message).not.toContain("cand-1");
    expect(message).not.toContain("County Judge");
    expect(rows.filter(isChosen)).toHaveLength(1);
  });

  it("treats a pick whose mask is gone as undecided rather than guessing", () => {
    const [row] = ballotRows(
      contests,
      { c1: { kind: "candidate", candidateId: "x" } },
      () => undefined,
    );
    expect(row?.kind).toBe("undecided");
  });
});
