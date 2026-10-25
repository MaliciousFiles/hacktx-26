import { AlegreyaSans_500Medium, AlegreyaSans_700Bold } from "@expo-google-fonts/alegreya-sans";
import {
  IMFellEnglish_400Regular,
  IMFellEnglish_400Regular_Italic,
} from "@expo-google-fonts/im-fell-english";
import { IMFellEnglishSC_400Regular } from "@expo-google-fonts/im-fell-english-sc";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider } from "@/session";
import { BallotDataProvider } from "@/ballotData";
import { colors } from "@/theme";

export default function RootLayout() {
  const [loaded, error] = useFonts({
    AlegreyaSans_500Medium,
    AlegreyaSans_700Bold,
    IMFellEnglish_400Regular,
    IMFellEnglish_400Regular_Italic,
    IMFellEnglishSC_400Regular,
  });

  // A font failure falls back to system type rather than blocking the app.
  if (!loaded && !error) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <SafeAreaProvider>
      <BallotDataProvider>
        <SessionProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
              animation: "slide_from_right",
              // Navigation is explicit (Back buttons only); no edge-swipe to go back.
              gestureEnabled: false,
              fullScreenGestureEnabled: false,
            }}
          />
        </SessionProvider>
      </BallotDataProvider>
    </SafeAreaProvider>
  );
}
