# 🧚 Fairy Tale Ballot — Visual Design System

> Tokens, type, components, motion and art direction for `apps/mobile` and `apps/web`.
> Screen structure is in [`UX.md`](./UX.md). **Status:** proposed. Swap values freely, but keep the rules.

---

## 1. Art direction

**"Storybook at midnight."** A parchment-and-ink storybook lit by a violet-and-gold glow. It should feel whimsical where it narrates (the Godmother, masks, the reveal) and sober and readable where it shows evidence.

- **Narration layer:** illustrated, rounded, with soft gradients and sparkles. Used by the Godmother, onboarding, the Unmasking, the share card and empty states.
- **Evidence layer:** flat parchment cards, generous line height, no decoration inside quotes or numbers. Evidence never sits on a gradient.
- **Never:** flags, elephants, donkeys, red-vs-blue pairs, ballot-box clip art with check marks, or anything that suggests a "correct" answer.

---

## 2. Color

Define these as tokens in one theme module (`apps/mobile/src/theme/tokens.ts`, mirrored in `apps/web/src/theme.css` as CSS variables). Components never use hex literals.

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#FBF6EC` parchment | `#15122B` midnight | App background |
| `surface` | `#FFFFFF` | `#1F1B3A` | Cards |
| `surfaceSunken` | `#F3ECDD` | `#100E22` | Verbatim ballot text, quote blocks |
| `ink` | `#1F1B3A` | `#F4EFFF` | Primary text |
| `inkMuted` | `#5B5675` | `#B9B2D6` | Secondary text, captions |
| `line` | `#E4DAC6` | `#2E2950` | Dividers, pole lines |
| `primary` | `#6B4FD8` godmother violet | `#A08BFF` | Primary buttons, focus ring, user's ◆ marker |
| `onPrimary` | `#FFFFFF` | `#15122B` | Text on primary |
| `accent` | `#E0A526` gold | `#F2C14E` | Stars ⭐, sparkles, reveal highlights |
| `documented` | `#1E7F78` teal | `#4FC3B8` | ✅ Documented, "Funded", evidence present |
| `notStated` | `#B8433A` brick | `#FF8A7A` | **"Not stated"** pills, 🚩 flags (always with icon + text) |
| `caution` | `#A86A00` amber | `#FFB547` | ⚠️ Needs others to act, thin evidence |
| `unknown` | `#7A7590` | `#8E88A8` | ❓ Disputed/unknown, no evidence, "not applicable" |
| `demoBanner` | `#FFE9A8` | `#4A3B00` | Synthetic-data banner |

**Rules**
- **No party colors.** Candidate dots on pole lines and Compare columns use a **neutral categorical set** in an order assigned by mask: `#6B4FD8` violet, `#1E7F78` teal, `#C27C0E` ochre, `#8A4F7D` plum, `#3D6B99` slate. Red and blue never appear together as two candidates. After the reveal, party labels are text only and are **never colored by party**.
- `notStated` red is reserved for missing plan slots and 🚩 flags (PLAN §2). It is never used for a candidate, a pole or an alignment bucket.
- **Buckets** use a single-hue violet ramp that goes from strong to faint. That way none of them looks like "good" or "bad", and it matches the collapsed, secondary role buckets have:
  ✨ `#6B4FD8` (white text) · 🤝 `#8C76E2` · 🧭 `#AE9FEC` · 🌙 `#CFC6F5` (ink text on these three) · 🪞 Clouded: `unknown` grey with a dashed border.
- Every text-on-color pairing must reach 4.5:1 contrast. Check both themes.

---

## 3. Typography

| Role | Font | Size / line height (pt) | Weight |
|---|---|---|---|
| Display (titles, reveal names) | **Fraunces** (storybook serif) | 32/38 | 600 |
| Heading 1 | Fraunces | 24/30 | 600 |
| Heading 2 | Atkinson Hyperlegible | 18/24 | 700 |
| Body | **Atkinson Hyperlegible** (built for low vision) | 16/24 | 400 |
| Quote / ballot text | Atkinson Hyperlegible | 16/26 | 400, in a `surfaceSunken` block with a 3pt `line` left rule |
| Caption / chip | Atkinson Hyperlegible | 13/18 | 700 |
| Numbers (money, %) | Atkinson Hyperlegible, tabular figures | inherit | 700 |

- Both fonts are free on Google Fonts. Mobile loads them via `@expo-google-fonts/*` and `expo-font`, installed with `npx expo install`. Web loads them from Google Fonts.
- All sizes scale with the OS text size. Never use a fixed `maxFontSizeMultiplier` below 2 on evidence text.
- Never put quotes in italics; italics are hard to read at length. Use quotation marks plus the sunken block instead.

---

## 4. Spacing, shape, elevation

- **Spacing scale:** 4 · 8 · 12 · 16 · 24 · 32 · 48. Screen side gutter is 16; the gap between cards is 12.
- **Radius:** chips 999, buttons 14, cards 20, sheets 28 (top corners).
- **Elevation:** a single soft shadow (`0 4 16 rgba(31,27,58,0.08)`) on cards. Dark mode uses a 1pt `line` border instead of a shadow.
- **Max content width** on tablets and web: 640 for reading screens and 960 for Compare.

---

## 5. Masks (the cast)

Mask art is a **bundled local asset**, never fetched, so a URL can't correlate with a candidate (Inv. 7, 8). `Mask.imageUrl` holds the local asset key.

