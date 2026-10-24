// Explore deck: pole cards, tradeoff cards, and the separate judicial-philosophy deck (PLAN.md §2, §6.2).
// Every gesture has a button equivalent; here buttons are the only input.
import { useState } from "react";
import type { JudicialCard, PoleCard, PolicyCard, Swipe, TradeoffCard } from "@ftb/types";
import { Page, Section } from "../components";
import { issueLabel, release } from "../data";
import { useApp } from "../state";

export function Deck({ deck }: { deck: "policy" | "judicial" }) {
  const { state, go, dispatch, userVector } = useApp();
  const cards = release.cards.filter((c) => c.deck === deck);
  const [index, setIndex] = useState(0);
  const card = cards[index];
  const done = index >= cards.length;

  function record(swipe: Swipe) {
    dispatch({ type: "swipe", swipe });
    setIndex(index + 1);
  }

  const title = deck === "policy" ? "Explore what matters to you" : "How should judges decide?";
  const sub =
    deck === "policy"
      ? "Neither side is the right answer. Skip anything you're unsure about."
      : "Your ballot has a judicial race. Judges are compared on philosophy only, never on policy.";

  if (done) {
    const keys = Object.keys(userVector).filter(
      (k) => (deck === "judicial") === k.startsWith("judicial."),
    );
    const tradeoffs = cards.filter((c): c is TradeoffCard => c.kind === "tradeoff");
    const needJudicial = deck === "policy" && release.ballot.requiresJudicialDeck;
    return (
      <Page title={deck === "policy" ? "Your priorities so far" : "Your judicial philosophy"}>
        <Section
          title="Where you landed"
          note="Computed on this device. One card per issue is low certainty."
        >
          {keys.length === 0 ? (
            <p className="muted">
              You skipped everything — that's fine; contests will show evidence without alignment.
            </p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Issue</th>
                  <th>Position (−1…+1)</th>
                  <th>Certainty</th>
                  <th>⭐</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => {
                  const v = userVector[k];
                  return (
                    <tr key={k}>
                      <td>{issueLabel(k)}</td>
                      <td>{v ? v.position.toFixed(2) : "skipped"}</td>
                      <td>{v ? `${Math.round(v.userCertainty * 100)}%` : "—"}</td>
                      <td>{v && v.salience > 1 ? "⭐" : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Section>
        {tradeoffs.length > 0 && (
          <Section
            title="Tradeoffs you weighed"
            note="Kept as reflection only; not used for alignment."
          >
            <ul className="plain">
              {tradeoffs.map((t) => {
                const sw = state.swipes[t.id];
                return (
                  <li key={t.id}>
                    {t.policy} <span className="muted">at the cost of</span> {t.cost.toLowerCase()}{" "}
                    — <b>{sw ? sw.chosen : "not answered"}</b>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}
        <div className="row">
          <button onClick={() => setIndex(0)}>Redo this deck</button>
          {needJudicial ? (
            <button className="primary" onClick={() => go({ name: "deck", deck: "judicial" })}>
              Continue: judicial deck
            </button>
          ) : (
            <button className="primary" onClick={() => go({ name: "ballot" })}>
              Go to my ballot
            </button>
          )}
        </div>
      </Page>
    );
  }

  return (
    <Page title={title} sub={sub}>
      <p className="small muted">
        Card {index + 1} of {cards.length}
        {card.anchor && " · anchor issue"}
      </p>
      <CardView key={card.id} card={card} flipped={state.flipped[card.id]} onDone={record} />
    </Page>
  );
}

function CardView({
  card,
  flipped,
  onDone,
}: {
  card: PolicyCard;
  flipped: boolean;
  onDone: (s: Swipe) => void;
}) {
  const [starred, setStarred] = useState(false);
  const star = (
    <button
      className={starred ? "star on" : "star"}
      aria-pressed={starred}
      onClick={() => setStarred(!starred)}
    >
      {starred ? "⭐ Matters to me" : "☆ Mark as important"}
    </button>
  );

  if (card.kind === "tradeoff") {
    return (
      <div className="card deck-card">
        <p className="eyebrow">Tradeoff</p>
        <p className="big">
          Is <b>{card.policy.toLowerCase()}</b> worth <b>{card.cost.toLowerCase()}</b>?
        </p>
        <p className="small muted">
          Saying no doesn't mean you oppose the policy itself, just this price for it.
        </p>
        {star}
        <div className="row">
          <button
            className="primary"
            onClick={() => onDone({ cardId: card.id, kind: "tradeoff", chosen: "accept", starred })}
          >
            Worth it
          </button>
          <button
            className="primary"
            onClick={() =>
              onDone({ cardId: card.id, kind: "tradeoff", chosen: "decline", starred })
            }
          >
            Not at that cost
          </button>
          <button
            onClick={() => onDone({ cardId: card.id, kind: "tradeoff", chosen: "skip", starred })}
          >
            Skip
          </button>
        </div>
      </div>
    );
  }

  const pole = card as PoleCard | JudicialCard;
  const sides: ("a" | "b")[] = flipped ? ["b", "a"] : ["a", "b"];
  const text = (s: "a" | "b") => (s === "a" ? pole.poleA : pole.poleB);
  const kind = pole.kind;
  const topic =
    pole.kind === "pole" ? issueLabel(pole.issueId) : issueLabel(`judicial.${pole.dimension}`);

  return (
    <div className="card deck-card">
      <p className="eyebrow">{topic}</p>
      <p className="muted small">Which comes closer to your view?</p>
      <div className="poles">
        {sides.map((s) => (
          <button
            key={s}
            className="pole"
            onClick={() => onDone({ cardId: pole.id, kind, chosen: s, starred } as Swipe)}
          >
            {text(s)}
          </button>
        ))}
      </div>
      {star}
      <div className="row">
        <button onClick={() => onDone({ cardId: pole.id, kind, chosen: "skip", starred } as Swipe)}>
          Skip — not sure
        </button>
      </div>
    </div>
  );
}
