// Root navigator. One stack; screen titles live here so routes stay content-only.
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AppProvider } from "../mockup/state";
import { colors } from "../mockup/ui";

export default function RootLayout() {
  return (
    <AppProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.accent,
          headerTitleStyle: { color: colors.text },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Welcome" }} />
        <Stack.Screen name="lookup" options={{ title: "Find your ballot" }} />
        <Stack.Screen name="deck/[deck]" options={{ title: "Explore" }} />
        <Stack.Screen name="ballot" options={{ title: "My ballot" }} />
        <Stack.Screen name="contest/[id]" options={{ title: "Contest" }} />
        <Stack.Screen name="unmask" options={{ title: "The Unmasking" }} />
        <Stack.Screen name="share" options={{ title: "Share" }} />
        <Stack.Screen name="daily" options={{ title: "Daily challenge" }} />
        <Stack.Screen name="how" options={{ title: "How it works" }} />
        <Stack.Screen name="report" options={{ title: "Report an error", presentation: "modal" }} />
      </Stack>
    </AppProvider>
  );
}
