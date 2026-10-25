// A card you can fling left or right, Tinder style (UX.md §3.2). Built on React Native's own
// responder system + Animated so Expo Go needs no extra native module. Buttons stay the primary input:
// `fling` lets them run the same animation, and screen readers get matching accessibility actions.
import { forwardRef, useImperativeHandle, useRef, type ReactNode } from "react";
import {
  Animated,
  Easing,
  type GestureResponderEvent,
  type GestureResponderHandlers,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import type { Verdict } from "@/lib/deck";
import { useReducedMotion } from "@/components/motion";
import { colors, fonts, shadows } from "@/theme";

const native = Platform.OS !== "web";
/** How far (pt) or how fast (pt/ms) a drag has to go to count as a swipe. */
const DISTANCE = 110;
const VELOCITY = 0.6;

export type SwipeCardHandle = { fling: (verdict: Verdict) => void };

export const SwipeCard = forwardRef<
  SwipeCardHandle,
  {
    children: ReactNode;
    onSwipe: (verdict: Verdict) => void;
    agreeLabel: string;
    disagreeLabel: string;
    accessibilityLabel: string;
  }
>(function SwipeCard({ children, onSwipe, agreeLabel, disagreeLabel, accessibilityLabel }, ref) {
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const x = useRef(new Animated.Value(0)).current;
  const busy = useRef(false);
  // Keep the latest callback without rebuilding the responder mid-gesture.
  const latest = useRef({ onSwipe, reduced, width });
  latest.current = { onSwipe, reduced, width };

  const fling = (verdict: Verdict) => {
    if (busy.current) return;
    busy.current = true;
    const done = () => latest.current.onSwipe(verdict);
    if (latest.current.reduced) {
      done();
      return;
    }
    const to = (verdict === "agree" ? 1 : -1) * latest.current.width * 1.3;
    Animated.timing(x, {
      toValue: to,
      duration: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: native,
    }).start(done);
  };

  useImperativeHandle(ref, () => ({ fling }));

  // Raw responder props rather than PanResponder: on the web, PanResponder keeps stale mouse
  // history after a release, so a second drag on the same card never registered.
  const drag = useRef({ x0: 0, y0: 0, lastX: 0, lastT: 0, vx: 0 });
  const point = (event: GestureResponderEvent) => ({
    x: event.nativeEvent.pageX,
    y: event.nativeEvent.pageY,
    t: event.nativeEvent.timestamp || Date.now(),
  });
  const settle = () =>
    Animated.spring(x, { toValue: 0, friction: 6, useNativeDriver: native }).start();
  const handlers: GestureResponderHandlers = {
    onStartShouldSetResponderCapture: (event) => {
      const p = point(event);
      drag.current = { x0: p.x, y0: p.y, lastX: p.x, lastT: p.t, vx: 0 };
      return false;
    },
    // Only claim clearly sideways drags, so the page still scrolls vertically.
    onMoveShouldSetResponderCapture: (event) => {
      const p = point(event);
      const dx = p.x - drag.current.x0;
      const dy = p.y - drag.current.y0;
      return !busy.current && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy);
    },
    onResponderTerminationRequest: () => false,
    onResponderMove: (event) => {
      const p = point(event);
      const dt = p.t - drag.current.lastT;
      if (dt > 0) drag.current.vx = (p.x - drag.current.lastX) / dt;
      drag.current.lastX = p.x;
      drag.current.lastT = p.t;
      x.setValue(p.x - drag.current.x0);
    },
    onResponderRelease: (event) => {
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
      style={[styles.card, { transform: [{ translateX: x }, { rotate }] }]}
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
});

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
