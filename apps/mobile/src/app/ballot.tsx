// B1 · My Ballot: every contest in official order, grouped by section (UX.md §3.3, Inv. 20).
import type { Contest, OfficeKind } from "@ftb/types";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "@/components/art";
import { Chip, ChipRow, type ChipTone } from "@/components/kit";
import { Enter, PressableScale } from "@/components/motion";
import {
  Banner,
  IconBox,
  Kicker,
  Note,
  PrimaryButton,
  SampleMark,
  Screen,
  TextButton,
  Title,
  TopBar,
} from "@/components/ui";
import { contests, demo, isObjectiveOnly, orderedProfiles, release } from "@/data/release";
import { usePhaseGate, WALKING } from "@/gate";
import { officeKindLabel, sectionOf, SECTION_LABEL, type BallotSection } from "@/labels";
import { isDecided, pickLabel } from "@/lib/picks";
import { useSession } from "@/session";
import { colors, fonts, shadows } from "@/theme";

export default function Ballot() {
  const session = useSession();
  const router = useRouter();
  const gate = usePhaseGate(WALKING);
  if (gate) return gate;

  const { state } = session;
  const revealed = state.phase === "revealed";
  const looked = contests.filter((contest) => state.visited[contest.id]).length;
  const picked = contests.filter((contest) => isDecided(state.picks[contest.id])).length;

  const sections: { section: BallotSection; items: Contest[] }[] = [];
  for (const contest of contests) {
    const section = sectionOf(contest);
    const last = sections[sections.length - 1];
    if (last && last.section === section) last.items.push(contest);
    else sections.push({ section, items: [contest] });
  }

  return (
    <Screen
      header={
        <TopBar
          onBack={
            revealed
              ? undefined
              : () => {
                  session.backToExplore();
                  router.navigate("/explore");
                }
          }
          backLabel="Deck"
          action={
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Menu"
              hitSlop={10}
              onPress={() => router.push("/menu")}
              style={styles.menu}
            >
              <View style={styles.menuBar} />
              <View style={styles.menuBar} />
              <View style={styles.menuBar} />
            </PressableScale>
          }
        />
      }
      footer={
        revealed ? (
          <>
            <PrimaryButton
              label="Surprised?"
              arrow
              onPress={() => router.push("/unmask/surprised")}
            />
            <TextButton
              label="My ballot notes"
              icon="scroll"
              onPress={() => router.push("/notes")}
            />
          </>
        ) : (
          <PrimaryButton
            label="Ready for the Unmasking?"
            disabled={looked === 0}
            onPress={() => router.push("/unmask")}
          />
        )
      }
    >
      {demo ? <SampleMark /> : null}
      <Kicker>{revealed ? "Masks off" : "Your ballot"}</Kicker>
      <Title>My Ballot</Title>
      <Text style={styles.stamp}>
        {release.id} · {looked} of {contests.length} looked at · {picked} picked
      </Text>
      <Note>
        Every contest is here, in ballot order. Nothing is dropped because the evidence is thin.
      </Note>
      {session.masksRefreshed && !revealed ? (
        <Banner
          title="Your masks were refreshed for privacy"
          body="Masks last 24 hours. New ones were dealt, and your picks are kept."
        />
      ) : null}

      {sections.map(({ section, items }) => (
        <View key={section}>
          <Text style={styles.section}>{SECTION_LABEL[section]}</Text>
          {items.map((contest, index) => (
            <Enter key={contest.id} kind="deal" delay={80 + index * 90}>
              <ContestRow contest={contest} />
            </Enter>
          ))}
        </View>
      ))}
      {!revealed && looked === 0 ? (
        <Note>Open at least one contest before the Unmasking.</Note>
      ) : null}
    </Screen>
  );
}

function coverage(contest: Contest): { label: string; tone: ChipTone; icon: IconName } {
  if (contest.officeKind === "measure")
    return { label: "Yes/No measure", tone: "gold", icon: "scroll" };
  if (contest.unopposed) return { label: "Unopposed", tone: "plain", icon: "info" };
  if (contest.officeKind === "judicial") return { label: "Judicial", tone: "gold", icon: "gavel" };
  if (isObjectiveOnly(contest))
    return { label: "Objective info only", tone: "plain", icon: "info" };
  return { label: "Full analysis", tone: "sage", icon: "check" };
}

function ContestRow({ contest }: { contest: Contest }) {
  const router = useRouter();
  const session = useSession();
  const { state } = session;
  const pick = state.picks[contest.id];
  const status = pick
    ? pick.kind === "undecided"
      ? "Undecided"
      : "Picked"
    : state.visited[contest.id]
      ? "Looked at"
      : "Not started";
  const chip = coverage(contest);
  const profiles = orderedProfiles(contest, state.order[contest.id]);
  const detail =
    contest.officeKind === "measure"
      ? "Yes/No · ballot text first"
      : `${officeKindLabel(contest.officeKind)} · ${profiles.length} candidate${profiles.length === 1 ? "" : "s"}`;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${contest.title}. ${chip.label}. ${status}`}
      onPress={() => router.push({ pathname: "/contest/[id]", params: { id: contest.id } })}
      depth={0.98}
      style={styles.row}
    >
      <View style={styles.rowHead}>
        <IconBox icon={OFFICE_ICONS[contest.officeKind]} />
        <Text style={styles.rowTitle}>{contest.title}</Text>
        <Icon name="chevron" size={18} strokeWidth={2.4} />
      </View>
      <Text style={styles.detail}>{detail}</Text>
      <ChipRow>
        <Chip label={chip.label} tone={chip.tone} icon={chip.icon} />
        <Chip
          label={status}
          tone={status === "Not started" ? "dashed" : "plain"}
          icon={status === "Picked" ? "check" : undefined}
        />
      </ChipRow>
      {state.phase === "revealed" && profiles.length > 0 ? (
        <Text style={styles.names}>
          {profiles.map((profile) => session.nameFor(profile.id)).join("  ·  ")}
          {pick ? `\nYour pick: ${pickLabel(pick, session.nameFor)}` : ""}
        </Text>
      ) : null}
    </PressableScale>
  );
}

const OFFICE_ICONS: Record<OfficeKind, IconName> = {
  legislative: "house",
  executive: "star",
  regulatory: "scale",
  judicial: "gavel",
  board: "book",
  measure: "scroll",
};

const styles = StyleSheet.create({
  stamp: { fontFamily: fonts.bold, color: colors.line, fontSize: 14 },
  section: {
    fontFamily: fonts.bold,
    color: colors.line,
    fontSize: 13,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: 22,
  },
  menu: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.cream,
    boxShadow: `0 2px 0 ${colors.bevel}`,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  menuBar: { width: 18, height: 2.5, borderRadius: 2, backgroundColor: colors.line },
  row: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 2,
    borderRadius: 10,
    boxShadow: `inset 0 0 0 3px ${colors.card}, inset 0 0 0 4px ${colors.lineSoft}, ${shadows.paper}`,
    padding: 14,
    marginTop: 10,
  },
  rowHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowTitle: {
    flex: 1,
    fontFamily: fonts.display,
    color: colors.heading,
    fontSize: 21,
    lineHeight: 25,
  },
  detail: { fontFamily: fonts.body, color: colors.inkSoft, fontSize: 14, marginTop: 6 },
  names: { fontFamily: fonts.body, color: colors.ink, fontSize: 14, lineHeight: 20, marginTop: 8 },
});
