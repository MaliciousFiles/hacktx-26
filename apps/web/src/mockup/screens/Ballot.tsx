// Ballot hub: every contest on the ballot, always accessible, honest about coverage (Invariants 1, 20).
import type { Contest } from "@ftb/types";
import { Page, Section } from "../components";
import { coverageNote, release } from "../data";
import { useApp } from "../state";

const kindLabel: Record<Contest["officeKind"], string> = {
  legislative: "Candidate race",
  executive: "Candidate race",
  regulatory: "Candidate race",
  board: "Candidate race",
  judicial: "Judicial race",
  measure: "Proposition",
};

export function Ballot() {
  const { state, go } = useApp();
  const policyDone = release.cards.some((c) => c.deck === "policy" && state.swipes[c.id]);
  const judicialDone = release.cards.some((c) => c.deck === "judicial" && state.swipes[c.id]);
  const picked = Object.keys(state.picks).length;

  return (
    <Page
      title="Your ballot"
      sub={`Ballot style ${state.ballotStyleId} · ${release.contests.length} contests · release ${release.release.id}`}
    >
      <Section title="Explore decks">
        <div className="row">
          <button onClick={() => go({ name: "deck", deck: "policy" })}>
            {policyDone ? "✓ " : ""}Policy deck
          </button>
          {release.ballot.requiresJudicialDeck && (
            <button onClick={() => go({ name: "deck", deck: "judicial" })}>
              {judicialDone ? "✓ " : ""}Judicial deck
            </button>
          )}
        </div>
      </Section>

      <Section title="Contests" note="In ballot order. Open any of them, in any order.">
        <ul className="contest-list">
          {release.ballot.contestIds.map((id) => {
            const c = release.contests.find((x) => x.id === id)!;
            const pick = state.picks[id];
            return (
              <li key={id}>
                <button className="contest-row" onClick={() => go({ name: "contest", id })}>
                  <span>
                    <span className="eyebrow">{kindLabel[c.officeKind]}</span>
                    <br />
                    <b>{c.title}</b>
                    <br />
                    <span className="small muted">{coverageNote(c)}</span>
                  </span>
                  <span className="small">
                    {pick ? "✓ decided" : state.visited.includes(id) ? "viewed" : "not viewed"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="When you're ready">
        <p className="small muted">
          {picked} of {release.contests.length} contests decided. Unmasking shows names and parties;
          you can unmask one contest at a time.
        </p>
        <div className="row">
          <button className="primary" onClick={() => go({ name: "unmask" })}>
            The Unmasking
          </button>
          <button onClick={() => go({ name: "share" })}>Share card</button>
        </div>
      </Section>
    </Page>
  );
}
