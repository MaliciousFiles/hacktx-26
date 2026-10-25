# 🧚 Fairy Tale Ballot — Visual Design System

> Tokens, type, components, motion and art direction for `apps/mobile` and `apps/web`.
> Screen structure is in [`UX.md`](./UX.md).
> **Source of truth:** the theme already built on the `mobile-dev-build` branch (`apps/mobile/src/theme.ts` and `apps/mobile/src/components/ui.tsx`). This doc writes that theme down and extends it. It doesn't replace it. If this doc and that code disagree, change the code to match **only after** the team agrees.

---

## 0. Decisions (made by the team, Oct 24)

| Decision | Choice |
|---|---|
| Aesthetic and palette | The `mobile-dev-build` theme: parchment, forest, gold, rose |
| Fonts | System serif (Georgia on iOS, `serif` on Android) for headings; system sans for body text. No custom font loading |
| Theme | **Light only** for now (`userInterfaceStyle: "light"`) |
| Mascot | **Minimal**: the Fairy Godmother appears only in onboarding and the Unmasking |
| Navigation | A single stack, as built. No tab bar (UX.md §2.2) |
| Share card | Stats only. No picks, names or parties |
| Masks | Generic androgynous fantasy-character headshots, unrelated to the real candidate |
| Gold | Darkened from `#8A6830` to `#7A5B28` so it passes AA contrast |

---

## 1. Art direction

**"An illuminated storybook page."** Warm parchment, deep forest ink, gold for ornament, and rose kept for warnings. The look comes from typography and thin gold rules, not illustration. The app reads as a carefully set book.

- **Ornament:** the gold kicker above titles (small caps, letter-spaced), the `Ornament` divider (a gold line, a dot, a gold line), and rounded parchment `Panel`s with a 1pt border.
- **Evidence:** the same flat panels, generous line height, no decoration inside quotes or numbers.
- **Whimsy** is limited to the mask characters, the onboarding Godmother panel and the Unmasking. Everything else is calm.
- **Never:** flags, elephants, donkeys, red-vs-blue pairs, ballot-box clip art with check marks, or anything that suggests a "correct" answer.

---

## 2. Color

These are the tokens in `apps/mobile/src/theme.ts` on `mobile-dev-build`. Components import `colors` and never use hex literals. The web mirrors them as CSS variables in `apps/web/src/theme.css`.

| Token | Hex | Use |
|---|---|---|
| `bg` | `#F3EDE2` | App background (parchment) |
| `card` | `#FFFBF6` | Panels, choice buttons, list rows |
| `ink` | `#1C1915` | Primary text |
| `inkSoft` | `#5E564C` | Notes, captions, text buttons |
| `line` | `#E0D3C2` | Borders, dividers, pole lines |
| `forest` | `#1E4636` | Primary buttons, selected choices, progress, back links, the user's ◆ marker |
| `forestSoft` | `#E4EFE8` | "Documented" / positive-evidence banners |
| `gold` | `#7A5B28` | Kicker, ornament, ⭐ "Matters to me", sample mark. **Changed from the built `#8A6830`** |
| `goldSoft` | `#F4E7CB` | Default banner, starred state, alignment chips |
| `rose` | `#8E3344` | **"Not stated"** pills, 🚩 flags (always with icon + text) |
| `roseSoft` | `#F8E8EA` | Warning banners |

**Proposed additions** (not in the built theme yet):

| Token | Hex | Use |
|---|---|---|
| `unknown` | `#7A7268` | ❓ Disputed/unknown, "no evidence", "not applicable" |
| `progressOff` | `#D3C4AE` | Unfilled progress segments (already hard-coded in `ui.tsx`; promote it to a token) |

**Rules**
- **No party colors.** Forest and rose must never stand for two candidates or two sides. Candidates are told apart by **mask and shape, not color**: on pole lines each candidate gets an ink-colored shape (● ■ ▲ ◆ …) labeled with the mask title. The user is always the forest ◆. After the reveal, party names are plain text and **never colored by party**.
- **Rose** is only for missing plan slots, 🚩 flags and warnings (PLAN §2). It is never used for a candidate, a pole or an alignment bucket.
- **Buckets** all use the same `goldSoft` chip with `ink` text and are told apart only by emoji and label. That keeps any one of them from looking "good" or "bad". 🪞 Clouded uses a dashed `line` border instead.
- **Contrast:** every text pairing passes AA (4.5:1). `gold` was darkened to `#7A5B28` (about 5.4:1 on `bg`) because the built `#8A6830` came out at about 4.4:1. Update `theme.ts` to match.

---

## 3. Typography

