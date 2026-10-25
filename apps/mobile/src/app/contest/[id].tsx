// B2 contest, B5 measure, B8 judicial: fixed section order per UX.md §3.3. Questions and
// evidence first; alignment last and collapsed (Inv. 22). No per-contest reveal button.
import type { Contest, Slot } from "@ftb/types";
import { computeContestMatch, computeMeasureConnections } from "@ftb/types/scoring";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  AlignmentDetail,
  CandidateMini,
  ContextBrief,
  JudicialPhilosophy,
  JudicialQualifications,
} from "@/components/evidence";
import {
  Accordion,
  Chip,
  ChipRow,
  CitationChip,
  CitedText,
  Empty,
  kitStyles,
  NotStated,
} from "@/components/kit";
import {
  Banner,
  Kicker,
  Note,
  PrimaryButton,
  SampleMark,
  Screen,
  Section,
  TextButton,
  Title,
  TopBar,
} from "@/components/ui";
import {
  cards,
  contestById,
  contestIssues,
  demo,
  isObjectiveOnly,
  issueLabel,
  orderedProfiles,
} from "@/data/release";
import { formatMoney } from "@/format";
import { usePhaseGate, WALKING } from "@/gate";
import { officeKindLabel, SLOT_LABEL } from "@/labels";
import { judicialDeckDone, orderDeck } from "@/lib/deck";
import { pickLabel } from "@/lib/picks";
import { unansweredQuestions } from "@/lib/unanswered";
import { userVectorFor } from "@/matching";
import { useSession } from "@/session";
import { colors, fonts } from "@/theme";

export default function ContestScreen() {
  const session = useSession();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const contest = contestById(id);
  const visit = session.visit;
  const ready = session.ready;
  useEffect(() => {
    if (ready && contest) visit(contest.id);
  }, [contest, ready, visit]);

  const gate = usePhaseGate(WALKING);
  if (gate) return gate;

  if (!contest) {
    return (
      <Screen header={<TopBar onBack={() => router.back()} backLabel="Ballot" />}>
        <Title>That contest isn&apos;t on this ballot.</Title>
      </Screen>
    );
  }

  const pick = session.state.picks[contest.id];
  const revealed = session.state.phase === "revealed";
  const isMeasure = contest.officeKind === "measure";
  const needsJudicialDeck =
    contest.officeKind === "judicial" &&
    !contest.unopposed &&
    !revealed &&
    !judicialDeckDone(cards, session.state.swipes);

  return (
    <Screen
      header={<TopBar onBack={() => router.back()} backLabel="Ballot" />}
      footer={
        needsJudicialDeck ? undefined : (
          <PrimaryButton
            label={pick ? `Your pick: ${pickLabel(pick, session.nameFor)}` : "Make your pick"}
            disabled={revealed}
            onPress={() => router.push({ pathname: "/pick/[id]", params: { id: contest.id } })}
          />
        )
      }
    >
      {demo ? <SampleMark /> : null}
      <Kicker>{officeKindLabel(contest.officeKind)}</Kicker>
      <Title>{contest.title}</Title>
      <ChipRow>
        {!isMeasure ? (
          <Chip label={contest.partisan ? "Partisan" : "Nonpartisan"} tone="plain" />
        ) : null}
        {contest.seats > 1 ? <Chip label={`${contest.seats} seats`} tone="plain" /> : null}
        {contest.unopposed ? <Chip label="Unopposed" tone="plain" icon="info" /> : null}
      </ChipRow>

      {needsJudicialDeck ? (
        <JudicialGate />
      ) : isMeasure ? (
        <MeasureBody contest={contest} />
      ) : contest.officeKind === "judicial" ? (
        <JudicialBody contest={contest} />
      ) : (
        <RaceBody contest={contest} />
      )}
    </Screen>
  );
}

