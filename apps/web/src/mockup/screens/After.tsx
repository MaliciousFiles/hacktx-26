// Post-walkthrough screens: The Unmasking, share card, daily challenge (PLAN.md §1, §2).
import { useState } from "react";
import { computeContestMatch } from "@ftb/types/scoring";
import { Page, Section } from "../components";
import { candidatesFor, maskName, release, reveal } from "../data";
import { useApp } from "../state";

const candidateContests = () => release.contests.filter((c) => c.candidateIds.length > 0);

export function Unmask() {
  const { state, dispatch, userVector } = useApp();
  const contests = candidateContests();
  const allRevealed = contests.every((c) => state.revealed[c.id]);

  // "Surprised?" stats, computed locally from picks + revealed parties.
  const partiesPicked = new Set<string>();
  const partiesAligned = new Set<string>();
  for (const c of contests) {
    const ids = state.revealed[c.id];
    if (!ids) continue;
    const picked = ids.find((i) => i.id === state.picks[c.id]);
    if (picked?.party) partiesPicked.add(picked.party);
    const match = computeContestMatch(userVector, c, candidatesFor(c));
    for (const r of match.results) {
      if (
        r.matchClarity > 0 &&
        (r.bucket === "happily_ever_after" || r.bucket === "good_company")
      ) {
        const p = ids.find((i) => i.id === r.candidateId)?.party;
        if (p) partiesAligned.add(p);
      }
    }
  }

  return (
    <Page title="The Unmasking" sub="See who's behind each mask. Your picks stay as they are.">
      {contests.map((c) => {
        const ids = state.revealed[c.id];
        return (
          <Section key={c.id} title={c.title}>
            <table className="table">
              <thead>
                <tr>
                  <th>Mask</th>
                  <th>Who</th>
                  <th>Your call</th>
                </tr>
              </thead>
              <tbody>
                {state.order[c.id].map((cid) => {
                  const ident = ids?.find((i) => i.id === cid);
                  return (
                    <tr key={cid}>
                      <td>
                        {ident ? <s className="muted">masked</s> : maskName(state.masks.map[cid])}
                      </td>
                      <td>{ident ? `${ident.name} · ${ident.party ?? "nonpartisan"}` : "?"}</td>
                      <td>{state.picks[c.id] === cid ? "✓ your pick" : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!ids && (
              <button
                className="primary"
                onClick={() =>
                  dispatch({ type: "reveal", contestId: c.id, identities: reveal(c.id).identities })
                }
              >
                Unmask this contest
              </button>
            )}
            {ids && <p className="small muted">Source links for this contest are now available.</p>}
          </Section>
        );
      })}

      {allRevealed && (
        <Section title="Surprised?">
          <ul className="plain">
            <li>
              Your picks came from <b>{partiesPicked.size}</b> different part
              {partiesPicked.size === 1 ? "y" : "ies"}.
            </li>
            <li>
              Candidates who lined up with your choices came from <b>{partiesAligned.size}</b> part
              {partiesAligned.size === 1 ? "y" : "ies"}.
              {partiesAligned.size === 0 &&
                " (Not enough evidence for a clear read anywhere — that's an honest result.)"}
            </li>
          </ul>
          <p className="small muted">
            Mock stats. Real copy celebrates surprise and never shames a choice.
          </p>
        </Section>
      )}
    </Page>
  );
}

export function Share() {
  const { state } = useApp();
  const decided = Object.values(state.picks).filter((p) => p !== "undecided").length;
  const starred = Object.values(state.swipes).filter((s) => s.starred).length;
  return (
    <Page
      title="Share card"
      sub="Rendered on this device and sent through your phone's share sheet. No upload."
    >
      <div className="share-card">
        <p className="eyebrow">My ballot walkthrough · Travis County 2026</p>
        <p className="big">
          I examined {state.visited.length} of {release.contests.length} contests
        </p>
        <p>
          {decided} decided · {starred} issues marked important
        </p>
        <p className="small muted">Pick the plan before the party. — example.tech</p>
      </div>
      <p className="small muted">
        The card shows counts only: no picks, swipes, names, or parties, so it can't leak your
        ballot.
      </p>
      <div className="row">
        <button className="primary" onClick={() => alert("Mock: opens the OS share sheet")}>
          Share
        </button>
        <button onClick={() => alert("Mock: saves image to photos")}>Save image</button>
      </div>
    </Page>
  );
}

// Daily challenge prototype: "Quote Match" on non-ballot data so it can't spoil the player's own ballot.
const dailyQuotes = [
  { quote: "We will fix every pothole within 48 hours.", platform: "Roads first" },
  {
    quote: "Every neighborhood deserves a library within walking distance.",
    platform: "Libraries for all",
  },
  { quote: "No new taxes until the audit is done.", platform: "Audit first" },
];

export function Daily() {
  const platforms = ["Audit first", "Roads first", "Libraries for all"];
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const done = Object.keys(answers).length === dailyQuotes.length;
  const grid = dailyQuotes.map((q, i) => (answers[i] === q.platform ? "🟩" : "🟥")).join("");
  return (
    <Page
      title="Daily challenge: Quote Match"
      sub="Match each quote to its platform. Uses past or out-of-state races, never yours."
    >
      {dailyQuotes.map((q, i) => (
        <div key={i} className="card">
          <blockquote>“{q.quote}”</blockquote>
          <div className="row">
            {platforms.map((p) => (
              <button
                key={p}
                className={answers[i] === p ? "choice on" : "choice"}
                disabled={done}
                onClick={() => setAnswers({ ...answers, [i]: p })}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      ))}
      {done && (
        <Section title="Result">
          <p className="big">{grid}</p>
          <button onClick={() => navigator.clipboard?.writeText(`Quote Match ${grid}`)}>
            Copy result
          </button>
        </Section>
      )}
    </Page>
  );
}
