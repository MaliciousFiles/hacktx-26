// Small motion kit on React Native's Animated API, matching the mockup's
// storybook timing: springy entrances, gentle idle loops, tactile presses.
// Everything settles instantly when the system "reduce motion" setting is on.
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

const native = Platform.OS !== "web";
const spring = Easing.bezier(0.34, 1.56, 0.64, 1);
const settle = Easing.bezier(0.22, 1, 0.36, 1);
const breathe = Easing.bezier(0.65, 0, 0.35, 1);

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (live) setReduced(value);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

/** A 0→1→0 value that loops forever (or sits at 0 when motion is reduced). */
function useLoop(duration: number, { delay = 0, linear = false } = {}): Animated.Value {
  const reduced = useReducedMotion();
  const [value] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduced) {
      value.setValue(0);
      return;
    }
    const easing = linear ? Easing.linear : breathe;
    const loop = linear
      ? Animated.loop(
          Animated.timing(value, { toValue: 1, duration, easing, useNativeDriver: native }),
        )
      : Animated.loop(
          Animated.sequence([
            Animated.timing(value, {
              toValue: 1,
              duration: duration / 2,
              easing,
              useNativeDriver: native,
            }),
            Animated.timing(value, {
              toValue: 0,
              duration: duration / 2,
              easing,
              useNativeDriver: native,
            }),
          ]),
        );
    const timer = setTimeout(() => loop.start(), delay);
    return () => {
      clearTimeout(timer);
      loop.stop();
    };
  }, [delay, duration, linear, reduced, value]);
  return value;
}

/** Entrance: ink rising onto the page, or a card being dealt. */
export function Enter({
  children,
  delay = 0,
  kind = "ink",
  style,
}: {
  children: ReactNode;
  delay?: number;
  kind?: "ink" | "deal" | "pop";
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(reduced ? 1 : 0));
  useEffect(() => {
    if (reduced) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: kind === "ink" ? 600 : kind === "pop" ? 380 : 620,
      delay,
      easing: kind === "ink" ? settle : spring,
      useNativeDriver: native,
    });
    animation.start();
    return () => animation.stop();
  }, [delay, kind, progress, reduced]);

  const opacity = progress.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0, 1, 1],
    extrapolate: "clamp",
  });
  const transform =
    kind === "deal"
      ? [
          { perspective: 900 },
          {
            translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] }),
          },
          {
            rotateX: progress.interpolate({ inputRange: [0, 1], outputRange: ["-55deg", "0deg"] }),
          },
        ]
      : kind === "pop"
        ? [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }]
        : [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }];

  return (
    <Animated.View
      style={[
        style,
        { opacity, transform, transformOrigin: kind === "deal" ? "50% 0%" : "50% 50%" },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** Idle loops for illustrations. */
export function Idle({
  children,
  kind,
  duration,
  delay = 0,
  origin = "50% 100%",
  style,
}: {
  children: ReactNode;
  kind: "bob" | "float" | "sway" | "drift" | "twinkle" | "spin" | "nudge";
  duration?: number;
  delay?: number;
  origin?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const defaults = {
    bob: 2800,
    float: 3200,
    sway: 4200,
    drift: 9000,
    twinkle: 1800,
    spin: 32000,
    nudge: 1400,
  };
  const t = useLoop(duration ?? defaults[kind], { delay, linear: kind === "spin" });
  const range = (to: number | string) =>
    t.interpolate({
      inputRange: [0, 1],
      outputRange: [typeof to === "number" ? 0 : "0deg", to] as never,
    });
  const animated: Record<typeof kind, object> = {
    bob: { transform: [{ translateY: range(-2.5) }, { rotate: range("-1.2deg") }] },
    float: { transform: [{ translateY: range(-3) }, { rotate: range("2deg") }] },
    sway: { transform: [{ rotate: range("2.5deg") }] },
    drift: { transform: [{ translateX: range(8) }] },
    nudge: { transform: [{ translateX: range(4) }] },
    spin: { transform: [{ rotate: range("360deg") }] },
    twinkle: {
      opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
      transform: [
        { scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1.12] }) },
        { rotate: range("20deg") },
      ],
    },
  };
  return (
    <Animated.View
      pointerEvents="none"
      style={[style, { transformOrigin: origin }, animated[kind]]}
    >
      {children}
    </Animated.View>
  );
}

/** Expanding ring behind the current marker. */
export function PulseRing({ size, color }: { size: number; color: string }) {
  const t = useLoop(1800, { linear: true });
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity: t.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.55, 0, 0] }),
        transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 2.3] }) }],
      }}
    />
  );
}

