import { Redirect, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { useRef, useState, type ComponentRef } from "react";
import { Platform, Share, View } from "react-native";
import { captureRef } from "react-native-view-shot";
import { useBallotData } from "@/ballotData";
import { FairyBallot } from "@/components/FairyBallot";
import {
  Body,
  Kicker,
  Note,
  PrimaryButton,
  SampleMark,
  Screen,
  TextButton,
  Title,
  TopBar,
} from "@/components/ui";
import { ballotRows, isChosen, shareMessage } from "@/lib/shareBallot";
import { useSession } from "@/session";

/** Your picks, still in costume. The unmasking is the next, separate step. */
export default function ShareScreen() {
  const { data, sample, contestById } = useBallotData();
  const session = useSession();
  const router = useRouter();
  const cardRef = useRef<ComponentRef<typeof View>>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!session.started) return <Redirect href="/" />;

  const contests = data.ballot.contestIds.flatMap((id) => {
    const contest = contestById(id);
    return contest ? [contest] : [];
  });
  const rows = ballotRows(
    contests,
    session.picks,
    (id) => session.masks?.map[id] ?? session.openedMasks[id],
  );
  const chosen = rows.filter(isChosen).length;
  const footerText = sample
    ? "Fictional sample ballot"
    : "Names and parties stay hidden until the unmasking";

  const share = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      // Image first: rendered here on the phone, never uploaded.
      if (Platform.OS !== "web" && (await Sharing.isAvailableAsync())) {
        const uri = await captureRef(cardRef, { format: "png", quality: 1 });
        await Sharing.shareAsync(uri, {
          mimeType: "image/png",
          dialogTitle: "My Fairy Tale Ballot",
        });
        return;
      }
      throw new Error("image sharing unavailable");
    } catch {
      try {
        await Share.share({ message: shareMessage(rows, sample) });
      } catch {
        setNote("Sharing is not available here. The card above is the whole message.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      header={<TopBar onBack={() => router.navigate("/ballot")} backLabel="Ballot" />}
      footer={
        <>
          <Note>The unmasking shows every real name and party. The masks do not go back on.</Note>
          <PrimaryButton
            label="Reveal my true ballot"
            arrow
            onPress={() => router.push("/unmask")}
          />
        </>
      }
    >
      <SampleMark />
      <Kicker>Your fairy-tale ballot</Kicker>
      <Title>Here is who you picked.</Title>
      <Body>
        {chosen === 0
          ? "You have not picked anyone yet. Go back to the ballot to choose."
          : "Every pick is still in costume. Share this card now, or keep it a secret until the big reveal."}
      </Body>

      <FairyBallot viewRef={cardRef} rows={rows} footer={footerText} />

      {note ? <Note>{note}</Note> : null}
      <Note>
        The card is drawn on your phone and shows characters only: no names, parties or candidate
        details.
      </Note>
      <TextButton label={busy ? "Preparing…" : "Share this card"} icon="envelope" onPress={share} />
    </Screen>
  );
}
