import { useState } from "react";
import { openBrowserAsync } from "expo-web-browser";
import { Body, Kicker, Note, Panel, PrimaryButton } from "@/components/ui";
import { webLink, type ShareCounts } from "@/lib/webLinks";

export function WebFeatureButton({ page, counts }: { page: "daily" | "invite"; counts?: ShareCounts }) {
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  return <>
    <PrimaryButton label={opening ? "Opening…" : page === "daily" ? "Play Match the Quote" : "Create & share image card"} disabled={opening} arrow onPress={async () => {
      setError(null); setOpening(true);
      try { await openBrowserAsync(webLink(process.env.EXPO_PUBLIC_WEB_URL, page, counts)); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Could not open the website. Please try again."); }
      finally { setOpening(false); }
    }} />
    {error ? <Note>{error}</Note> : null}
  </>;
}

export function DailyGameEntry() {
  return <Panel>
    <Kicker>The daily game</Kicker>
    <Body>Three quotes. Can you match each one to its plan? A two-minute game with fictional examples, so it never reveals your ballot.</Body>
    <WebFeatureButton page="daily" />
  </Panel>;
}
