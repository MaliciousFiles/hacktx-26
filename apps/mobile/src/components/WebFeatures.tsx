import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { openBrowserAsync } from "expo-web-browser";
import { Body, Kicker, Note, Panel, PrimaryButton } from "@/components/ui";
import { webLink, type ShareCounts } from "@/lib/webLinks";

export function WebFeatureButton({ page, counts }: { page: "daily" | "invite"; counts?: ShareCounts }) {
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  return <>
    <PrimaryButton label={opening ? "Opening…" : page === "daily" ? "Play Fact or Fairy Tale" : "Create & share image card"} disabled={opening} arrow onPress={async () => {
      setError(null); setOpening(true);
      try { await openBrowserAsync(webLink(process.env.EXPO_PUBLIC_WEB_URL, page, counts)); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Could not open the website. Please try again."); }
      finally { setOpening(false); }
    }} />
    {error ? <Note>{error}</Note> : null}
  </>;
}

export function DailyGameEntry() {
  const router = useRouter();
  return <Panel>
    <View style={{ gap: 14, paddingVertical: 6 }}>
      <Kicker>The daily game</Kicker>
      <Body>Swipe right for a fact, left for a fairy tale. Eight quick cards of odd civic trivia, fresh every day. It never touches your ballot.</Body>
      <PrimaryButton label="Play Fact or Fairy Tale" arrow onPress={() => router.push("/daily")} />
    </View>
  </Panel>;
}
