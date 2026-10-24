// The Unmasking: per-contest reveal via mock /reveal, then "Surprised?" stats computed locally.
import { computeContestMatch } from "@ftb/types/scoring";
import { candidatesFor, displayName, release, reveal } from "../mockup/data";
import { useApp } from "../mockup/state";
import { Btn, KV, Muted, P, Screen, Section } from "../mockup/ui";

export default function Unmask() {
  const { state, dispatch, userVector } = useApp();
  const contests = release.contests.filter((c) => c.candidateIds.length > 0);
  const allRevealed = contests.every((c) => state.revealed[c.id]);

  const partiesPicked = new Set<string>();
  const partiesAligned = new Set<string>();
  for (const c of contests) {
    const ids = state.revealed[c.id];
    if (!ids) continue;
    const picked = ids.find((i) => i.id === state.picks[c.id]);
    if (picked?.party) partiesPicked.add(picked.party);
    for (const r of computeContestMatch(userVector, c, candidatesFor(c)).results) {
      if (
        r.matchClarity > 0 &&
        (r.bucket === "happily_ever_after" || r.bucket === "good_company")
      ) {
        const party = ids.find((i) => i.id === r.candidateId)?.party;
        if (party) partiesAligned.add(party);
      }
    }
  }
  const plural = (n: number) => (n === 1 ? "party" : "parties");

  return (
    <Screen title="The Unmasking" sub="See who's behind each mask. Your picks stay as they are.">
      {contests.map((c) => {
        const revealed = !!state.revealed[c.id];
        return (
          <Section key={c.id} title={c.title}>
            <KV
              rows={state.order[c.id].map((cid) => [
                revealed ? "Unmasked" : "Masked",
                `${displayName(state, c.id, cid)}${state.picks[c.id] === cid ? "  ✓ your pick" : ""}`,
              ])}
            />
            {revealed ? (
              <Muted small>Source links for this contest are now available.</Muted>
            ) : (
              <Btn
                kind="primary"
                label="Unmask this contest"
                onPress={() =>
                  dispatch({ type: "reveal", contestId: c.id, identities: reveal(c.id).identities })
                }
              />
            )}
          </Section>
        );
      })}

      {allRevealed && (
        <Section title="Surprised?">
          <P>
            • Your picks came from {partiesPicked.size} different {plural(partiesPicked.size)}.
          </P>
          <P>
            • Candidates who lined up with your choices came from {partiesAligned.size}{" "}
            {plural(partiesAligned.size)}.
            {partiesAligned.size === 0 &&
              " Not enough evidence for a clear read anywhere, which is an honest result."}
          </P>
          <Muted small>Mock stats. Real copy celebrates surprise and never shames a choice.</Muted>
        </Section>
      )}
    </Screen>
  );
}