function JudicialGate() {
  const router = useRouter();
  const session = useSession();
  const deck = orderDeck(cards);
  const first = deck.findIndex(
    (card) => card.deck === "judicial" && !session.state.swipes.some((s) => s.cardId === card.id),
  );
  return (
    <>
      <Banner
        title="A few judicial cards first"
        body="This is a contested judicial race. Answer or skip the short judicial deck so you can see how each judge reads the law."
      />
      <TextButton
        label="Open the judicial cards"
        icon="gavel"
        onPress={() => {
          session.setDeckIndex(Math.max(first, 0));
          session.backToExplore();
          router.navigate("/explore");
        }}
      />
    </>
  );
}

function RaceBody({ contest }: { contest: Contest }) {
  const router = useRouter();
  const session = useSession();
  const profiles = orderedProfiles(contest, session.state.order[contest.id]);
  const objective = isObjectiveOnly(contest);
  const userVector = userVectorFor(cards, session.state.swipes);
  const unanswered = unansweredQuestions(profiles, contestIssues(contest));

  return (
    <>
      <Section title="What this office can do" icon="scroll">
        <CitedText sentences={contest.officeDescription} />
      </Section>
      <ContextBrief context={contest.context} />

      <Section title="The candidates" icon="mask">
        <Note>Shown in a random order for this phone.</Note>
        {profiles.map((profile) => (
          <CandidateMini key={profile.id} profile={profile} />
        ))}
      </Section>

      {objective ? (
        <Banner
          title="Objective information only"
          body={
            contest.unopposed
              ? "Unopposed: one candidate is on the ballot. There's nothing to compare, so only the documented facts are shown."
              : "We didn't find enough public evidence to compare these candidates fairly, so we're showing only what's documented. Look for candidate questionnaires from local news outlets and the League of Women Voters."
          }
        />
      ) : (
        <>
          {profiles.length > 1 ? (
            <TextButton
              label="Compare side by side"
              icon="scale"
              onPress={() => router.push({ pathname: "/compare/[id]", params: { id: contest.id } })}
            />
          ) : null}
          <Section title="Questions nobody answered" icon="info">
            {unanswered.issues.length === 0 && unanswered.slots.length === 0 ? (
              <Empty>Every issue here has evidence from at least one candidate.</Empty>
            ) : null}
            {unanswered.issues.map((issueId) => (
              <Text key={issueId} style={kitStyles.copy}>
                No candidate has said anything we could find on {issueLabel(issueId).toLowerCase()}.
              </Text>
            ))}
            {unanswered.slots.map(({ issueId, slot }) => (
              <Text key={`${issueId}-${slot}`} style={kitStyles.copy}>
                No candidate has stated the {SLOT_LABEL[slot].toLowerCase()} of their{" "}
                {issueLabel(issueId).toLowerCase()} plan.
              </Text>
            ))}
          </Section>
          <Accordion title="How your answers line up">
            <AlignmentDetail
              match={computeContestMatch(userVector, contest, profiles)}
              profiles={profiles}
              userVector={userVector}
            />
          </Accordion>
        </>
      )}
    </>
  );
}

function JudicialBody({ contest }: { contest: Contest }) {
  const session = useSession();
  const profiles = orderedProfiles(contest, session.state.order[contest.id]);
  const userVector = userVectorFor(cards, session.state.swipes);
  const thin = profiles.every((profile) => profile.evidenceState !== "sufficient");
  return (
    <>
      <Section title="What this court does" icon="gavel">
        <CitedText sentences={contest.officeDescription} />
      </Section>
      <ContextBrief context={contest.context} />
      <Section title="The candidates" icon="mask">
        <Note>Shown in a random order for this phone.</Note>
        {profiles.map((profile) => (
          <CandidateMini key={profile.id} profile={profile} />
        ))}
      </Section>
      {thin ? (
        <Note>
          Evidence on judicial philosophy is thin here, so read the lines below as rough notes.
        </Note>
      ) : null}
      <JudicialPhilosophy profiles={profiles} userVector={userVector} />
      <Section title="Objective qualifications" icon="scroll">
        {profiles.map((profile) => (
          <View key={profile.id} style={styles.qual}>
            <Text style={kitStyles.label}>{session.nameFor(profile.id)}</Text>
            <JudicialQualifications profile={profile} />
          </View>
        ))}
      </Section>
    </>
  );
}

