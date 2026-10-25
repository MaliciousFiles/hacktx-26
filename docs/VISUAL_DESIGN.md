# 🧚 Fairy Tale Ballot — Visual Design System

> Tokens, type, components, motion and art direction for `apps/mobile` and `apps/web`.
> Screen structure is in [`UX.md`](./UX.md).
> **Source of truth:** the gold "Choosing Deck" storybook theme in `apps/mobile/src/theme.ts`, `components/ui.tsx` and `components/art.tsx`. This doc writes that theme down and extends it. The screen-by-screen visual design is being made in Figma; when Figma and this doc disagree, update this doc to match the agreed Figma frames.

---

## 0. Decisions (made by the team)

| Decision | Choice |
|---|---|
| Aesthetic and palette | **The fantastical gold storybook theme** (Oct 25): warm parchment pages, maroon ink, gold leaf. This replaces the earlier forest-green proposal: maroon is the accent, and the only green left is the pale `forestSoft` banner tint |
| Fonts | Bundled Google fonts via `@expo-google-fonts` (they work in Expo Go): **IM Fell English** for display, **IM Fell English SC** for small-caps labels, **Alegreya Sans** for body text. A font load failure falls back to system type |
| Theme | **Light only** for now (`userInterfaceStyle: "light"`) |
| Mascot | **Minimal**: the Fairy Godmother appears only in onboarding and the Unmasking |
| Navigation | A single stack, as built. No tab bar (UX.md §2.2) |
| Share card | Stats only. No picks, names or parties |
| Masks | Generic androgynous fantasy-character headshots, unrelated to the real candidate. **Placeholders for now** (Oct 25): the title plus the initials fallback in §5 until the portrait art lands |

---

## 1. Art direction

**"A gilded storybook."** Parchment pages, maroon ink, gold leaf, and hand-drawn sticker art (`art.tsx`): the Godmother, icons, vine flourishes, dotted rules and paper corners. Surfaces have a hard, offset "paper" shadow so cards feel like cut card stock.

- **Ornament:** small-caps kickers, the dotted ink `Rule` under titles, the vine `Ornament`, gold-filled sparkles and stars, and parchment `Panel`s with a maroon border and paper shadow.
- **Evidence:** the same panels but calm inside: generous line height and no decoration inside quotes or numbers.
- **Whimsy** is concentrated in the masks, the Godmother (onboarding and the Unmasking), the home "chapters" scene and motion. Evidence screens stay plain and neutral.
- **Never:** flags, elephants, donkeys, red-vs-blue pairs, ballot-box clip art with check marks, or anything that suggests a "correct" answer.

---

## 2. Color

These are the tokens in `apps/mobile/src/theme.ts`. Components import `colors` and never use hex literals. The web mirrors them as CSS variables in `apps/web/src/theme.css`.

| Token | Hex | Use |
|---|---|---|
| `bg` | `#EDD5AC` | App background (parchment) |
| `bgLight` | `#F4E2C2` | Lighter page areas |
| `tray` | `#E4C596` | Footer tray, inset wells |
| `card` | `#F8E8CC` | Panels, choice buttons, list rows |
| `cream` | `#FCF3E1` | Highest surface: sheets, quotes, label on maroon buttons |
| `page` | `#F2CDB2` | Blush page tint (Godmother bubble, accents) |
| `ink` | `#4E2522` | Primary text |
| `inkSoft` | `#7A5246` | Notes, captions |
| `heading` | `#8A4A47` | Titles |
| `line` | `#7A3B3B` | Borders, back links, text buttons, small-caps labels |
| `lineSoft` | `rgba(122,59,59,0.35)` | Dividers, pole-line tracks |
| `bevel` | `#B98A5E` | Paper shadow under cards and buttons |
| `forest` | `#7A3B3B` | **Legacy name; it is maroon.** Primary buttons, selected choices, progress, the user's ◆ marker. Rename to `accent` when convenient |
| `forestSoft` | `#E3EBD3` | "Documented" banner tint |
| `gold` | `#F6D57E` | Gold leaf: fills for stars, sparkles, sample mark, selected-card halo. **Fill only, never text** |
| `goldDeep` | `#E2A93A` | Gold strokes and darker leaf |
| `goldSoft` | `#F9E6B0` | Default banner, starred state, alignment chips |
| `rose` | `#C2404A` | Fill/border/icon for **"Not stated"** pills, 🚩 flags and warnings (always with icon + text) |
| `roseSoft` | `#F5D3C8` | Warning banners, "Not stated" pill fill |

**Proposed additions** (not in `theme.ts` yet):

| Token | Hex | Use |
|---|---|---|
| `unknown` | `#7A7268` | ❓ Disputed/unknown, "no evidence", "not applicable" |

