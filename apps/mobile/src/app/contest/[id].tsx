// Contest walkthrough: evidence first, alignment collapsed and secondary (Invariant 22).
import { useEffect } from "react";
import { router, Stack, useLocalSearchParams } from "expo-router";
import type { Contest, ContextClaim } from "@ftb/types";
import { CandidateRaceView, JudicialView, MeasureView } from "../../mockup/contest";
import { contestById, displayName, release } from "../../mockup/data";
import { useApp, type Pick } from "../../mockup/state";
import { Btn, Card, Cited, H3, Muted, Row, Screen, Section, Sentences } from "../../mockup/ui";

export default function ContestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { dispatch } = useApp();
  const contest = contestById(id);
  const idx = release.ballot.contestIds.indexOf(id);
  const next = release.ballot.contestIds[idx + 1];

  useEffect(() => dispatch({ type: "visit", contestId: id }), [dispatch, id]);

  return (
    <Screen title={contest.title} sub={`Contest ${idx + 1} of ${release.ballot.contestIds.length}`}>
      <Stack.Screen options={{ title: `Contest ${idx + 1}` }} />
      <Section title={contest.measure ? "About this measure" : "What this office can do"}>
        <Sentences items={contest.officeDescription} />
        {contest.unopposed && <Muted>Unopposed</Muted>}
      </Section>

      {contest.measure ? (
        <MeasureView contest={contest} />
      ) : contest.officeKind === "judicial" ? (
        <JudicialView contest={contest} />
      ) : (
        <CandidateRaceView contest={contest} />
      )}

      <ContextBriefView contest={contest} />
      <PickBox contest={contest} />

      <Row>
        <Btn label="Report an error here" onPress={() => router.push(`/report?contestId=${id}`)} />
        {next ? (
          <Btn
            kind="primary"
            label="Next contest →"
            onPress={() => router.push(`/contest/${next}`)}
          />
        ) : (
          <Btn kind="primary" label="Back to ballot" onPress={() => router.dismissTo("/ballot")} />
        )}
      </Row>
    </Screen>
  );
}

// ── Context brief (§2 "Every contest") ───────────────────────────────────────

function ContextBriefView({ contest }: { contest: Contest }) {
  const b = contest.context;
  const group = (title: string, claims: ContextClaim[], empty: string) => (
    <Card>
      <H3>{title}</H3>
      {claims.length === 0 ? (
        <Muted small>{empty}</Muted>
      ) : (
        claims.map((c, i) => c.sentences.map((x, j) => <Cited key={`${i}-${j}`} s={x} />))
      )}
    </Card>
  );
  return (
    <Section
      title="Context brief"
      note="Each side has the same cap. A missing side is shown as missing, never padded."
    >
      {group("✅ Documented", b.confirmed, "Nothing independently documented.")}
      {group("🗣️ Supporters say", b.supporters, "No supporter arguments found.")}
      {group("🗣️ Opponents say", b.opponents, "No opponent arguments found.")}
      {group("❓ Disputed / unknown", b.disputed, "Nothing flagged as disputed.")}
      {b.notes.map((n, i) =>
        n.kind === "verified" ? (
          <Cited key={i} s={n.sentence} />
        ) : (
          <Muted key={i} small>
            Note:{" "}
            {n.code === "data_unavailable"
              ? "Some data for this contest was unavailable in this release."
              : "No organized opposition was found."}
          </Muted>
        ),
      )}
    </Section>
  );
}

// ── The user's own decision (on-device only) ─────────────────────────────────

function PickBox({ contest }: { contest: Contest }) {
  const { state, dispatch } = useApp();
  const current = state.picks[contest.id];
  const options: { value: Pick; label: string }[] = contest.measure
    ? [
        { value: "yes", label: "YES" },
        { value: "no", label: "NO" },
      ]
    : state.order[contest.id].map((cid) => ({
        value: cid,
        label: displayName(state, contest.id, cid),
      }));
  options.push({ value: "undecided", label: "Still deciding" });

  return (
    <Section title="Your call" note="Saved only on this phone. You can change it any time.">
      <Row>
        {options.map((o) => (
          <Btn
            key={o.value}
            role="radio"
            label={o.label}
            selected={current === o.value}
            onPress={() => dispatch({ type: "pick", contestId: contest.id, pick: o.value })}
          />
        ))}
      </Row>
    </Section>
  );
}
