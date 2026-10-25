// Storybook portraits for the fantasy cast (VISUAL_DESIGN.md §5). Every portrait shares one
// head-and-shoulders frame and line weight; only the costume and fantasy skin tone change.
// Nothing here reads a candidate: the cast is dealt at random and a portrait carries no meaning.
import { useId, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Path, Rect } from "react-native-svg";
import { colors, fonts } from "@/theme";

const LINE = colors.line;
const GOLD = colors.gold;
const GOLD_DEEP = colors.goldDeep;
const CREAM = "#FFF6E2";
const FOREST = colors.forest;
const LEAF = "#5E8E5E";
const TEAL = "#6FA591";
const BROWN = "#8E4A3E";
const WOOD = "#C79A5E";
const PLUM = "#6B4A73";

type Look = {
  skin: string;
  robe: string;
  field: string;
  /** Drawn behind the head (hoods, wings, hair). */
  back?: ReactNode;
  /** Drawn on top (hats, glasses, props). */
  front?: ReactNode;
};

const ink = {
  stroke: LINE,
  strokeWidth: 1.6,
  strokeLinejoin: "round",
  strokeLinecap: "round",
} as const;

function Star({ x, y, s = 3, fill = GOLD }: { x: number; y: number; s?: number; fill?: string }) {
  return (
    <Path
      d={`M${x} ${y - s}l${s * 0.35} ${s * 0.65} ${s * 0.65} ${s * 0.35}-${s * 0.65} ${s * 0.35}-${s * 0.35} ${s * 0.65}-${s * 0.35}-${s * 0.65}-${s * 0.65}-${s * 0.35} ${s * 0.65}-${s * 0.35}z`}
      fill={fill}
      {...ink}
      strokeWidth={1}
    />
  );
}

/** Same softly smiling, ageless face for everyone. */
function Face({ skin }: { skin: string }) {
  return (
    <G>
      <Ellipse cx={32} cy={31} rx={11} ry={12.5} fill={skin} {...ink} />
      <Circle cx={27.6} cy={31} r={1.35} fill={LINE} />
      <Circle cx={36.4} cy={31} r={1.35} fill={LINE} />
      <Path d="M28.4 37q3.6 3 7.2 0" fill="none" {...ink} strokeWidth={1.4} />
      <Circle cx={24.6} cy={35} r={2} fill="#EE9A8E" opacity={0.55} />
      <Circle cx={39.4} cy={35} r={2} fill="#EE9A8E" opacity={0.55} />
    </G>
  );
}

