import { useRouter } from "expo-router";
import { PrimaryButton, SampleMark, Screen, Title } from "@/components/ui";

export default function NotFound() {
  const router = useRouter();
  return (
    <Screen
      footer={<PrimaryButton label="Back to the start" onPress={() => router.navigate("/")} />}
    >
      <SampleMark />
      <Title>That page is not on this ballot.</Title>
    </Screen>
  );
}