Rules:
- Protagonists only, and nothing villain-coded.
- No gender, race or age cues that could read as describing the candidate behind the mask.
- Each mask is one object or creature in a neutral palette.
- At least 16 masks, so a contest with many candidates never repeats one.

Proposed starter cast (title · motif):

| | | | |
|---|---|---|---|
| The Lantern Keeper · lantern | The Glass Cobbler · slipper | The Map Mender · scroll | The Star Baker · star loaf |
| The Lighthouse Owl · owl | The Paper Dragon · origami dragon | The Quiet Giant · mountain | The Kite Rider · kite |
| The Bell Ringer · bell | The Tea Gardener · teapot | The Moth Knight · moth | The River Weaver · loom |
| The Clockwork Fox · fox | The Moon Gardener · crescent | The Bridge Builder · arch | The Story Spinner · spindle |

> "The Bridge Builder" overlaps with the Bipartisanship label "Bridge-builder". Rename it if design (b) ships.

**Mask tile:** a circle of 56pt (mini card) or 120pt (candidate header). Its background is the candidate's categorical color at 15% opacity, with the motif illustration in ink.

---

## 6. Components

Build these once in `apps/mobile/src/components/`. Each component is described by its props and states.

| Component | Purpose | Key states / notes |
|---|---|---|
| `Button` | primary / secondary / ghost | pressed, disabled, loading; min 44pt |
| `Chip` | coverage, source type, tier, status | icon + text always |
| `CitationChip` | superscript-style `[1]` → opens `CitationSheet` | locked icon pre-reveal |
| `CitationSheet` | excerpt, Verbatim/Excerpt label, outlet, date, link-after-reveal, report | — |
| `CitedText` | renders a `CitedSentence[]` with chips | drops nothing; pipeline already validated |
| `SwipeCard` | wraps pole/tradeoff/judicial content; gesture + buttons | fling, snap-back, reduce-motion |
| `PoleLine` | horizontal axis with neutral pole labels; candidate dots, user ◆, "no evidence" hollow ring | used in Compare, Says vs. Does, Judicial |
| `SlotRow` | one Plan Explorer slot | documented / **Not stated** (red pill) / not applicable (grey + reason) |
| `FlagBadge` | 🚩 ⚠️ 💸 ✅ with count | tap → evidence |
| `RangeBar` | money ranges; min–max band, exact = tick | separate bars for direct vs outside, never stacked |
| `ClarityMeter` | 5-segment meter + "Compared on N issues" | — |
| `BucketChip` | only inside the collapsed alignment section | Clouded = dashed |
| `ContextBrief` | four labelled groups + system notes | equal visual weight for supporters/opponents |
| `MaskAvatar` | mask art + title | post-reveal: crossfades to photo/name |
| `ObjectiveInfoNotice` | explains why no comparison | — |
| `GodmotherBubble` | mascot + one-line speech bubble | narration layer only |
| `DemoBanner` | sticky synthetic-data banner | — |

**Supporter/opponent symmetry:** the two groups always render with the same width, the same style and the same per-side cap (Inv. 17). Supporters is always shown first. That order is fixed, not randomized, and it is never visually emphasized.

---

## 7. Motion

| Moment | Motion | Reduce Motion |
|---|---|---|
| Card swipe | Follows the finger, rotates up to 8°, flings out over 250 ms; a sparkle trail on ⭐ | Instant swap + fade |
| Screen transitions | Platform default stack | Default (OS) |
| Mask lift (reveal) | The mask floats up and rotates while gold sparkles burst and the name fades in. 900 ms per contest; tap to skip | 300 ms crossfade |
| "Surprised?" stats | Count-up numbers, 600 ms | Static |
| Loading | The Godmother's wand draws a looping sparkle path | Static icon + text |

Use `react-native-reanimated` and `react-native-gesture-handler`, installed with `npx expo install`. No motion ever carries information on its own.

---

## 8. Share card

- **Size:** 1080 × 1350 (4:5), rendered **on the device** from a hidden view (`react-native-view-shot`), then passed to the OS share sheet (`expo-sharing`). Nothing is uploaded (Inv. 5, `Api` comment "no POST /share").
- **Layout:** midnight gradient, the Godmother at top left, the headline "My Fairy Tale Ballot", and one big stat chosen by the user from U4 ("I looked at **9 races** before seeing a single name"). Below that, a row of 5 random masks from the cast as decoration (**not** the user's actual masks), and the footer `fairytaleballot.tech` (domain TBD).
- **Must not contain:** picks, candidate names or masks tied to them, parties, alignment buckets, ballot style, precinct or district.

---

## 9. App icon & splash

- **Icon:** a gold domino mask with a single sparkle, on godmother violet. Replace the default Expo assets in `apps/mobile/assets/` and set `android.adaptiveIcon.backgroundColor` to `#6B4FD8` in `app.json`.
- **Splash:** the icon centered on midnight `#15122B`.
- **Light/dark:** change `userInterfaceStyle` in `app.json` from `"light"` to `"automatic"` once both themes pass contrast checks.

---

## 10. Web (`apps/web`)

The site uses the same tokens as CSS variables, plus `prefers-color-scheme` for dark mode. It is a reading layout: a 640px column, Fraunces headings and Atkinson body text. The mobile breakpoint is the default, with a 16px gutter and no horizontal scroll. Page list is in `APP_BUILD.md` §6.