const LOOKS: Record<string, Look> = {
  "The Lantern Keeper": {
    skin: "#A9C79B",
    robe: FOREST,
    field: "#F9E6B0",
    back: <Path d="M14 40c0-18 7-27 18-27s18 9 18 27z" fill={FOREST} {...ink} />,
    front: (
      <G>
        <Path
          d="M20 24c2-8 7-10 12-10s10 2 12 10c-4-4-8-5-12-5s-8 1-12 5z"
          fill={FOREST}
          {...ink}
        />
        <Path d="M48 46v-5" {...ink} fill="none" />
        <Rect x={44.5} y={46} width={7} height={9} rx={1.5} fill={GOLD} {...ink} />
        <Path d="M45.5 46v-2h5v2" fill="none" {...ink} />
        <Circle cx={48} cy={50.5} r={1.6} fill="#FFF3C4" />
      </G>
    ),
  },
  "The Glass Cobbler": {
    skin: "#CDB8E0",
    robe: BROWN,
    field: "#E3EBD3",
    front: (
      <G>
        <Path d="M20 22c2-6 7-8 12-8s10 2 12 8z" fill={WOOD} {...ink} />
        <Path d="M18 23h28" {...ink} fill="none" strokeWidth={2.4} />
        <Circle
          cx={27.6}
          cy={31}
          r={3.6}
          fill="#DDF1EC"
          fillOpacity={0.55}
          {...ink}
          strokeWidth={1.3}
        />
        <Circle
          cx={36.4}
          cy={31}
          r={3.6}
          fill="#DDF1EC"
          fillOpacity={0.55}
          {...ink}
          strokeWidth={1.3}
        />
        <Path d="M31.2 31h1.6" {...ink} strokeWidth={1.3} fill="none" />
      </G>
    ),
  },
  "The Map Mender": {
    skin: "#A9B8C6",
    robe: TEAL,
    field: "#F5D9B8",
    back: (
      <Path
        d="M18 36c-2-14 4-22 14-22s16 8 14 22c-3-6-6-9-14-9s-11 3-14 9z"
        fill="#5C4A63"
        {...ink}
      />
    ),
    front: (
      <G>
        <Rect x={41} y={44} width={12} height={9} rx={1} fill={CREAM} {...ink} />
        <Path d="M45 44v9M49 44v9" {...ink} strokeWidth={1} fill="none" />
        <Path
          d="M43 48l2 1.5 2-2 2 2 2-1.5"
          fill="none"
          stroke={BROWN}
          strokeWidth={1.1}
          strokeLinecap="round"
        />
        <Path d="M42 24l-4 7" {...ink} strokeWidth={1.8} fill="none" />
      </G>
    ),
  },
  "The Star Baker": {
    skin: "#EDE6F0",
    robe: "#B0623F",
    field: "#F9E6B0",
    front: (
      <G>
        <Path
          d="M21 24c-6-1-7-9-2-11 0-6 8-8 11-4 3-4 10-3 11 2 5 1 6 9 0 11z"
          fill={CREAM}
          {...ink}
        />
        <Path d="M21 22h22v4H21z" fill={CREAM} {...ink} />
        <Star x={32} y={14} s={4.2} />
      </G>
    ),
  },
  "The Lighthouse Keeper": {
    skin: "#E8A86C",
    robe: "#44607A",
    field: "#DDF1EC",
    front: (
      <G>
        <Path d="M20 24c1-7 6-10 12-10s11 3 12 10z" fill="#44607A" {...ink} />
        <Path d="M18 25h28l-2 3H20z" fill={GOLD} {...ink} />
        <Circle cx={32} cy={19} r={2.2} fill={GOLD} {...ink} strokeWidth={1.2} />
        <Path d="M32 12v-4M26 13l-2-3M38 13l2-3" {...ink} strokeWidth={1.4} fill="none" />
      </G>
    ),
  },
  "The Paper Folder": {
    skin: "#AFD0E8",
    robe: PLUM,
    field: "#F4E1C9",
    front: (
      <G>
        <Path d="M20 24c2-6 7-8 12-8s10 2 12 8c-4-3-8-4-12-4s-8 1-12 4z" fill={PLUM} {...ink} />
        <Path d="M25 14l7 4 9-7-4 8z" fill={CREAM} {...ink} />
        <Path d="M32 18l5 1M25 14l7 6" {...ink} strokeWidth={1} fill="none" />
      </G>
    ),
  },
  "The Quiet Wanderer": {
    skin: "#A6D8C8",
    robe: "#6A7B4B",
    field: "#E8D8BE",
    front: (
      <G>
        <Path
          d="M10 25c6 2 12 3 22 3s16-1 22-3c-2-3-8-4-10-4-1-6-5-8-12-8s-11 2-12 8c-2 0-8 1-10 4z"
          fill={WOOD}
          {...ink}
        />
        <Path d="M22 22c6 1.500 14 1.500 20 0" {...ink} strokeWidth={1.4} fill="none" />
        <Path d="M42 20c4-1 7 0 9 3-4 0-7 0-9-3z" fill={LEAF} {...ink} strokeWidth={1.2} />
      </G>
    ),
  },
  "The Kite Rider": {
    skin: "#E8B4C8",
    robe: "#2F6E6A",
    field: "#DDF1EC",
    front: (
      <G>
        <Path d="M20 24c1-7 6-9 12-9s11 2 12 9z" fill="#7A5B3A" {...ink} />
        <Rect
          x={22}
          y={21}
          width={8}
          height={5}
          rx={2.5}
          fill="#DDF1EC"
          {...ink}
          strokeWidth={1.3}
        />
        <Rect
          x={34}
          y={21}
          width={8}
          height={5}
          rx={2.5}
          fill="#DDF1EC"
          {...ink}
          strokeWidth={1.3}
        />
        <Path d="M30 23.500h4" {...ink} strokeWidth={1.3} fill="none" />
        <Path d="M50 38l5 5-5 6-5-6z" fill={GOLD} {...ink} strokeWidth={1.3} />
        <Path d="M50 49q-2 3 1 5t-1 5" {...ink} strokeWidth={1.1} fill="none" />
      </G>
    ),
  },
  "The Bell Ringer": {
    skin: "#EDE6F0",
    robe: GOLD_DEEP,
    field: "#E3EBD3",
    front: (
      <G>
        <Path
          d="M20 24c-1-6 0-11-4-13 5-1 10 2 12 6 1-4 3-8 4-9 1 1 3 5 4 9 2-4 7-7 12-6-4 2-5 7-4 13z"
          fill={LEAF}
          {...ink}
        />
        <Circle cx={16} cy={11} r={2} fill={GOLD} {...ink} strokeWidth={1.1} />
        <Circle cx={48} cy={11} r={2} fill={GOLD} {...ink} strokeWidth={1.1} />
        <Circle cx={32} cy={8} r={2} fill={GOLD} {...ink} strokeWidth={1.1} />
        <Path d="M20 22h24" {...ink} strokeWidth={2} fill="none" />
      </G>
    ),
  },
  "The Tea Gardener": {
    skin: "#A9C79B",
    robe: "#B58A45",
    field: "#F9E6B0",
    front: (
      <G>
        {[
          "M20 22c-3-3-3-7 0-9 3 2 3 6 0 9z",
          "M26 18c-3-3-3-7 0-9 3 2 3 6 0 9z",
          "M32 16c-3-3-3-7 0-9 3 2 3 6 0 9z",
          "M38 18c-3-3-3-7 0-9 3 2 3 6 0 9z",
          "M44 22c-3-3-3-7 0-9 3 2 3 6 0 9z",
        ].map((d) => (
          <Path key={d} d={d} fill={LEAF} {...ink} strokeWidth={1.2} />
        ))}
        <Path d="M19 24c8-3 18-3 26 0" {...ink} strokeWidth={1.4} fill="none" />
        <Path d="M46 49h9l-1 6h-7z" fill={CREAM} {...ink} strokeWidth={1.3} />
        <Path d="M49 46q1-2 0-3M52 46q1-2 0-3" {...ink} strokeWidth={1} fill="none" />
      </G>
    ),
  },
  "The Moth Herald": {
    skin: "#CDB8E0",
    robe: "#4F5E8A",
    field: "#E8D8BE",
    back: (
      <G>
        <Path d="M22 28c-10-10-18-6-17 6 1 6 8 6 12 2z" fill="#E8D8BE" {...ink} />
        <Path d="M42 28c10-10 18-6 17 6-1 6-8 6-12 2z" fill="#E8D8BE" {...ink} />
        <Circle cx={12} cy={31} r={2} fill={GOLD} {...ink} strokeWidth={1} />
        <Circle cx={52} cy={31} r={2} fill={GOLD} {...ink} strokeWidth={1} />
      </G>
    ),
    front: (
      <G>
        <Path d="M27 20q-2-6-6-8M37 20q2-6 6-8" {...ink} fill="none" />
        <Circle cx={21} cy={12} r={1.6} fill={GOLD} {...ink} strokeWidth={1} />
        <Circle cx={43} cy={12} r={1.6} fill={GOLD} {...ink} strokeWidth={1} />
      </G>
    ),
  },
  "The River Weaver": {
    skin: "#A9B8C6",
    robe: TEAL,
    field: "#DDF1EC",
    back: (
      <Path
        d="M18 34c-3-14 3-21 14-21s17 7 14 21c1 10 2 18-2 22H20c-4-4-3-12-2-22z"
        fill="#3E6B73"
        {...ink}
      />
    ),
    front: (
      <G>
        <Path d="M18 56q4-3 8 0t8 0 8 0 8 0" {...ink} strokeWidth={1.3} fill="none" />
        <Path d="M20 22c5-4 19-4 24 0" {...ink} strokeWidth={1.8} fill="none" />
        <Path d="M24 20v-5M32 18v-6M40 20v-5" {...ink} strokeWidth={1.4} fill="none" />
      </G>
    ),
  },
  "The Clock Tinker": {
    skin: "#E8A86C",
    robe: "#6C6A5E",
    field: "#F4E1C9",
    front: (
      <G>
        <Path d="M22 22l1-9h18l1 9z" fill="#4A3F3A" {...ink} />
        <Path d="M19 23h26" {...ink} strokeWidth={2.4} fill="none" />
        <Circle cx={32} cy={17.5} r={3} fill={GOLD} {...ink} strokeWidth={1.2} />
        <Path
          d="M32 14.500v-1.500M32 21v-1.500M29 17.500h-1.500M36.500 17.500H35"
          {...ink}
          strokeWidth={1.2}
          fill="none"
        />
        <Circle
          cx={36.4}
          cy={31}
          r={4}
          fill="#DDF1EC"
          fillOpacity={0.5}
          {...ink}
          strokeWidth={1.2}
        />
        <Path d="M39 34q4 6 1 14" {...ink} strokeWidth={1} fill="none" />
      </G>
    ),
  },
  "The Moon Gardener": {
    skin: "#EDE6F0",
    robe: "#4B3F72",
    field: "#E8E3F2",
    front: (
      <G>
        <Path d="M22 22c2-6 6-7 10-7s8 1 10 7c-3-2-6-3-10-3s-7 1-10 3z" fill="#4B3F72" {...ink} />
        <Path
          d="M36 9a6.500 6.500 0 1 0 0 11 5.200 5.200 0 1 1 0-11z"
          fill={GOLD}
          {...ink}
          strokeWidth={1.3}
        />
        <Star x={44} y={14} s={2.6} />
        <Star x={21} y={13} s={2.2} />
        <Star x={24} y={40} s={1.4} fill={GOLD} />
        <Star x={40} y={41} s={1.4} fill={GOLD} />
      </G>
    ),
  },
  "The Arch Builder": {
    skin: "#E8B4C8",
    robe: "#8A6E55",
    field: "#F4E1C9",
    front: (
      <G>
        <Path d="M19 25v-4a13 13 0 0 1 26 0v4h-5v-4a8 8 0 0 0-16 0v4z" fill="#EBD5AF" {...ink} />
        <Path d="M32 8v5M23 11l3 4M41 11l-3 4" {...ink} strokeWidth={1} fill="none" />
        <Rect x={29.5} y={7} width={5} height={6} fill={GOLD} {...ink} strokeWidth={1.1} />
      </G>
    ),
  },
  "The Story Spinner": {
    skin: "#A6D8C8",
    robe: "#7A3B3B",
    field: "#F9E6B0",
    back: <Path d="M16 40c0-18 6-27 16-27s16 9 16 27z" fill="#7A3B3B" {...ink} />,
    front: (
      <G>
        <Path d="M20 24c2-7 6-9 12-9s10 2 12 9c-4-3-8-4-12-4s-8 1-12 4z" fill="#7A3B3B" {...ink} />
        <Path d="M47 18c6-5 8-11 8-12-6 1-10 5-12 10z" fill={CREAM} {...ink} strokeWidth={1.3} />
        <Path d="M43 21l8-12" {...ink} strokeWidth={1.1} fill="none" />
        <Rect x={42} y={46} width={11} height={8} rx={1} fill={CREAM} {...ink} strokeWidth={1.3} />
        <Path d="M47.500 46v8" {...ink} strokeWidth={1} fill="none" />
        <Star x={14} y={20} s={2.6} />
      </G>
    ),
  },
};

