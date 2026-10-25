import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useBallotData } from "@/ballotData";
import { Note, Panel, PrimaryButton, TextButton } from "@/components/ui";
import { colors, fonts } from "@/theme";

export function DataConnection() {
  const source = useBallotData();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(process.env.EXPO_PUBLIC_API_URL ?? "");
  const [style, setStyle] = useState(process.env.EXPO_PUBLIC_BALLOT_STYLE_ID ?? "");
  const [release, setRelease] = useState(process.env.EXPO_PUBLIC_RELEASE_ID ?? "");
  return (
    <>
      <TextButton
        label={open ? "Close connection settings" : "Connect a published ballot"}
        icon="scroll"
        onPress={() => setOpen(!open)}
      />
      {open ? (
        <Panel>
          <Text style={styles.title}>Connect your ballot data.</Text>
          <Note>
            Use the serving API and the exact style and release IDs from the data team. Connecting
            starts a fresh walkthrough.
          </Note>
          {(
            [
              ["API URL", url, setUrl, "https://your-api.example"],
              ["Official ballot-style ID", style, setStyle, "Ballot-style ID"],
              ["Frozen release ID", release, setRelease, "Release ID"],
            ] as const
          ).map(([label, value, setValue, placeholder]) => (
            <View key={label} style={styles.field}>
              <Text style={styles.label}>{label}</Text>
              <TextInput
                accessibilityLabel={label}
                value={value}
                onChangeText={setValue}
                placeholder={placeholder}
                placeholderTextColor={colors.inkSoft}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!source.loading}
                style={styles.input}
              />
            </View>
          ))}
          {source.error ? <Note>{source.error} Your current ballot has not changed.</Note> : null}
          <PrimaryButton
            label={source.loading ? "Loading release…" : "Load this ballot"}
            disabled={source.loading || !url.trim() || !style.trim() || !release.trim()}
            onPress={() => {
              void source.connect(url, style, release);
            }}
          />
          {!source.sample && !source.loading ? (
            <TextButton label="Switch to the fictional demo" onPress={source.useSample} />
          ) : null}
        </Panel>
      ) : null}
    </>
  );
}
const styles = StyleSheet.create({
  title: { fontFamily: fonts.display, fontSize: 25, color: colors.ink },
  field: { gap: 6, marginVertical: 8 },
  label: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.cream,
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: 17,
  },
});
