// The top card of the Explore stack: fling it right or left, Tinder style (UX.md §3.2). Built on
// React Native's own responder system + Animated, so Expo Go needs no extra gesture module.
// Swipes are the input; screen readers get matching accessibility actions.
import * as Haptics from "expo-haptics";
import { useRef, type ReactNode } from "react";
import {
  Animated,
  Easing,
  type GestureResponderEvent,
  type GestureResponderHandlers,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useReducedMotion } from "@/components/motion";
import type { Verdict } from "@/lib/deck";
import { colors, fonts, shadows } from "@/theme";

const native = Platform.OS !== "web";
/** How far (pt) or how fast (pt/ms) a drag has to go to count as a swipe. */
const DISTANCE = 110;
const VELOCITY = 0.6;

// Haptics are a nicety: a phone without them (or the web) just stays quiet.
function buzz(kind: "tick" | "commit") {
  if (!native) return;
  const run =
    kind === "tick"
      ? Haptics.selectionAsync()
      : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  run.catch(() => {});
}

export function SwipeCard({
  children,
  onSwipe,
  onDragging,
  agreeLabel,
  disagreeLabel,
  accessibilityLabel,
  style,
}: {
  children: ReactNode;
  onSwipe: (verdict: Verdict) => void;
  /** True while a sideways drag owns the touch, so the card's own scrolling can pause. */
  onDragging?: (dragging: boolean) => void;
  agreeLabel: string;
  disagreeLabel: string;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const x = useRef(new Animated.Value(0)).current;
  const busy = useRef(false);
  // Raw responder props rather than PanResponder: on the web, PanResponder keeps stale mouse
  // history after a release, so a second drag on the same card never registered.
  const drag = useRef({ x0: 0, y0: 0, lastX: 0, lastT: 0, vx: 0, past: 0 });

  const fling = (verdict: Verdict) => {
    if (busy.current) return;
    busy.current = true;
    buzz("commit");
    const done = () => onSwipe(verdict);
    if (reduced) {
      done();
      return;
    }
    Animated.timing(x, {
      toValue: (verdict === "agree" ? 1 : -1) * width * 1.3,
      duration: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: native,
    }).start(done);
  };

  const point = (event: GestureResponderEvent) => ({
    x: event.nativeEvent.pageX,
    y: event.nativeEvent.pageY,
    t: event.nativeEvent.timestamp || Date.now(),
  });
  const settle = () => {
    onDragging?.(false);
    Animated.spring(x, { toValue: 0, friction: 6, useNativeDriver: native }).start();
  };

  const handlers: GestureResponderHandlers = {
    onStartShouldSetResponderCapture: (event) => {
      const p = point(event);
      drag.current = { x0: p.x, y0: p.y, lastX: p.x, lastT: p.t, vx: 0, past: 0 };
      return false;
    },
    // Claim clearly sideways drags in the capture phase, before the card's scroll area can.
    onMoveShouldSetResponderCapture: (event) => {
      const p = point(event);
      const dx = p.x - drag.current.x0;
      const dy = p.y - drag.current.y0;
      return !busy.current && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy);
    },
    onResponderGrant: () => onDragging?.(true),
    onResponderTerminationRequest: () => false,
    onResponderMove: (event) => {
      const p = point(event);
      const dt = p.t - drag.current.lastT;
      if (dt > 0) drag.current.vx = (p.x - drag.current.lastX) / dt;
      drag.current.lastX = p.x;
      drag.current.lastT = p.t;
      const dx = p.x - drag.current.x0;
      // A light tick each time the drag crosses the point where letting go would count.
      const past = dx > DISTANCE ? 1 : dx < -DISTANCE ? -1 : 0;
      if (past !== drag.current.past) {
        if (past !== 0) buzz("tick");
        drag.current.past = past;
      }
      x.setValue(dx);
    },
    onResponderRelease: (event) => {
      onDragging?.(false);
      const dx = point(event).x - drag.current.x0;
      const { vx } = drag.current;
      if (dx > DISTANCE || (dx > 0 && vx > VELOCITY)) fling("agree");
      else if (dx < -DISTANCE || (dx < 0 && vx < -VELOCITY)) fling("disagree");
      else settle();
    },
    onResponderTerminate: settle,
  };

  const rotate = x.interpolate({
    inputRange: [-240, 0, 240],
    outputRange: ["-8deg", "0deg", "8deg"],
    extrapolate: "clamp",
  });
  const agreeOpacity = x.interpolate({
    inputRange: [20, 100],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const disagreeOpacity = x.interpolate({
    inputRange: [-100, -20],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  return (
    <Animated.View
      {...handlers}
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={`Swipe right for ${agreeLabel}, left for ${disagreeLabel}.`}
      accessibilityActions={[
        { name: "agree", label: agreeLabel },
        { name: "disagree", label: disagreeLabel },
      ]}
      onAccessibilityAction={(event) =>
        fling(event.nativeEvent.actionName === "agree" ? "agree" : "disagree")
      }
      style={[styles.card, style, { transform: [{ translateX: x }, { rotate }] }]}
    >
      {children}
      {/* Both stamps look the same: color never says which answer is "good". */}
      <Animated.View
        pointerEvents="none"
        style={[styles.stamp, styles.stampRight, { opacity: agreeOpacity }]}
      >
        <Text style={styles.stampText}>{agreeLabel}</Text>
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[styles.stamp, styles.stampLeft, { opacity: disagreeOpacity }]}
      >
        <Text style={styles.stampText}>{disagreeLabel}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 2,
    borderColor: colors.line,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: colors.card,
    boxShadow: shadows.paper,
  },
  stamp: {
    position: "absolute",
    top: 18,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: colors.line,
    backgroundColor: colors.gold,
  },
  stampRight: { left: 16, transform: [{ rotate: "-10deg" }] },
  stampLeft: { right: 16, transform: [{ rotate: "10deg" }] },
  stampText: {
    fontFamily: fonts.smallCaps,
    color: colors.line,
    fontSize: 22,
    letterSpacing: 1,
  },
});