const FALLBACK: Look = { skin: "#D8C8B0", robe: FOREST, field: "#F4E1C9" };

/** "The Clock Tinker 2" -> "The Clock Tinker". Contests larger than the cast reuse portraits. */
export function baseCharacter(character: string): string {
  return character.replace(/\s\d+$/, "");
}

/**
 * A round portrait for a mask. `character` is the mask's character name; unknown names fall back
 * to their initials in serif, as VISUAL_DESIGN.md §5 asks.
 */
export function Portrait({ character, size = 56 }: { character: string; size?: number }) {
  const look = LOOKS[baseCharacter(character)];
  const clipId = `portrait${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const ring = { width: size, height: size, borderRadius: size / 2 };

  if (!look) {
    const initials = baseCharacter(character)
      .replace(/^The\s+/i, "")
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0] ?? "")
      .join("")
      .toUpperCase();
    return (
      <View
        style={[styles.ring, ring, { backgroundColor: FALLBACK.field }]}
        accessibilityElementsHidden
      >
        <Text style={[styles.initials, { fontSize: size * 0.36 }]}>{initials || "?"}</Text>
      </View>
    );
  }

  return (
    <View
      style={[styles.ring, ring, { backgroundColor: look.field }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Defs>
          <ClipPath id={clipId}>
            <Circle cx={32} cy={32} r={31} />
          </ClipPath>
        </Defs>
        <G clipPath={`url(#${clipId})`}>
          <Circle cx={32} cy={32} r={31} fill={look.field} />
          {look.back}
          <Path d="M6 66c1-14 10-20 26-20s25 6 26 20z" fill={look.robe} {...ink} />
          <Path d="M26 47q6 5 12 0" fill="none" {...ink} strokeWidth={1.3} />
          <Face skin={look.skin} />
          {look.front}
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    borderWidth: 2,
    borderColor: colors.line,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  initials: { fontFamily: fonts.smallCaps, color: colors.line },
});