From `ui.tsx`:

| Role | Font | Size / line height (pt) | Color |
|---|---|---|---|
| Kicker | serif, uppercase, letter-spacing 1.2 | 13 | `gold` |
| Title (`accessibilityRole="header"`) | serif | 34/40 | `ink` |
| Section title | serif | 20/26 | `ink` |
| Banner title / primary button label | serif | 16 | `ink` / `card` |
| Body | system sans | 17/25 | `ink` |
| Choice label | system sans | 16/22 | `ink` (`card` when selected) |
| Note | system sans | 14/21 | `inkSoft` |
| Sample mark | system sans, uppercase, letter-spacing 0.6 | 12 | `gold` |

- `serif` is `Platform.select({ ios: "Georgia", android: "serif", default: "Georgia" })`.
- **Quotes and verbatim ballot text:** body size with a 26 line height, in a `Panel` with a 3pt `line` left rule. Use quotation marks, not italics.
- **Numbers** (money, %): body font with `fontVariant: ["tabular-nums"]`.
- All text scales with the OS text size. Don't set `maxFontSizeMultiplier` below 2 on evidence text.

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
- **No party colors:** avoid red/blue pairs in costumes. Wardrobe stays in the parchment/forest/gold palette.
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

**Portrait tile:** a circle, 56pt in rows and 120pt in the candidate header, with a 1pt `gold` border on a `goldSoft` field. If an image is missing, fall back to the title's initials in serif.

## 6. Components

The components in `ui.tsx` today are: `Screen`, `SampleMark`, `Kicker`, `Title`, `Body`, `Note`, `Ornament`, `BackButton`, `TopBar`, `Progress`, `ChoiceButton`, `PrimaryButton`, `TextButton`, `StarButton`, `Panel`, `Section`, `Banner` (tones `quiet`, `rose`, `forest`), and `CandidateCard`.

To add, in the same style:

| Component | Purpose | Notes |
|---|---|---|
| `Chip` | coverage, source type, tier, status | `goldSoft`/`forestSoft`/`roseSoft` fill + ink text + icon; never color alone |
| `CitationChip` | small `[1]` → opens `CitationSheet` | 🔒 icon before the reveal |
| `CitationSheet` | excerpt, Verbatim/Excerpt label, outlet, date, link-after-reveal, report | a `Panel` in a form sheet |
| `CitedText` | renders `CitedSentence[]` with chips | — |
| `SwipeCard` | wraps the existing choice layout with an optional swipe gesture | buttons stay the primary input |
| `PoleLine` | horizontal `line` axis with pole labels in `inkSoft` at the ends; candidate shapes in ink; user ◆ in `forest`; hollow ring = no evidence | Compare, Says vs. Does, judicial |
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
| Card answer | The choice fills `forest`, then the next card slides in. An optional swipe follows the finger and rotates up to 6° | Instant |
| Unmasking | Contest by contest: the mask portrait fades and lifts while the name fades in under a gold `Ornament` flourish. About 700 ms per contest; tap to skip | 250 ms crossfade |
| "Surprised?" stats | Count-up numbers, 600 ms | Static |

If swipe gestures ship, add `react-native-gesture-handler` and `react-native-reanimated` with `npx expo install`. No motion ever carries information on its own.

---

## 8. Share card

- **Size:** 1080 × 1350 (4:5), rendered **on the device** from a hidden view (`react-native-view-shot`), then passed to the OS share sheet (`expo-sharing`). Nothing is uploaded (Inv. 5).
- **Layout:** a `bg` parchment field with a `gold` double rule border. The kicker reads "MY FAIRY TALE BALLOT", then one big serif stat the user picks from U4 ("My picks came from **3** different parties"), then an `Ornament`, then the domain in `inkSoft`.
- **Must not contain:** picks, candidate names or masks tied to them, parties, alignment buckets, ballot style, precinct or district.
- The built reveal screen shares a **text** message today (`Share.share({ message })`). The image is an upgrade, and text sharing stays as the fallback.

---

## 9. App icon & splash

- **Icon:** a gold domino-mask line drawing on `forest`. Replace the default Expo assets in `apps/mobile/assets/`. The Android adaptive background is already `#F3EDE2` on `mobile-dev-build`; switch it to `forest` only if the icon foreground needs the contrast.
- **Splash:** the icon centered on `bg`.

---

## 10. Web (`apps/web`)

The site uses the same tokens as CSS variables, light only, and the same type roles: a Georgia stack for headings and the system sans stack for body text. It is a reading layout with a 520–640px column, a 16px phone gutter and no horizontal scroll. Page list is in `APP_BUILD.md` §6.