**Rules**
- **No party colors.** Maroon and rose must never stand for two candidates or two sides. Candidates are told apart by **mask and shape, not color**: on pole lines each candidate gets an ink-colored shape (● ■ ▲ ◆ …) labeled with the mask title. The user is always the maroon ◆. After the reveal, party names are plain text and **never colored by party**.
- **Rose** is only for missing plan slots, 🚩 flags and warnings (PLAN §2). It is never used for a candidate, a pole or an alignment bucket.
- **Buckets** all use the same `goldSoft` chip with `ink` text and are told apart only by emoji and label. That keeps any one of them from looking "good" or "bad". 🪞 Clouded uses a dashed `line` border instead.
- **Contrast** (WCAG AA, 4.5:1 for body text). Measured: `ink` on `bg` 9.1, `ink` on `card` 10.8, `line` on `bg` 5.9, `inkSoft` on `bg` 4.7, `heading` on `bg` 4.7, `cream` on `line` 6.9. `rose` text fails (3.6 on `bg`, 4.2 on `card`), so "Not stated" pills use `ink` text on `roseSoft` with a `rose` border and icon. `gold` is never used for text.

---

## 3. Typography

From `ui.tsx` (`fonts` in `theme.ts`):

| Role | Font | Size / line height (pt) | Color |
|---|---|---|---|
| Kicker | Alegreya Sans Bold, uppercase, letter-spaced | 13 | `line` |
| Title (`accessibilityRole="header"`) | IM Fell English | 32/37 | `heading` |
| Section title | IM Fell English SC | 21/26 | `line` |
| Banner title | IM Fell English SC | 17 | `line` |
| Primary button label | IM Fell English SC | 20 | `cream` |
| Body | Alegreya Sans Medium | 17/24 | `ink` |
| Choice label | Alegreya Sans Medium | 16/22 | `ink` (`cream` when selected) |
| Note | Alegreya Sans Medium | 15 | `inkSoft` |
| Text button / back link | Alegreya Sans Bold | 15–16 | `line` |
| Sample mark | Alegreya Sans Bold, uppercase | 11.5 | `ink` with a `gold` sparkle |

- **Quotes and verbatim ballot text:** body size with a 26 line height, in a `cream` `Panel` with a 3pt `line` left rule. Use quotation marks, not italics.
- **Numbers** (money, %): body font with `fontVariant: ["tabular-nums"]`.
- All text scales with the OS text size. Don't set `maxFontSizeMultiplier` below 2 on evidence text. IM Fell is decorative: keep it to titles and labels, never paragraphs.

---

## 4. Layout, shape, elevation

From `ui.tsx`:
- **Column:** max width 520, side padding 22, centered. Compare may widen to 960 on tablets and web.
- **Footer** actions are pinned to the bottom with a 10 gap and respect the safe area.
- **Radius:** panels and list rows 20; buttons, choices and banners 16; chips and the star pill 999.
- **Elevation:** none. Panels use a 1pt `line` border instead of shadows. Keep it that way.
- **Spacing in use:** 4 · 6 · 8 · 10 · 12 · 14 · 16 · 18 · 22. Panels sit 12 apart and sections 22 apart.
- **Pressed state:** opacity 0.82.

---

## 5. Masks (the cast)

**Decided:** each mask is a **title plus a portrait**, a generic, androgynous fantasy-character headshot. The portrait is a costume, not a likeness: it has nothing to do with the real candidate.

**Portrait rules**
- **Unrelated to the person:** masks are dealt by crypto-random shuffle, never by any feature of the candidate (Inv. 8). The art direction must not let a portrait be read as hinting at gender, age, race or party.
- **Androgynous and fantastical:** soft, ageless faces; fantasy features such as pointed ears, horns, feathers, leaf crowns, star freckles and hoods; non-human or jewel-tone skin (moss, lilac, slate, copper, pearl) rather than realistic skin tones.
- **No party colors:** avoid red/blue pairs in costumes. Wardrobe stays in the parchment/maroon/gold palette.
- **Protagonists only:** friendly, curious expressions; nothing villain-coded (PLAN §11).
- **Consistent style:** the same framing (head and shoulders, three-quarter view), lighting and line weight for every portrait, so no character looks more "important" or trustworthy than another.
- **Enough of them:** at least 16, so a contest never repeats a mask.
- **Bundled:** shipped in `apps/mobile/assets/masks/`, never fetched (Inv. 7). Art is made once before the event and frozen (PLAN §7, tier T3). It is never generated at runtime.

**Starter titles** (the portraits are generic; the titles add flavor):

| | | | |
|---|---|---|---|
| The Lantern Keeper | The Glass Cobbler | The Map Mender | The Star Baker |
| The Lighthouse Keeper | The Paper Folder | The Quiet Wanderer | The Kite Rider |
| The Bell Ringer | The Tea Gardener | The Moth Herald | The River Weaver |
| The Clock Tinker | The Moon Gardener | The Arch Builder | The Story Spinner |

