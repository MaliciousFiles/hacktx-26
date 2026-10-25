import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Ellipse, Path } from "react-native-svg";
import { Idle } from "@/components/motion";
import { colors, fonts } from "@/theme";

const LINE = colors.line;

/** A tiny winged pixie. Purely decorative. */
export function PixieArt({ size = 44 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Ellipse
        cx={14}
        cy={20}
        rx={9}
        ry={5.5}
        fill="#DDF1EC"
        stroke={LINE}
        strokeWidth={1.6}
        transform="rotate(-28 14 20)"
      />
      <Ellipse
        cx={14}
        cy={29}
        rx={7}
        ry={4}
        fill="#EBE3F5"
        stroke={LINE}
        strokeWidth={1.6}
        transform="rotate(24 14 29)"
      />
      <Path
        d="M23 28c-4 4-4 9-1 13h12c3-4 3-9-1-13z"
        fill={colors.goldDeep}
        stroke={LINE}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <Circle cx={28} cy={20} r={7.2} fill="#F3D3B2" stroke={LINE} strokeWidth={1.6} />
      <Path
        d="M20.5 19c1-6 6-9 11-7 3 1 4 4 4 7-3-3-9-4-15 0z"
        fill="#6B4A73"
        stroke={LINE}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      <Circle cx={26} cy={21} r={0.9} fill={LINE} />
      <Circle cx={31} cy={21} r={0.9} fill={LINE} />
      <Path
        d="M26.2 24q2.3 1.8 4.6 0"
        fill="none"
        stroke={LINE}
        strokeWidth={1.2}
        strokeLinecap="round"
      />
      <Path d="M36 31l7-8" stroke={LINE} strokeWidth={1.6} strokeLinecap="round" />
      <Path
        d="M43 14l1.4 3 3 1.4-3 1.4L43 23l-1.4-3.2-3-1.4 3-1.4z"
        fill={colors.gold}
        stroke={LINE}
        strokeWidth={1.1}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** The pixie with a small speech bubble, bobbing. The bubble tail points at her. */
export function PixieSays({ children }: { children: string }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`The pixie says: ${children}`}>
      <View style={styles.bubble}>
        <Text style={styles.text}>{children}</Text>
        <View style={styles.tail} />
      </View>
      <Idle kind="float" origin="50% 50%">
        <PixieArt size={38} />
      </Idle>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 5 },
  bubble: {
    flexShrink: 1,
    width: 75,
    backgroundColor: colors.cream,
    borderColor: colors.line,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  text: { fontFamily: fonts.body, color: colors.line, fontSize: 11, lineHeight: 13 },
  tail: {
    position: "absolute",
    right: -6,
    top: "50%",
    marginTop: -5,
    width: 10,
    height: 10,
    backgroundColor: colors.cream,
    borderColor: colors.line,
    borderRightWidth: 1.5,
    borderTopWidth: 1.5,
    transform: [{ rotate: "45deg" }],
  },
});
