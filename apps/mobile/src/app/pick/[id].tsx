// B6 · Pick sheet. No option is pre-selected or highlighted beyond the voter's own pick.
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { MaskTile } from "@/components/kit";
import { ChoiceButton, Kicker, Note, Screen, TextButton, Title } from "@/components/ui";
import { contestById, orderedProfiles } from "@/data/release";
import { usePhaseGate, WALKING } from "@/gate";
import type { ContestPick } from "@/lib/picks";
import { useSession } from "@/session";
import { colors, fonts } from "@/theme";

function same(a: ContestPick | undefined, b: ContestPick): boolean {
  if (!a || a.kind !== b.kind) return false;
  if (a.kind === "candidate" && b.kind === "candidate") return a.candidateId === b.candidateId;
  if (a.kind === "measure" && b.kind === "measure") return a.choice === b.choice;
  return true;
}

export default function PickSheet() {
  const router = useRouter();
  const session = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const gate = usePhaseGate(WALKING);
  if (gate) return gate;
  const contest = contestById(id);
  if (!contest) return null;

  const current = session.state.picks[contest.id];
  const locked = session.state.phase === "revealed";
  const choose = (pick: ContestPick) => {
    session.pick(contest.id, pick);
    router.back();
  };

  const options: { key: string; label: string; pick: ContestPick; mask?: string }[] =
    contest.officeKind === "measure"
      ? [
          { key: "yes", label: "For", pick: { kind: "measure", choice: "yes" } },
          { key: "no", label: "Against", pick: { kind: "measure", choice: "no" } },
        ]
      : orderedProfiles(contest, session.state.order[contest.id]).map((profile) => ({
          key: profile.id,
          label: session.nameFor(profile.id),
          pick: { kind: "candidate", candidateId: profile.id },
          mask: profile.id,
        }));
  if (contest.writeInsAllowed)
    options.push({ key: "write", label: "Write-in", pick: { kind: "write_in" } });
  options.push({ key: "undecided", label: "Undecided", pick: { kind: "undecided" } });
  options.push({ key: "skip", label: "Skip this race", pick: { kind: "skip" } });

  return (
    <Screen footer={<TextButton label="Close" onPress={() => router.back()} />}>
      <Kicker>Your pick</Kicker>
      <Title>{contest.title}</Title>
      {locked ? <Note>The masks are off, so picks are final for this ballot.</Note> : null}
      <View style={styles.list}>
        {options.map((option) => (
          <View key={option.key} style={styles.option}>
            {option.mask ? (
              <MaskTile
                mask={session.masks[option.mask]}
                name={session.identityFor(option.mask)?.name}
                size={44}
              />
            ) : null}
            <View style={styles.fill}>
              <ChoiceButton
                label={option.label}
                selected={same(current, option.pick)}
                onPress={() => (locked ? undefined : choose(option.pick))}
              />
            </View>
          </View>
        ))}
      </View>
      {current && !locked ? (
        <TextButton
          label="Clear my pick"
          onPress={() => {
            session.pick(contest.id, null);
            router.back();
          }}
        />
      ) : null}
      <Text style={styles.caption}>
        Saved only on this phone. You can change it anytime before the Unmasking.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { gap: 10, marginTop: 6 },
  option: { flexDirection: "row", alignItems: "center", gap: 10 },
  caption: {
    fontFamily: fonts.body,
    color: colors.inkSoft,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 14,
    textAlign: "center",
  },
});