**Portrait tile:** a circle, 56pt in rows and 120pt in the candidate header, with a 2pt `line` border on a `goldSoft` field. **Placeholder (current):** until the portraits land, every mask renders this tile with the title's initials in IM Fell English plus the mask title; `CAST[].imageUrl` stays empty.

## 6. Components

The components in `ui.tsx` today are: `Screen`, `SampleMark`, `Kicker`, `Title`, `Body`, `Note`, `Ornament`, `BackButton`, `TopBar`, `Progress`, `ChoiceButton`, `PrimaryButton`, `TextButton`, `StarButton`, `Panel`, `Section`, `Banner` (tones `quiet`, `rose`, `forest`), `Rule`, `Ribbon`, `Tile`, `GuideBubble`, and `CandidateCard`, plus the art in `art.tsx` and motion in `motion.tsx`.

To add, in the same style:

| Component | Purpose | Notes |
|---|---|---|
| `Chip` | coverage, source type, tier, status | `goldSoft`/`forestSoft`/`roseSoft` fill + ink text + icon; never color alone |
| `CitationChip` | small `[1]` → opens `CitationSheet` | 🔒 icon before the reveal |
| `CitationSheet` | excerpt, Verbatim/Excerpt label, outlet, date, link-after-reveal, report | a `Panel` in a form sheet |
| `CitedText` | renders `CitedSentence[]` with chips | — |
| `SwipeCard` | wraps the existing choice layout with an optional swipe gesture | buttons stay the primary input |
| `PoleLine` | horizontal `line` axis with pole labels in `inkSoft` at the ends; candidate shapes in ink; user ◆ in maroon (`forest` token); hollow ring = no evidence | Compare, Says vs. Does, judicial |
| `SlotRow` | one Plan Explorer slot | documented / **Not stated** (`rose` pill) / not applicable (`unknown` pill + reason) |
| `FlagBadge` | 🚩 ⚠️ 💸 ✅ + count; copy from `FLAG_COPY` in `labels.ts` | tap → evidence |
| `RangeBar` | money range band on a `line` track, `ink` fill; exact amount = tick | separate bars for direct vs. outside spending, never stacked |
| `ClarityMeter` | 5 segments (same style as `Progress`) + "Compared on N issues" | — |
| `BucketChip` | only inside the collapsed alignment section | Clouded = dashed border |
| `ContextBrief` | four labeled groups + system notes | supporters and opponents look identical |
| `Accordion` | collapsed "How your answers line up (optional)" | closed by default |
| `MenuButton` | header action that opens Daily, How it works, Notes, Report, Settings | lives in `TopBar` `action` |

**Supporter/opponent symmetry:** the two groups always use the same width, the same style and the same per-side cap (Inv. 17). Supporters is always shown first; that order is fixed, not randomized, and it is never visually emphasized.

---

## 7. Motion

Keep motion restrained so it fits the book look.

| Moment | Motion | Reduce Motion |
|---|---|---|
| Screen transitions | `slide_from_right` (as built) | OS default |
| Card answer | The choice fills maroon with a gold halo, then the next card slides in. An optional swipe follows the finger and rotates up to 6° | Instant |
| Unmasking | Contest by contest: the mask portrait fades and lifts while the name fades in under a gold `Ornament` flourish. About 700 ms per contest; tap to skip | 250 ms crossfade |
| "Surprised?" stats | Count-up numbers, 600 ms | Static |

If swipe gestures ship, add `react-native-gesture-handler` and `react-native-reanimated` with `npx expo install`. No motion ever carries information on its own.

---

## 8. Share card

- **Size:** 1080 × 1350 (4:5), rendered **on the device** from a hidden view (`react-native-view-shot`), then passed to the OS share sheet (`expo-sharing`). Nothing is uploaded (Inv. 5).
- **Layout:** a `bg` parchment field with a `gold` double rule border. The kicker reads "MY FAIRY TALE BALLOT", then one big IM Fell stat the user picks from U4 ("My picks came from **3** different parties"), then an `Ornament`, then the domain in `inkSoft`.
- **Must not contain:** picks, candidate names or masks tied to them, parties, alignment buckets, ballot style, precinct or district.
- The built reveal screen shares a **text** message today (`Share.share({ message })`). The image is an upgrade, and text sharing stays as the fallback.

---

## 9. App icon & splash

- **Icon:** a gold domino-mask line drawing on maroon (`line`). Replace the default Expo assets in `apps/mobile/assets/`. Set the Android adaptive background to `bg` or maroon, whichever gives the foreground enough contrast.
- **Splash:** the icon centered on `bg`.

---

## 10. Web (`apps/web`)

The site uses the same tokens as CSS variables, light only, and the same type roles: IM Fell English for headings and Alegreya Sans for body text (Google Fonts). It is a reading layout with a 520–640px column, a 16px phone gutter and no horizontal scroll. Page list is in `APP_BUILD.md` §6.
