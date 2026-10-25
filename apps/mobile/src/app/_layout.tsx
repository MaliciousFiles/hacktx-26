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
import { colors } from "@/theme";

// Sheets open over the current screen (UX.md §2.2): the pick sheet, citations and the ☰ menu.
const SHEET = { presentation: "modal", animation: "slide_from_bottom" } as const;

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
      <SessionProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: "slide_from_right",
          }}
        >
          <Stack.Screen name="pick/[id]" options={SHEET} />
          <Stack.Screen name="citation/[id]" options={SHEET} />
          <Stack.Screen name="menu" options={SHEET} />
          {/* The ceremony can't be swiped away halfway through. */}
          <Stack.Screen
            name="unmask/reveal"
            options={{ gestureEnabled: false, animation: "fade" }}
          />
        </Stack>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
