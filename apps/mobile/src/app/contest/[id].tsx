import type { ContextBrief, Contest, Slot } from "@ftb/types";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { type ReactNode } from "react";
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
} from "@/components/ui";
import { contestById, demoBallot, orderedProfiles } from "@/fixtures/travisDemo";
import { formatMoney } from "@/format";
import { JUDICIAL_LABEL, officeKindLabel } from "@/labels";
import { judicialAnswers, polePositions } from "@/matching";
import { useSession } from "@/session";
import { colors, fonts } from "@/theme";

export default function ContestScreen() {
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
        <Title>That contest is not in this sample.</Title>
      </Screen>
    );
  }

  const profiles = orderedProfiles(contest, session.order[contest.id]);
  const userPositions = polePositions(demoBallot.cards, session.swipes);
  const tradeoff = session.swipes.find((swipe) => swipe.cardId === "card-tradeoff");
  const revealed = session.revealed[contest.id] === true;

  return (
    <Screen
      footer={
        profiles.length > 0 ? (
          <PrimaryButton
            label={revealed ? "See the names" : "Lift the mask"}
            onPress={() => {
              if (!revealed) session.revealContest(contest.id);
              router.push({ pathname: "/reveal/[id]", params: { id: contest.id } });
            }}
          />
        ) : undefined
      }
    >
      <TopBar onBack={() => router.navigate("/ballot")} backLabel="Ballot" />
      <SampleMark />
      <Kicker>{officeKindLabel(contest.officeKind)}</Kicker>
      <Title>{contest.title}</Title>
      {contest.officeDescription.map((sentence) => (
        <Body key={sentence.text}>{sentence.text}</Body>
      ))}

      {contest.measure ? <Measure contest={contest} /> : null}
      {contest.officeKind === "judicial" ? <JudicialNotes /> : null}
      {contest.id === "contest-council" && tradeoff?.kind === "tradeoff" ? (
        <TradeoffNote chosen={tradeoff.chosen} />
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
        body="A proposition never gets a vote from this app. The connection to your cards is withheld unless a reviewed link exists. This sample does not claim one."
      />
      <Section title="Ballot language">
        <Text style={styles.verbatim}>{measure.ballotText.text}</Text>
      </Section>
      <SlotBlock label="A yes vote" slot={measure.yesMeans} />
      <SlotBlock label="A no vote" slot={measure.noMeans} />
      <Section title="Dollars">
        <Text style={styles.copy}>
          Principal{" "}
          {measure.fiscal?.principal
            ? formatMoney({ min: measure.fiscal.principal, max: measure.fiscal.principal })
            : "not stated"}
          .
        </Text>
        <Text style={styles.missing}>Interest: Not stated</Text>
        <Note>
          Campaign spending for yes and no is not in this sample. A missing filing is not zero
          dollars.
        </Note>
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
  const session = useSession();
  const answers = judicialAnswers(demoBallot.cards, session.swipes);
  return (
    <Section title="What you said about judging">
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

function TradeoffNote({ chosen }: { chosen: "accept" | "decline" | "skip" }) {
  const line =
    chosen === "accept"
      ? "You said more homes were worth removing those parking minimums."
      : chosen === "decline"
        ? "You said that cost was too high."
        : "You skipped the tradeoff.";
  return (
    <Banner
      title="Your tradeoff"
      body={`${line} That choice is kept separate from the comparison below.`}
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
    <Section title="Context">
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
  missing: { fontFamily: fonts.bold, color: colors.rose, fontSize: 16, lineHeight: 23, marginTop: 6 },
  blockTitle: {
    fontFamily: fonts.bold,
    color: colors.line,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 14,
  },
});
