import type { ContextBrief, Contest, PolicyCard, Slot } from "@ftb/types";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { StyleSheet, Text } from "react-native";
import { CandidateCard } from "@/components/CandidateCard";
import {
  Banner,
  Body,
  Kicker,
  Note,
  PrimaryButton,
  SampleMark,
  Screen,
  Section,
  Title,
  TopBar,
  TextButton,
} from "@/components/ui";
import { useBallotData } from "@/ballotData";
import { formatMoney } from "@/format";
import { JUDICIAL_LABEL, officeKindLabel } from "@/labels";
import { judicialAnswers, polePositions } from "@/matching";
import { useSession } from "@/session";
import { colors, fonts } from "@/theme";

export default function ContestScreen() {
  const { data: demoBallot, contestById, orderedProfiles } = useBallotData();
  const [confirm, setConfirm] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = useSession();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  if (!session.started) return <Redirect href="/" />;

  const contest = id ? contestById(id) : undefined;
  if (!contest) {
    return (
      <Screen
        footer={
          <PrimaryButton label="Back to the ballot" onPress={() => router.navigate("/ballot")} />
        }
      >
        <SampleMark />
        <Title>That contest is not in this release.</Title>
      </Screen>
    );
  }

  const profiles = orderedProfiles(contest, session.order[contest.id]);
  const pendingJudicialIndex = demoBallot.cards.findIndex(
    (card) =>
      card.kind === "judicial_pole" && !session.swipes.some((swipe) => swipe.cardId === card.id),
  );
  if (contest.officeKind === "judicial" && profiles.length > 1 && pendingJudicialIndex >= 0) {
    return (
      <Screen
        header={<TopBar onBack={() => router.navigate("/ballot")} backLabel="Ballot" />}
        footer={
          <PrimaryButton
            label="Explore the judicial questions"
            onPress={() => {
              session.setDeckIndex(pendingJudicialIndex);
              router.navigate("/explore");
            }}
          />
        }
      >
        <SampleMark />
        <Kicker>Before you meet the court</Kicker>
        <Title>A different kind of question.</Title>
        <Body>
          Judges interpret the law. Answer or skip the judicial questions first; we never compare
          judges using policy positions.
        </Body>
      </Screen>
    );
  }
  const userPositions = polePositions(demoBallot.cards, session.swipes);
  const tradeoff = session.swipes.find((swipe) => swipe.cardId === "card-tradeoff");
  const tradeoffCard = demoBallot.cards.find((card) => card.id === "card-tradeoff");
  const revealed = session.revealed[contest.id] === true;

  return (
    <Screen
      footer={
        profiles.length > 0 ? (
          <>
            {confirm && !revealed ? (
              <Note>
                Ready? Names and parties will stay visible for this contest for the rest of this
                session.
              </Note>
            ) : null}
            {error ? <Note>{error}</Note> : null}
            <PrimaryButton
              label={
                revealing
                  ? "Loading candidate names…"
                  : revealed
                    ? "See the names"
                    : confirm
                      ? "Yes, reveal this contest"
                      : "Reveal candidate names"
              }
              disabled={revealing}
              onPress={async () => {
                if (!revealed && !confirm) {
                  setConfirm(true);
                  return;
                }
                setRevealing(true);
                setError(null);
                try {
                  if (!revealed) await session.revealContest(contest.id);
                  router.push({ pathname: "/reveal/[id]", params: { id: contest.id } });
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : "Please try again.");
                } finally {
                  setRevealing(false);
                }
              }}
            />
            {confirm && !revealing && !revealed ? (
              <TextButton label="Keep reading" onPress={() => setConfirm(false)} />
            ) : null}
          </>
        ) : (
          <PrimaryButton label="Back to the ballot" onPress={() => router.navigate("/ballot")} />
        )
      }
      header={<TopBar onBack={() => router.navigate("/ballot")} backLabel="Ballot" />}
    >
      <SampleMark />
      <Kicker>{officeKindLabel(contest.officeKind)}</Kicker>
      <Title>{contest.title}</Title>
      {contest.officeDescription.map((sentence) => (
        <Body key={sentence.text}>{sentence.text}</Body>
      ))}

      {contest.measure ? <Measure contest={contest} /> : null}
      {contest.officeKind === "judicial" ? <JudicialNotes /> : null}
      {contest.id === "contest-council" &&
      tradeoff?.kind === "tradeoff" &&
      tradeoffCard?.kind === "tradeoff" ? (
        <TradeoffNote card={tradeoffCard} chosen={tradeoff.chosen} />
      ) : null}
      <Context context={contest.context} />

      {profiles.map((profile) => (
        <CandidateCard
          key={profile.id}
          contest={contest}
          profile={profile}
          userPositions={userPositions}
        />
      ))}
    </Screen>
  );
}