function SlotBlock({ title, slot }: { title: string; slot: Slot }) {
  return (
    <View style={styles.side}>
      <Text style={styles.sideTitle}>{title}</Text>
      {slot.state === "documented" ? (
        <CitedText sentences={slot.sentences} />
      ) : slot.state === "not_stated" ? (
        <NotStated />
      ) : (
        <CitedText sentences={[slot.reason]} />
      )}
    </View>
  );
}

function MeasureBody({ contest }: { contest: Contest }) {
  const session = useSession();
  const measure = contest.measure;
  if (!measure) return <Empty>The measure text isn&apos;t in this release.</Empty>;
  const fiscal = measure.fiscal;
  const userVector = userVectorFor(cards, session.state.swipes);
  const connections = computeMeasureConnections(
    userVector,
    contest.id,
    measure.issueVector,
    [...cards],
    fiscal?.citations ?? [],
  ).slice(0, 2);

  return (
    <>
      <Section title="Ballot text, verbatim" icon="scroll">
        <View style={kitStyles.quote}>
          <Text style={kitStyles.quoteText}>“{measure.ballotText.text}”</Text>
          <View style={styles.citeRow}>
            <CitationChip refItem={measure.ballotText.citation} n={1} />
          </View>
        </View>
      </Section>
      <View style={styles.sides}>
        <SlotBlock title="What YES means" slot={measure.yesMeans} />
        <SlotBlock title="What NO means" slot={measure.noMeans} />
      </View>
      <Section title="Money and costs" icon="coins">
        <Text style={kitStyles.copy}>
          Principal:{" "}
          {fiscal?.principal != null
            ? formatMoney({ min: fiscal.principal, max: fiscal.principal })
            : "Unknown"}
        </Text>
        <Text style={kitStyles.copy}>
          Interest:{" "}
          {fiscal?.interest != null
            ? formatMoney({ min: fiscal.interest, max: fiscal.interest })
            : "Unknown"}
        </Text>
        {fiscal?.taxImpact?.length ? (
          <CitedText sentences={fiscal.taxImpact} />
        ) : (
          <Text style={kitStyles.copy}>Tax impact: Unknown</Text>
        )}
        {fiscal?.citations.length ? (
          <View style={styles.citeRow}>
            {fiscal.citations.map((ref, index) => (
              <CitationChip key={ref.id} refItem={ref} n={index + 1} />
            ))}
          </View>
        ) : null}
      </Section>
      <Section title="Who's funding each side" icon="coins">
        {(["yes", "no"] as const).map((side) => {
          const map = measure.funding?.[side];
          return (
            <Text key={side} style={kitStyles.copy}>
              {side === "yes" ? "For" : "Against"}:{" "}
              {map
                ? `${formatMoney(map.direct)} direct · ${formatMoney(map.outside)} outside spending`
                : "No filings found. That doesn't mean $0."}
            </Text>
          );
        })}
      </Section>
      <ContextBrief context={contest.context} />
      {connections.length > 0 ? (
        <Accordion title="Connections to your answers">
          {connections.map((connection) => (
            <Text key={connection.cardId} style={kitStyles.copy}>
              You answered a card on {issueLabel(connection.issueId).toLowerCase()}, and this
              measure touches that issue. Read what YES and NO mean above and decide for yourself.
            </Text>
          ))}
          <Note>Never a recommendation. At most two connections are shown.</Note>
        </Accordion>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  qual: { marginTop: 12 },
  citeRow: { flexDirection: "row", gap: 6, marginTop: 8 },
  sides: { gap: 12, marginTop: 22 },
  side: {
    borderWidth: 2,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: colors.card,
    padding: 14,
  },
  sideTitle: { fontFamily: fonts.smallCaps, color: colors.line, fontSize: 19 },
});
