// Ballot hub: every contest on the ballot, always accessible, honest about coverage (Invariants 1, 20).
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import type { Contest } from "@ftb/types";
import { coverageNote, release } from "../mockup/data";
import { useApp } from "../mockup/state";
import { Btn, Eyebrow, H3, Muted, Row, s, Screen, Section } from "../mockup/ui";

const kindLabel: Record<Contest["officeKind"], string> = {
  legislative: "Candidate race",
  executive: "Candidate race",
  regulatory: "Candidate race",
  board: "Candidate race",
  judicial: "Judicial race",
  measure: "Proposition",
};

export default function Ballot() {
  const { state } = useApp();
  const policyDone = release.cards.some((c) => c.deck === "policy" && state.swipes[c.id]);
  const judicialDone = release.cards.some((c) => c.deck === "judicial" && state.swipes[c.id]);
  const picked = Object.keys(state.picks).length;

  return (
    <Screen
      title="Your ballot"
      sub={`Style ${state.ballotStyleId ?? "not set"} · ${release.contests.length} contests · release ${release.release.id}`}
    >
      <Section title="Explore decks">
        <Row>
          <Btn
            label={`${policyDone ? "✓ " : ""}Policy deck`}
            onPress={() => router.push("/deck/policy")}
          />
          {release.ballot.requiresJudicialDeck && (
            <Btn
              label={`${judicialDone ? "✓ " : ""}Judicial deck`}
              onPress={() => router.push("/deck/judicial")}
            />
          )}
        </Row>
      </Section>

      <Section title="Contests" note="In ballot order. Open any of them, in any order.">
        {release.ballot.contestIds.map((id) => {
          const c = release.contests.find((x) => x.id === id)!;
          const status = state.picks[id]
            ? "✓ decided"
            : state.visited.includes(id)
              ? "viewed"
              : "not viewed";
          return (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityLabel={`${c.title}, ${status}`}
              onPress={() => router.push(`/contest/${id}`)}
              style={({ pressed }) => [s.card, pressed && { opacity: 0.6 }]}
            >
              <Eyebrow>{kindLabel[c.officeKind]}</Eyebrow>
              <H3>{c.title}</H3>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                <Muted small>{coverageNote(c)}</Muted>
                <Muted small>{status}</Muted>
              </View>
            </Pressable>
          );
        })}
      </Section>

      <Section title="When you're ready">
        <Muted small>
          {picked} of {release.contests.length} contests decided. Unmasking shows names and parties,
          one contest at a time.
        </Muted>
        <Row>
          <Btn kind="primary" label="The Unmasking" onPress={() => router.push("/unmask")} />
          <Btn label="Share card" onPress={() => router.push("/share")} />
        </Row>
        <Row>
          <Btn kind="link" label="Daily challenge" onPress={() => router.push("/daily")} />
          <Btn kind="link" label="How it works" onPress={() => router.push("/how")} />
        </Row>
      </Section>
    </Screen>
  );
}
