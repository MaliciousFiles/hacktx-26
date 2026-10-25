// Hand-drawn storybook art, ported from the "Choosing Deck" mockup.
// Shapes are cut-paper "stickers": a soft drop, a cream rim, then the inked shape.
// Anything that moves lives in its own <Layer> so Animated can drive it natively.
import { useId, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Pattern,
  Rect,
  Stop,
} from "react-native-svg";
import { Idle } from "@/components/motion";
import { colors } from "@/theme";

export const ink = {
  line: colors.line,
  rim: colors.cream,
  drop: "#8E4A3E",
  sketch: "#DCA088",
  ground: "#E8BB9C",
  tick: "#C98D72",
  roof: "#C8644E",
  wall: "#F8E9CF",
  door: "#9A6248",
  glass: "#BFE0D6",
  gold: colors.gold,
  amber: "#E2AE5E",
  leaf: "#8DB98A",
  leafDark: "#5E8E5E",
  teal: "#6FA591",
  skin: "#F3D3B2",
  brick: "#D97A60",
  wood: "#C79A5E",
  stone: "#EBD5AF",
};

function useSvgId(prefix: string): string {
  return `${prefix}${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
}

export function circle(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
}

type Shape = {
  d: string;
  fill?: string;
  /** Stroke width of the inked line. */
  sw?: number;
  stroke?: string;
  /** Interior detail: inked only, no rim or drop. */
  detail?: boolean;
};

/** Cut-paper shapes with a cream rim and a soft drop beneath. */
export function Sticker({ shapes, rim = 2.4 }: { shapes: Shape[]; rim?: number }) {
  const outline = shapes.filter((shape) => !shape.detail);
  const pad = rim * 2;
  return (
    <G strokeLinejoin="round" strokeLinecap="round">
      <G transform="translate(0 2.2)" opacity={0.28}>
        {outline.map((shape, index) => (
          <Path
            key={index}
            d={shape.d}
            fill={shape.fill === "none" ? "none" : ink.drop}
            stroke={ink.drop}
            strokeWidth={(shape.sw ?? 2.2) + pad}
          />
        ))}
      </G>
      {outline.map((shape, index) => (
        <Path
          key={index}
          d={shape.d}
          fill={shape.fill === "none" ? "none" : ink.rim}
          stroke={ink.rim}
          strokeWidth={(shape.sw ?? 2.2) + pad}
        />
      ))}
      {shapes.map((shape, index) => (
        <Path
          key={index}
          d={shape.d}
          fill={shape.fill ?? "none"}
          stroke={shape.stroke ?? ink.line}
          strokeWidth={shape.sw ?? 2.2}
        />
      ))}
    </G>
  );
}

// ---------- Icons ----------

type IconDef = { vb: string; paths: string[]; fillable?: boolean };

const ICONS = {
  back: { vb: "0 0 32 32", paths: ["M11 8l-6 6 6 6", "M5 14h14a7 7 0 0 1 0 14h-5"] },
  skip: {
    vb: "0 0 32 32",
    paths: ["M6 26C10 14 18 6 27 5c-1 9-9 17-21 21z", "M6 26l9-9M14 13h6M18 9h5"],
  },
  star: {
    vb: "0 0 24 24",
    paths: ["M12 3.2l2.6 5.4 5.9.8-4.3 4.1 1.1 5.8L12 16.5l-5.3 2.8 1.1-5.8L3.5 9.4l5.9-.8z"],
    fillable: true,
  },
  arrow: { vb: "0 0 24 24", paths: ["M5 12h13M13 6.5l5.5 5.5-5.5 5.5"] },
  swap: { vb: "0 0 24 24", paths: ["M7 7h11l-3-3M17 17H6l3 3"] },
  check: { vb: "0 0 24 24", paths: ["M5 12.5l4.5 4.5L19 7.5"] },
  chevron: { vb: "0 0 24 24", paths: ["M9 5.5l6.5 6.5L9 18.5"] },
  house: { vb: "0 0 24 24", paths: ["M3.5 11L12 4l8.5 7v9h-17z", "M9.5 20v-5h5v5"] },
  bus: {
    vb: "0 0 24 24",
    paths: [
      "M5.5 3.5h13a2 2 0 0 1 2 2v11h-17v-11a2 2 0 0 1 2-2z",
      "M3.5 11h17",
      "M7 16.5v3M17 16.5v3",
      "M7 13.8h1M16 13.8h1",
    ],
  },
  coins: {
    vb: "0 0 24 24",
    paths: [
      "M3.5 7c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3z",
      "M3.5 7v4c0 1.7 3.1 3 7 3M17.5 7v2.5",
      "M3.5 11v4c0 1.7 3.1 3 7 3",
      circle(17, 15.5, 4.5),
    ],
  },
  scale: {
    vb: "0 0 24 24",
    paths: [
      "M12 4v16M7.5 20h9",
      "M4.5 7h15",
      "M4.5 7l-3 6.5a3 3 0 0 0 6 0zM19.5 7l-3 6.5a3 3 0 0 0 6 0z",
    ],
  },
  gavel: {
    vb: "0 0 24 24",
    paths: ["M12.5 3.5l-5 5 6 6 5-5z", "M10 6l6 6", "M10.5 11.5L3.5 18.5l2 2 7-7", "M14 21h7"],
  },
  book: {
    vb: "0 0 24 24",
    paths: [
      "M12 6.5c-2-1.6-5-2-8.5-1.5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5c-3.5-.5-6.5-.1-8.5 1.5z",
      "M12 6.5v13",
    ],
  },
  scroll: {
    vb: "0 0 24 24",
    paths: [
      "M7 3.5h11a2 2 0 0 1 2 2V7h-4",
      "M16 7v11a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-1h10v1a3 3 0 0 0 3 3",
      "M7 3.5a2 2 0 0 0-2 2V17",
      "M8.5 9h4M8.5 12.5h4",
    ],
  },
  mask: {
    vb: "0 0 24 24",
    paths: [
      "M2.5 8c3-1.6 6.3-1.6 9.5 0 3.2-1.6 6.5-1.6 9.5 0 0 5.2-2.6 9-5.6 9-1.8 0-2.6-1.6-3.9-1.6S9.9 17 8.1 17c-3 0-5.6-3.8-5.6-9z",
      "M6 10.8q1.6-1.3 3.2 0M14.8 10.8q1.6-1.3 3.2 0",
    ],
  },
  envelope: { vb: "0 0 24 24", paths: ["M3.5 6h17v12h-17z", "M3.5 6.5l8.5 7 8.5-7"] },
  lock: {
    vb: "0 0 24 24",
    paths: ["M5.5 11h13v9.5h-13z", "M8.5 11V8a3.5 3.5 0 0 1 7 0v3", "M12 14.5v2.5"],
  },
  calendar: { vb: "0 0 24 24", paths: ["M4 5.5h16V20H4z", "M4 9.5h16", "M8 3v4.5M16 3v4.5"] },
  sparkle: {
    vb: "0 0 24 24",
    paths: ["M12 2.5l2.1 6.4 6.4 2.1-6.4 2.1L12 19.5l-2.1-6.4L3.5 11l6.4-2.1z"],
    fillable: true,
  },
  info: { vb: "0 0 24 24", paths: [circle(12, 12, 8.5), "M12 11v5.5", "M12 7.6v.4"] },
} satisfies Record<string, IconDef>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 20,
  color = ink.line,
  strokeWidth = 2,
  fill,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  fill?: string;
}) {
  const icon: IconDef = ICONS[name];
  return (
    <Svg width={size} height={size} viewBox={icon.vb}>
      {icon.paths.map((d) => (
        <Path
          key={d}
          d={d}
          fill={icon.fillable && fill ? fill : "none"}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}

// ---------- Frame pieces ----------

export function Corner({ flip = false, style }: { flip?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View pointerEvents="none" style={[style, flip && { transform: [{ scaleX: -1 }] }]}>
      <Svg width={34} height={34} viewBox="0 0 34 34">
        <Path d="M3 31V3h28" fill="none" stroke={ink.line} strokeWidth={7} strokeLinejoin="round" />
        <Path d="M3 31V3h28" fill="none" stroke="#D6A445" strokeWidth={4} strokeLinejoin="round" />
        <Path d={circle(9, 9, 1.6)} fill={ink.line} />
      </Svg>
    </View>
  );
}

export function RibbonArt() {
  return (
    <Svg width={44} height={60} viewBox="0 0 42 58">
      <Path
        d="M2 0h38v56l-19-11L2 56z"
        fill={colors.rose}
        stroke={ink.line}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path
        d="M7 0v44l14-8 14 8V0"
        fill="none"
        stroke="#E7737B"
        strokeWidth={1.2}
        strokeDasharray="2 3"
      />
      <Path
        d="M12 16c3-2 6-2 9 0v14c-3-2-6-2-9 0zM30 16c-3-2-6-2-9 0v14c3-2 6-2 9 0z"
        fill={ink.rim}
        stroke={ink.line}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Dotted ink rule; stretches to its container. */
export function DottedRule({ color = "rgba(122,59,59,0.5)" }: { color?: string }) {
  return (
    <Svg width="100%" height={4}>
      <Line
        x1={1}
        y1={2}
        x2="100%"
        y2={2}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray="0.01 5"
      />
    </Svg>
  );
}

/** Vine flourish with a gold star at its heart. */
export function Flourish({ width = 120 }: { width?: number }) {
  return (
    <Svg width={width} height={18} viewBox="0 0 120 18">
      <G fill="none" stroke={ink.line} strokeWidth={1.6} strokeLinecap="round">
        <Path d="M50 9C40 9 36 3 28 4s-8 9-1 9 5-6 0-6M70 9c10 0 14-6 22-5s8 9 1 9-5-6 0-6" />
        <Path d="M4 9h18M98 9h18" strokeDasharray="0.01 4.5" strokeWidth={2} />
      </G>
      <Path
        d="M60 2.5l1.9 4.6 4.6 1.9-4.6 1.9L60 15.5l-1.9-4.6L53.5 9l4.6-1.9z"
        fill={ink.gold}
        stroke={ink.line}
        strokeWidth={1.3}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Tiny printed-dot paper texture, fills its parent. */
export function PaperDots({
  color = "rgba(196,110,88,0.20)",
  gap = 7,
}: {
  color?: string;
  gap?: number;
}) {
  const id = useSvgId("dots");
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Pattern id={id} width={gap} height={gap} patternUnits="userSpaceOnUse">
          <Circle cx={gap / 2} cy={gap / 2} r={1.1} fill={color} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

/** Vertical fade, used to soften content as it scrolls under bars. */
export function Fade({
  color,
  to = "down",
  style,
}: {
  color: string;
  to?: "down" | "up";
  style?: StyleProp<ViewStyle>;
}) {
  const id = useSvgId("fade");
  return (
    <View pointerEvents="none" style={style}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={to === "down" ? 1 : 0} />
            <Stop offset="0.55" stopColor={color} stopOpacity={to === "down" ? 0.92 : 0.35} />
            <Stop offset="1" stopColor={color} stopOpacity={to === "down" ? 0 : 1} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

// ---------- Characters ----------

export function GodmotherArt({ size = 58 }: { size?: number }) {
  return (
    <Svg width={size} height={(size * 56) / 58} viewBox="0 0 58 56">
      <Sticker
        rim={2}
        shapes={[
          {
            d: "M12 30c-6-4-4-14 3-15 0-9 10-13 16-8 6-6 17-2 16 7 7 1 9 11 3 16z",
            fill: "#F4F0F6",
            sw: 2,
          },
          {
            d: "M16 32c0-10 6-15 13-15s13 5 13 15c0 9-6 16-13 16s-13-7-13-16z",
            fill: ink.skin,
            sw: 2,
          },
          {
            d: "M14 30c2-8 8-11 15-11 6 0 12 3 15 11-5-4-10-6-15-6-6 0-11 2-15 6z",
            fill: "#F4F0F6",
            sw: 2,
          },
          { d: "M18 54c2-6 6-8 11-8s9 2 11 8z", fill: ink.teal, sw: 2 },
          { d: "M22 33q2.5 2 5 0M31 33q2.5 2 5 0", sw: 1.7, detail: true },
          { d: "M25 41q4 3 8 0", sw: 1.7, detail: true },
        ]}
      />
      <Circle cx={21} cy={38} r={2.6} fill="#EE9A8E" opacity={0.7} />
      <Circle cx={37} cy={38} r={2.6} fill="#EE9A8E" opacity={0.7} />
    </Svg>
  );
}

export function SparkleArt({ size = 16 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16">
      <Path
        d="M8 1l2 4.5 4.5 2-4.5 2-2 4.5-2-4.5-4.5-2 4.5-2z"
        fill={ink.gold}
        stroke={ink.line}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** The Fairy Godmother, bobbing, with a twinkle over her head. */
export function Godmother({ size = 58 }: { size?: number }) {
  const star = Math.round(size * 0.3);
  return (
    <View style={{ width: size, height: size }} aria-hidden>
      <Idle kind="bob" style={{ position: "absolute", left: 0, bottom: 0 }}>
        <GodmotherArt size={size} />
      </Idle>
      <Idle
        kind="twinkle"
        origin="50% 50%"
        style={{ position: "absolute", top: -star * 0.35, left: size / 2 - star / 2 }}
      >
        <SparkleArt size={star} />
      </Idle>
    </View>
  );
}

// ---------- Scenes ----------

type Box = [x: number, y: number, w: number, h: number];

/** A positioned slice of a scene, in the scene's own coordinates. */
function Layer({
  scene,
  box,
  children,
  motion,
  origin,
  delay,
  duration,
}: {
  scene: [number, number];
  box: Box;
  children: ReactNode;
  motion?: "bob" | "float" | "sway" | "drift" | "twinkle" | "spin";
  origin?: string;
  delay?: number;
  duration?: number;
}) {
  const [W, H] = scene;
  const [x, y, w, h] = box;
  const style: ViewStyle = {
    position: "absolute",
    left: `${(x / W) * 100}%`,
    top: `${(y / H) * 100}%`,
    width: `${(w / W) * 100}%`,
    height: `${(h / H) * 100}%`,
  };
  const art = (
    <Svg width="100%" height="100%" viewBox={`${x} ${y} ${w} ${h}`}>
      {children}
    </Svg>
  );
  if (!motion) {
    return (
      <View pointerEvents="none" style={style}>
        {art}
      </View>
    );
  }
  return (
    <Idle kind={motion} origin={origin} delay={delay} duration={duration} style={style}>
      {art}
    </Idle>
  );
}

function Scene({
  size,
  children,
  style,
}: {
  size: [number, number];
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width: "100%", aspectRatio: size[0] / size[1] }, style]}
    >
      {children}
    </View>
  );
}

function Ground({ W, y, ticks }: { W: number; y: number; ticks: number[] }) {
  return (
    <G>
      <Rect x={0} y={y} width={W} height={40} fill={ink.ground} />
      <Path d={`M0 ${y}h${W}`} stroke={ink.line} strokeWidth={1.6} />
      <Path
        d={ticks.map((x, index) => `M${x} ${y + 8 + (index % 2) * 2}l3-3`).join("")}
        stroke={ink.tick}
        strokeWidth={1.4}
        strokeLinecap="round"
      />
    </G>
  );
}

function Cloud({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <Path
      d={`M${x} ${y}q${7 * s}-${9 * s} ${16 * s}-${3 * s} ${9 * s}-${7 * s} ${17 * s} ${3 * s}`}
      fill="none"
      stroke={ink.sketch}
      strokeWidth={1.5}
      strokeLinecap="round"
    />
  );
}

function Sun({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const rays = Array.from({ length: 8 }, (_, index) => {
    const angle = (index * Math.PI) / 4;
    const a = r + 4;
    const b = r + 9;
    return `M${cx + Math.cos(angle) * a} ${cy + Math.sin(angle) * a}L${cx + Math.cos(angle) * b} ${cy + Math.sin(angle) * b}`;
  }).join("");
  return (
    <G fill="none" stroke={ink.sketch} strokeWidth={1.5} strokeLinecap="round">
      <Path d={circle(cx, cy, r)} />
      <Path d={rays} />
    </G>
  );
}

function Cottage({ dx = 0, dy = 0, lit = false }: { dx?: number; dy?: number; lit?: boolean }) {
  const window = lit ? ink.gold : ink.glass;
  return (
    <G transform={`translate(${dx} ${dy})`}>
      <Sticker
        shapes={[
          { d: "M94 92V78h9v19z", fill: ink.roof },
          { d: "M44 150v-46h62v46z", fill: ink.wall },
          { d: "M36 108l39-34 39 34z", fill: ink.roof },
          { d: "M52 98h46M62 89h26", stroke: "#A84E3C", sw: 1.2, detail: true },
          { d: "M66 150v-22a9 9 0 0 1 18 0v22z", fill: ink.door },
          { d: "M50 113h13v13H50zM88 113h13v13H88z", fill: window },
          { d: "M50 119.5h13M56.5 113v13M88 119.5h13M94.5 113v13", sw: 1, detail: true },
        ]}
      />
    </G>
  );
}

function Tree({ x, ground, r = 14 }: { x: number; ground: number; r?: number }) {
  return (
    <Sticker
      shapes={[
        { d: `M${x} ${ground}v-${r + 4}`, sw: 3.4 },
        { d: circle(x, ground - r * 1.9, r), fill: ink.leaf },
        {
          d: `M${x - 6} ${ground - r * 2.1}l3 3 3-3M${x + 2} ${ground - r * 1.6}l3 3 3-3`,
          stroke: ink.leafDark,
          sw: 1.3,
          detail: true,
        },
      ]}
    />
  );
}

/** Home page plate: a little town with its courthouse and ballot box. */
export function HeroScene() {
  const S: [number, number] = [340, 160];
  const ground = 132;
  return (
    <Scene size={S}>
      <Layer scene={S} box={[0, 0, 340, 160]}>
        <Path
          d="M0 118q46-30 96-12t104-8 140 6"
          fill="none"
          stroke={ink.sketch}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
        <Path d="M214 132v-20l11-9 11 9v20" fill="none" stroke={ink.sketch} strokeWidth={1.5} />
        <Ground W={340} y={ground} ticks={[16, 58, 110, 214, 252, 318]} />
      </Layer>
      <Layer scene={S} box={[262, 4, 56, 56]} motion="spin" origin="50% 50%">
        <Sun cx={290} cy={32} r={11} />
      </Layer>
      <Layer scene={S} box={[92, 14, 120, 30]} motion="drift">
        <Cloud x={96} y={34} />
        <Cloud x={176} y={24} s={0.8} />
      </Layer>
      <Layer scene={S} box={[108, 40, 40, 16]} motion="float" delay={600}>
        <Path
          d="M112 50q4-4 8 0 4-4 8 0M130 46q3-3 6 0 3-3 6 0"
          fill="none"
          stroke={ink.line}
          strokeWidth={1.4}
          strokeLinecap="round"
        />
      </Layer>
      <Layer scene={S} box={[0, 40, 130, 100]}>
        <Cottage dx={-8} dy={-18} />
      </Layer>
      <Layer scene={S} box={[150, 30, 34, 30]} motion="sway" origin="10% 100%">
        <Sticker
          shapes={[
            { d: "M168 58V38", sw: 2 },
            { d: "M168 38h13l-3.5 4 3.5 4h-13z", fill: ink.gold, sw: 1.8 },
          ]}
        />
      </Layer>
      <Layer scene={S} box={[118, 50, 104, 90]}>
        <Sticker
          shapes={[
            { d: "M152 76a16 16 0 0 1 32 0z", fill: ink.amber },
            { d: "M150 78h36v6h-36z", fill: ink.stone },
            { d: "M138 128v-36h60v36z", fill: ink.wall },
            { d: "M132 93l36-12 36 12z", fill: ink.roof },
            { d: "M146 97v27M156 97v27M180 97v27M190 97v27", sw: 1.6, detail: true },
            { d: "M162 128v-14a6 6 0 0 1 12 0v14z", fill: ink.door },
            { d: "M128 132v-5h80v5z", fill: ink.stone },
          ]}
        />
      </Layer>
      <Layer scene={S} box={[226, 74, 70, 64]}>
        <Sticker
          shapes={[
            { d: "M234 132v-30h46v30z", fill: ink.brick },
            { d: "M230 102l4-7h46l4 7z", fill: ink.wood },
            { d: "M248 98.5h18", sw: 2.6 },
            { d: "M252 112l5 5 5-5 5 5", stroke: "#9E4A38", sw: 1.3, detail: true },
            { d: "M240 124h34", stroke: "#9E4A38", sw: 1.3, detail: true },
          ]}
        />
      </Layer>
      <Layer scene={S} box={[246, 60, 22, 34]} motion="float" delay={300}>
        <Sticker
          rim={2}
          shapes={[
            { d: "M251 68h12v20h-12z", fill: ink.rim, sw: 1.8 },
            { d: "M254 73h6M254 77h6M254 81h4", stroke: ink.door, sw: 1.1, detail: true },
          ]}
        />
      </Layer>
      <Layer scene={S} box={[284, 86, 44, 50]} motion="sway" origin="50% 100%" duration={5200}>
        <Tree x={306} ground={ground} r={13} />
      </Layer>
      <Layer scene={S} box={[34, 4, 52, 50]} motion="bob">
        <G transform="translate(34 4) scale(0.86)">
          <Sticker
            rim={2}
            shapes={[
              {
                d: "M12 30c-6-4-4-14 3-15 0-9 10-13 16-8 6-6 17-2 16 7 7 1 9 11 3 16z",
                fill: "#F4F0F6",
                sw: 2,
              },
              {
                d: "M16 32c0-10 6-15 13-15s13 5 13 15c0 9-6 16-13 16s-13-7-13-16z",
                fill: ink.skin,
                sw: 2,
              },
              {
                d: "M14 30c2-8 8-11 15-11 6 0 12 3 15 11-5-4-10-6-15-6-6 0-11 2-15 6z",
                fill: "#F4F0F6",
                sw: 2,
              },
              { d: "M18 54c2-6 6-8 11-8s9 2 11 8z", fill: ink.teal, sw: 2 },
              { d: "M44 44l12-14", sw: 2 },
              { d: "M22 33q2.5 2 5 0M31 33q2.5 2 5 0M25 41q4 3 8 0", sw: 1.7, detail: true },
            ]}
          />
        </G>
      </Layer>
      <Layer scene={S} box={[78, 14, 14, 14]} motion="twinkle" origin="50% 50%">
        <Path
          d="M85 15l1.6 4.2 4.2 1.6-4.2 1.6L85 26.6l-1.6-4.2-4.2-1.6 4.2-1.6z"
          fill={ink.gold}
          stroke={ink.line}
          strokeWidth={1.2}
          strokeLinejoin="round"
        />
      </Layer>
      <Layer scene={S} box={[92, 28, 10, 10]} motion="twinkle" origin="50% 50%" delay={700}>
        <Path
          d="M97 29l1 2.8 2.8 1-2.8 1-1 2.8-1-2.8-2.8-1 2.8-1z"
          fill={ink.gold}
          stroke={ink.line}
          strokeWidth={1}
          strokeLinejoin="round"
        />
      </Layer>
    </Scene>
  );
}

/** Art band for a deck page. Assigned by position, never by option, so it carries no meaning. */
export function PageScene({ time }: { time: "day" | "dusk" }) {
  const S: [number, number] = [322, 104];
  const ground = 88;
  if (time === "day") {
    return (
      <Scene size={S}>
        <Layer scene={S} box={[150, 2, 40, 40]} motion="spin" origin="50% 50%">
          <Sun cx={170} cy={22} r={9} />
        </Layer>
        <Layer scene={S} box={[60, 10, 200, 24]} motion="drift">
          <Cloud x={70} y={30} />
          <Cloud x={212} y={20} s={0.8} />
        </Layer>
        <Layer scene={S} box={[0, 0, 322, 104]}>
          <Ground W={322} y={ground} ticks={[18, 60, 186, 228, 290]} />
        </Layer>
        <Layer scene={S} box={[20, 8, 110, 86]}>
          <Cottage dx={-6} dy={-62} />
        </Layer>
        <Layer scene={S} box={[200, 34, 60, 56]} motion="sway" origin="50% 100%" duration={5000}>
          <Tree x={228} ground={ground} r={13} />
        </Layer>
        <Layer
          scene={S}
          box={[256, 46, 50, 44]}
          motion="sway"
          origin="50% 100%"
          duration={4400}
          delay={900}
        >
          <Tree x={280} ground={ground} r={10} />
        </Layer>
        <Layer scene={S} box={[132, 30, 30, 14]} motion="float">
          <Path
            d="M136 40q4-4 8 0 4-4 8 0"
            fill="none"
            stroke={ink.line}
            strokeWidth={1.4}
            strokeLinecap="round"
          />
        </Layer>
      </Scene>
    );
  }
  return (
    <Scene size={S}>
      <Layer scene={S} box={[134, 4, 40, 40]} motion="float">
        <Sticker
          rim={2}
          shapes={[{ d: "M160 10a14 14 0 1 0 8 24 11 11 0 1 1-8-24z", fill: ink.gold, sw: 1.8 }]}
        />
      </Layer>
      {[
        [40, 16, 0],
        [120, 10, 500],
        [178, 26, 1000],
        [292, 18, 300],
      ].map(([x, y, delay]) => (
        <Layer
          key={x}
          scene={S}
          box={[x - 6, y - 6, 12, 12]}
          motion="twinkle"
          origin="50% 50%"
          delay={delay}
        >
          <Path
            d={`M${x} ${y - 5}l1.4 3.6 3.6 1.4-3.6 1.4L${x} ${y + 5}l-1.4-3.6-3.6-1.4 3.6-1.4z`}
            fill={ink.gold}
            stroke={ink.line}
            strokeWidth={1}
            strokeLinejoin="round"
          />
        </Layer>
      ))}
      <Layer scene={S} box={[0, 0, 322, 104]}>
        <Path
          d="M0 76q50-18 110-6t110-4 102 2"
          fill="none"
          stroke={ink.sketch}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
        <Ground W={322} y={ground} ticks={[30, 96, 206, 250, 300]} />
      </Layer>
      <Layer scene={S} box={[8, 46, 160, 44]} motion="sway" origin="50% 100%" duration={6000}>
        <Sticker
          shapes={[
            {
              d: "M14 88v-14a12 12 0 0 1 19-9 13 13 0 0 1 24-6 13 13 0 0 1 25 1 13 13 0 0 1 24 3 12 12 0 0 1 18 8 10 10 0 0 1 16 9v8z",
              fill: ink.leaf,
            },
            {
              d: "M32 74l3 3 3-3M60 66l3 3 3-3M90 64l3 3 3-3M118 70l3 3 3-3",
              stroke: ink.leafDark,
              sw: 1.3,
              detail: true,
            },
          ]}
        />
      </Layer>
      <Layer scene={S} box={[180, 8, 90, 86]}>
        <Cottage dx={150} dy={-62} lit />
      </Layer>
      <Layer scene={S} box={[296, 40, 22, 52]}>
        <Sticker
          shapes={[
            { d: "M306 88V54", sw: 3 },
            { d: "M300 46h12l-2 8h-8z", fill: ink.gold, sw: 1.8 },
            { d: "M298 46h16", sw: 2 },
          ]}
        />
      </Layer>
      <Layer
        scene={S}
        box={[162, 48, 12, 12]}
        motion="twinkle"
        origin="50% 50%"
        delay={400}
        duration={2400}
      >
        <Circle cx={168} cy={54} r={2.4} fill={ink.gold} stroke={ink.line} strokeWidth={1} />
      </Layer>
    </Scene>
  );
}
