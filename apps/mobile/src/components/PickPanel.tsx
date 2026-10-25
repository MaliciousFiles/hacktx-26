import type { Contest } from "@ftb/types";
import { StyleSheet, Text, View } from "react-native";
import { useCandidateName } from "@/candidateName";
import { useBallotData } from "@/ballotData";
import { Portrait } from "@/components/Portrait";
import { ChoiceButton, Section } from "@/components/ui";
import type { ContestPick } from "@/lib/picks";
import { useSession } from "@/session";
import { colors, fonts } from "@/theme";

function samePick(a: ContestPick | undefined, b: ContestPick): boolean {
  if (!a || a.kind !== b.kind) return false;
  if (a.kind === "candidate" && b.kind === "candidate") return a.candidateId === b.candidateId;
  if (a.kind === "measure" && b.kind === "measure") return a.choice === b.choice;
  return true;
}

/**
 * Every way to answer this contest. Nothing is pre-selected and no option is emphasized.
 * Picks live on this phone only.
 */
export function PickPanel({ contest }: { contest: Contest }) {
  const session = useSession();
  const current = session.picks[contest.id];
  const toggle = (pick: ContestPick) =>
    session.setPick(contest.id, samePick(current, pick) ? null : pick);

  const options: { label: string; pick: ContestPick }[] = [];
  if (contest.measure) {
    options.push(
      { label: "For", pick: { kind: "measure", choice: "yes" } },
      { label: "Against", pick: { kind: "measure", choice: "no" } },
    );
  }
  options.push({ label: "I'm undecided", pick: { kind: "undecided" } });
  if (contest.writeInsAllowed) options.push({ label: "A write-in", pick: { kind: "write_in" } });
  options.push({ label: "Skip this race", pick: { kind: "skip" } });

  return (
    <Section title="Your pick" icon="star">
      <Text style={styles.lead}>
        {contest.measure
          ? "Read the ballot language, then choose."
          : "Choose one candidate above, or leave it open."}{" "}
        Saved only on this phone. You can change it until the unmasking.
      </Text>
      {current?.kind === "candidate" ? (
        <PickedCandidate contest={contest} id={current.candidateId} />
      ) : null}
      <View style={styles.options}>
        {options.map((option) => (
          <ChoiceButton
            key={option.label}
            label={option.label}
            selected={samePick(current, option.pick)}
            onPress={() => toggle(option.pick)}
          />
        ))}
      </View>
    </Section>
  );
}

function PickedCandidate({ contest, id }: { contest: Contest; id: string }) {
  const { orderedProfiles } = useBallotData();
  const profile = orderedProfiles(contest, undefined).find((item) => item.id === id);
  if (!profile) return null;
  return <PickedRow contest={contest} profile={profile} />;
}

function PickedRow({
  contest,
  profile,
}: {
  contest: Contest;
  profile: ReturnType<ReturnType<typeof useBallotData>["orderedProfiles"]>[number];
}) {
  const { name, character } = useCandidateName(contest, profile);
  return (
    <View style={styles.picked}>
      <Portrait character={character ?? name} size={44} />
      <View style={styles.fill}>
        <Text style={styles.pickedLabel}>You picked</Text>
        <Text style={styles.pickedName}>{name}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  lead: { fontFamily: fonts.body, color: colors.inkSoft, fontSize: 15, lineHeight: 21 },
  options: { gap: 10, marginTop: 12 },
  picked: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.forestSoft,
    borderColor: colors.forest,
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
  },
  pickedLabel: { fontFamily: fonts.bold, color: colors.inkSoft, fontSize: 13 },
  pickedName: { fontFamily: fonts.display, color: colors.heading, fontSize: 20 },
});
