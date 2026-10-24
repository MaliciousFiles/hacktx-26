// Explore deck: pole cards, tradeoff cards, and the separate judicial-philosophy deck (PLAN.md §2, §6.2).
// Every future swipe gesture must have a button equivalent; in the mockup, buttons are the only input.
import { useState } from "react";
import { View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import type { JudicialCard, PoleCard, PolicyCard, Swipe, TradeoffCard } from "@ftb/types";
import { issueLabel, release } from "../../mockup/data";
import { useApp } from "../../mockup/state";
import { Btn, Card, Eyebrow, KV, Muted, P, Row, Screen, Section } from "../../mockup/ui";

export default function DeckScreen() {
  const { deck } = useLocalSearchParams<{ deck: "policy" | "judicial" }>();
  const { state, dispatch, userVector } = useApp();
  const cards = release.cards.filter((c) => c.deck === deck);
  const [index, setIndex] = useState(0);
  const isPolicy = deck === "policy";
  const header = <Stack.Screen options={{ title: isPolicy ? "Policy deck" : "Judicial deck" }} />;

  function record(swipe: Swipe) {
    dispatch({ type: "swipe", swipe });
    setIndex(index + 1);
  }

  if (index >= cards.length) {
    const keys = Object.keys(userVector).filter((k) => !isPolicy === k.startsWith("judicial."));
    const tradeoffs = cards.filter((c): c is TradeoffCard => c.kind === "tradeoff");
    const needJudicial = isPolicy && release.ballot.requiresJudicialDeck;
    return (
      <Screen title={isPolicy ? "Your priorities so far" : "Your judicial philosophy"}>
        {header}
        <Section
          title="Where you landed"
          note="Computed on this phone. One card per issue is low certainty."
        >
          {keys.length === 0 ? (
            <Muted>
              You skipped everything. That's fine; contests will show evidence without alignment.
            </Muted>
          ) : (
            <KV
              rows={keys.map((k) => {
                const v = userVector[k];
                return [
                  issueLabel(k),
                  v
                    ? `${v.position.toFixed(2)} on −1…+1 · certainty ${Math.round(v.userCertainty * 100)}%${v.salience > 1 ? " · ⭐" : ""}`
                    : "skipped",
                ];
              })}
            />
          )}
        </Section>
        {tradeoffs.length > 0 && (
          <Section
            title="Tradeoffs you weighed"
            note="Kept as reflection only; not used for alignment."
          >
            {tradeoffs.map((t) => (
              <P key={t.id}>
                • {t.policy} at the cost of {t.cost.toLowerCase()}:{" "}
                {state.swipes[t.id]?.chosen ?? "not answered"}
              </P>
            ))}
          </Section>
        )}
        <Row>
          <Btn label="Redo this deck" onPress={() => setIndex(0)} />
          {needJudicial ? (
            <Btn
              kind="primary"
              label="Continue: judicial deck"
              onPress={() => router.push("/deck/judicial")}
            />
          ) : (
            <Btn kind="primary" label="Go to my ballot" onPress={() => router.push("/ballot")} />
          )}
        </Row>
      </Screen>
    );
  }

  const card = cards[index];
  return (
    <Screen
      title={isPolicy ? "Explore what matters to you" : "How should judges decide?"}
      sub={
        isPolicy
          ? "Neither side is the right answer. Skip anything you're unsure about."
          : "Your ballot has a judicial race. Judges are compared on philosophy only, never on policy."
      }
    >
      {header}
      <Muted small>
        Card {index + 1} of {cards.length}
        {card.anchor ? " · anchor issue" : ""}
      </Muted>
      <CardView key={card.id} card={card} flipped={state.flipped[card.id]} onDone={record} />
    </Screen>
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
    <Row>
      <Btn
        label={starred ? "⭐ Matters to me" : "☆ Mark as important"}
        selected={starred}
        onPress={() => setStarred(!starred)}
      />
    </Row>
  );

  if (card.kind === "tradeoff") {
    const done = (chosen: "accept" | "decline" | "skip") =>
      onDone({ cardId: card.id, kind: "tradeoff", chosen, starred });
    return (
      <Card>
        <Eyebrow>Tradeoff</Eyebrow>
        <P style={{ fontSize: 18, marginVertical: 8 }}>
          Is {card.policy.toLowerCase()} worth {card.cost.toLowerCase()}?
        </P>
        <Muted small>
          Saying no doesn't mean you oppose the policy itself, just this price for it.
        </Muted>
        {star}
        <Row>
          <Btn kind="primary" label="Worth it" onPress={() => done("accept")} />
          <Btn kind="primary" label="Not at that cost" onPress={() => done("decline")} />
          <Btn label="Skip" onPress={() => done("skip")} />
        </Row>
      </Card>
    );
  }

  const pole = card as PoleCard | JudicialCard;
  const sides: ("a" | "b")[] = flipped ? ["b", "a"] : ["a", "b"];
  const topic =
    pole.kind === "pole" ? issueLabel(pole.issueId) : issueLabel(`judicial.${pole.dimension}`);
  const done = (chosen: "a" | "b" | "skip") =>
    onDone({ cardId: pole.id, kind: pole.kind, chosen, starred } as Swipe);

  return (
    <Card>
      <Eyebrow>{topic}</Eyebrow>
      <Muted small>Which comes closer to your view?</Muted>
      <View style={{ gap: 8, marginVertical: 10 }}>
        {sides.map((side) => (
          <Btn
            key={side}
            kind="option"
            label={side === "a" ? pole.poleA : pole.poleB}
            onPress={() => done(side)}
          />
        ))}
      </View>
      {star}
      <Btn label="Skip — not sure" onPress={() => done("skip")} />
    </Card>
  );
}
