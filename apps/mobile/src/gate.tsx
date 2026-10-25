// Phase gates (UX.md §2.1). Screens call `usePhaseGate` first and render its element if non-null.
import { Redirect } from "expo-router";
import type { ReactElement } from "react";
import { View } from "react-native";
import type { Phase } from "@/lib/session";
import { useSession } from "@/session";
import { colors } from "@/theme";

/** Where a phase lives when the app opens or a gate bounces. */
export function homeFor(phase: Phase): "/" | "/explore" | "/ballot" {
  if (phase === "explore") return "/explore";
  if (phase === "walkthrough" || phase === "revealed") return "/ballot";
  return "/";
}

/** A blank page while the stored session loads, or a redirect when the phase isn't allowed. */
export function usePhaseGate(allowed: readonly Phase[]): ReactElement | null {
  const session = useSession();
  if (!session.ready) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (!allowed.includes(session.state.phase))
    return <Redirect href={homeFor(session.state.phase)} />;
  return null;
}

export const AFTER_ONBOARDING: readonly Phase[] = ["explore", "walkthrough", "revealed"];
export const WALKING: readonly Phase[] = ["walkthrough", "revealed"];
