// O5 · Choose my ballot style: the manual, official list. Built first; location lookup is a
// stretch (UX.md §3.1). Nothing typed here leaves the phone: the list is bundled.
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { RowLink } from "@/components/kit";
import { Kicker, Note, Panel, Screen, TextButton, Title, TopBar } from "@/components/ui";
import { ballotStyles } from "@/data/release";
import { colors, fonts } from "@/theme";

export default function ChooseStyle() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [help, setHelp] = useState(false);
  const needle = query.trim().toLowerCase();
  const matches = ballotStyles.filter((style) =>
    [style.id, style.precinctId ?? "", style.label].some((text) =>
      text.toLowerCase().includes(needle),
    ),
  );

  return (
    <Screen header={<TopBar onBack={() => router.back()} />}>
      <Kicker>Find my ballot</Kicker>
      <Title>Which ballot is yours?</Title>
      <Text style={styles.lead}>
        Pick your style from the official list. Your address is never asked for.
      </Text>
      <TextInput
        accessibilityLabel="Search ballot styles"
        placeholder="Precinct or style number"
        placeholderTextColor={colors.inkSoft}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        autoCapitalize="none"
        style={styles.search}
      />
      {matches.map((style) => (
        <RowLink
          key={style.id}
          icon="scroll"
          title={style.label}
          detail={`${style.id}${style.precinctId ? ` · ${style.precinctId}` : ""}\n${style.detail}`}
          onPress={() =>
            router.push({ pathname: "/onboarding/confirm", params: { style: style.id } })
          }
        />
      ))}
      {matches.length === 0 ? (
        <Note>No style matches that. Check the number on your voter registration card.</Note>
      ) : null}
      <TextButton label="Where do I find this?" icon="info" onPress={() => setHelp(!help)} />
      {help ? (
        <Panel>
          <Text style={styles.help}>
            Your precinct number is on your voter registration card. VoteTravis.gov also has a
            personalized sample ballot lookup that shows your ballot style.
          </Text>
        </Panel>
      ) : null}
      <Note>Travis County · November 3, 2026</Note>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: { fontFamily: fonts.body, color: colors.ink, fontSize: 17, lineHeight: 24 },
  search: {
    marginTop: 16,
    minHeight: 48,
    borderWidth: 2,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: colors.cream,
    paddingHorizontal: 14,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
  },
  help: { fontFamily: fonts.body, color: colors.ink, fontSize: 15, lineHeight: 22 },
});