function Measure({ contest }: { contest: Contest }) {
  const measure = contest.measure;
  if (!measure) return null;
  return (
    <>
      <Banner
        tone="forest"
        title="No recommendation"
        body="We do not recommend voting yes or no. Read the ballot language and compare the effects of each choice."
      />
      <Section title="Ballot language" icon="scroll">
        <Text style={styles.verbatim}>{measure.ballotText.text}</Text>
      </Section>
      <SlotBlock label="A yes vote" slot={measure.yesMeans} />
      <SlotBlock label="A no vote" slot={measure.noMeans} />
      <Section title="Dollars" icon="coins">
        <Text style={styles.copy}>
          Principal{" "}
          {measure.fiscal?.principal
            ? formatMoney({ min: measure.fiscal.principal, max: measure.fiscal.principal })
            : "not stated"}
          .
        </Text>
        <Text style={styles.missing}>Interest: Not stated</Text>
        <Note>A missing campaign-finance filing is not zero dollars.</Note>
      </Section>
    </>
  );
}

function SlotBlock({ label, slot }: { label: string; slot: Slot }) {
  return (
    <Section title={label}>
      {slot.state === "not_stated" ? <Text style={styles.missing}>Not stated</Text> : null}
      {slot.state === "not_applicable" ? <Text style={styles.copy}>{slot.reason.text}</Text> : null}
      {slot.state === "documented"
        ? slot.sentences.map((sentence) => (
            <Text key={sentence.text} style={styles.copy}>
              {sentence.text}
            </Text>
          ))
        : null}
    </Section>
  );
}

function JudicialNotes() {
  const { data: demoBallot } = useBallotData();
  const session = useSession();
  const answers = judicialAnswers(demoBallot.cards, session.swipes);
  return (
    <Section title="What you said about judging" icon="gavel">
      <Note>
        These answers are not turned into a policy match, and they do not rank the candidates.
      </Note>
      {answers.length === 0 ? (
        <Text style={styles.copy}>You have not answered the judicial cards yet.</Text>
      ) : (
        answers.map((answer) => (
          <Text key={answer.cardId} style={styles.copy}>
            {JUDICIAL_LABEL[answer.label as keyof typeof JUDICIAL_LABEL] ?? answer.label}:{" "}
            {answer.answer}
          </Text>
        ))
      )}
    </Section>
  );
}

function TradeoffNote({
  card,
  chosen,
}: {
  card: Extract<PolicyCard, { kind: "tradeoff" }>;
  chosen: "accept" | "decline" | "skip";
}) {
  const question = `${card.policy}, at the cost of ${card.cost}.`;
  const answer =
    chosen === "accept"
      ? "You said that was worth it."
      : chosen === "decline"
        ? "You said that cost was too high."
        : "You skipped it.";
  return (
    <Banner
      title="Why you're seeing this: a question you answered"
      body={`Earlier you were asked about this tradeoff: ${question} ${answer} City Council decides issues like this. It is only a reminder and does not change how the candidates are compared below.`}
    />
  );
}

function Context({ context }: { context: ContextBrief }) {
  const blocks = [
    ["Documented", context.confirmed],
    ["Supporters say", context.supporters],
    ["Opponents say", context.opponents],
    ["Disputed or unknown", context.disputed],
  ] as const;
  return (
    <Section title="Context" icon="book">
      {blocks.map(([title, claims]) => (
        <ViewBlock key={title} title={title} empty={claims.length === 0}>
          {claims.map((claim) => (
            <Text
              key={claim.sentences.map((sentence) => sentence.text).join(" ")}
              style={styles.copy}
            >
              {claim.sentences.map((sentence) => sentence.text).join(" ")}
            </Text>
          ))}
        </ViewBlock>
      ))}
      {context.notes.map((note, index) =>
        note.kind === "system" ? (
          <Note key={`${note.code}-${index}`}>
            {note.code === "data_unavailable"
              ? "Some facts are unavailable in this sample. The gap is left open."
              : "No organized opposition filing was found. That is not the same as no opposition."}
          </Note>
        ) : (
          <Text key={note.sentence.text} style={styles.copy}>
            {note.sentence.text}
          </Text>
        ),
      )}
    </Section>
  );
}

function ViewBlock({
  title,
  empty,
  children,
}: {
  title: string;
  empty: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <Text style={styles.blockTitle}>{title}</Text>
      {empty ? <Text style={styles.copy}>Nothing on file.</Text> : children}
    </>
  );
}

const styles = StyleSheet.create({
  verbatim: {
    fontFamily: fonts.displayItalic,
    color: colors.ink,
    fontSize: 18,
    lineHeight: 26,
  },
  copy: { fontFamily: fonts.body, color: colors.ink, fontSize: 16, lineHeight: 23, marginTop: 6 },
  missing: {
    fontFamily: fonts.bold,
    color: colors.rose,
    fontSize: 16,
    lineHeight: 23,
    marginTop: 6,
  },
  blockTitle: {
    fontFamily: fonts.bold,
    color: colors.line,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 14,
  },
});