/** Plays a one-shot flourish whenever `trigger` changes (skips the first render). */
export function Flourish({
  children,
  trigger,
  kind,
  style,
}: {
  children: ReactNode;
  trigger: unknown;
  kind: "hop" | "wiggle";
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const [t] = useState(() => new Animated.Value(0));
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduced) return;
    t.setValue(0);
    Animated.timing(t, {
      toValue: 1,
      duration: 460,
      easing: Easing.linear,
      useNativeDriver: native,
    }).start();
  }, [reduced, t, trigger]);
  const transform =
    kind === "hop"
      ? [
          { translateY: t.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, -6, 0] }) },
          {
            rotate: t.interpolate({
              inputRange: [0, 0.4, 1],
              outputRange: ["0deg", "-0.6deg", "0deg"],
            }),
          },
        ]
      : [
          {
            scale: t.interpolate({ inputRange: [0, 0.3, 0.6, 1], outputRange: [1, 1.12, 0.97, 1] }),
          },
          {
            rotate: t.interpolate({
              inputRange: [0, 0.3, 0.6, 1],
              outputRange: ["0deg", "-5deg", "3deg", "0deg"],
            }),
          },
        ];
  return <Animated.View style={[style, { transform }]}>{children}</Animated.View>;
}

/** The "chosen" rubber stamp landing. */
export function StampIn({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const [t] = useState(() => new Animated.Value(reduced ? 1 : 0));
  useEffect(() => {
    if (reduced) return;
    Animated.timing(t, {
      toValue: 1,
      duration: 500,
      easing: Easing.out(Easing.quad),
      useNativeDriver: native,
    }).start();
  }, [reduced, t]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: t.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1] }),
          transform: [
            { scale: t.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1.8, 0.92, 1] }) },
            {
              rotate: t.interpolate({
                inputRange: [0, 0.6, 1],
                outputRange: ["-14deg", "8deg", "5deg"],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** Draws a line in from the left. */
export function DrawIn({ children, delay = 150 }: { children: ReactNode; delay?: number }) {
  const reduced = useReducedMotion();
  const [t] = useState(() => new Animated.Value(reduced ? 1 : 0));
  useEffect(() => {
    if (reduced) return;
    Animated.timing(t, {
      toValue: 1,
      duration: 700,
      delay,
      easing: settle,
      useNativeDriver: native,
    }).start();
  }, [delay, reduced, t]);
  return (
    <Animated.View style={{ transformOrigin: "0% 50%", transform: [{ scaleX: t }] }}>
      {children}
    </Animated.View>
  );
}

/** Pressable that sinks into the page on touch. */
export function PressableScale({
  children,
  style,
  depth = 0.97,
  ...props
}: Omit<PressableProps, "style" | "children"> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  depth?: number;
}) {
  const [t] = useState(() => new Animated.Value(0));
  const to = (value: number) =>
    Animated.spring(t, {
      toValue: value,
      speed: 40,
      bounciness: value ? 0 : 10,
      useNativeDriver: native,
    }).start();
  return (
    <Pressable
      {...props}
      onPressIn={(event) => {
        to(1);
        props.onPressIn?.(event);
      }}
      onPressOut={(event) => {
        to(0);
        props.onPressOut?.(event);
      }}
    >
      <Animated.View
        style={[
          style,
          {
            transform: [
              { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, 2] }) },
              { scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, depth] }) },
            ],
          },
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}
