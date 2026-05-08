# Heritage Themes + Theme Picker Audit — 2026-05-08

Auditor: Claude Code (read-only)
Purpose: Provide exact web source for iOS Phase 6 implementation —
7 heritage themes + theme picker in Settings.

Source of truth: web repo at branch `feat/welcome-push-and-pwa-install-guide`.

---

## TL;DR for the iOS prompt author

- **7 themes**, not 6: `sankofa`, `gye_nyame`, `adinkrahene`, `copper`,
  `emerald`, `amber`, `obsidian`. (The Phase 6 brief says "6"; mirror
  the web's actual 7. The hint copy explicitly says "7 heritage-themed
  card styles".)
- **Default theme is `sankofa`** (DB default + null fallback), enforced
  by a CHECK constraint at the column level.
- **All 7 motifs are pure SVG `<path>` / `<line>` / `<circle>`** — no
  bitmaps, no defs/gradients/masks/filters. Trivially portable to
  SwiftUI `Path` + `Shape`.
- **Theme picker lives in a Dialog modal** opened from a "Change card"
  button inside the Settings "Card Style" section. 2-column grid of
  mini cards. Tap → optimistic local update + Supabase write +
  rollback on error. No "Save" step.
- **CycleCard tap navigates** to `/dashboard/cycle-detail` (Phase 6.5
  on iOS, but the navigation already exists on web — note this).
- **No transition animations** on theme change. The card just swaps.
  iOS should match (no SwiftUI cross-fade).
- The **`HintCard hintId="card_theme_available"`** sits *above* the
  CardThemePicker section on Settings. Title: "Customize your card";
  body promises "7 heritage-themed card styles".

---

## 1. Theme Type Definition

File: `src/types/card-theme.ts` (lines 1–11)

```ts
export type CycleCardTheme =
  | 'sankofa'
  | 'gye_nyame'
  | 'adinkrahene'
  | 'copper'
  | 'emerald'
  | 'amber'
  | 'obsidian';

// Backward-compat alias
export type CardTheme = CycleCardTheme;
```

**Default theme:** `'sankofa'` — enforced both at:
- DB level: `profiles.card_theme text NOT NULL DEFAULT 'sankofa'`
  (migration 0028, lines 23–28)
- Client level: every consumer falls back to `'sankofa'` when
  `profile.card_theme` is `undefined`/unknown (e.g. `cycle-card.tsx:24`,
  `theme-picker.tsx:21`, `card-theme-picker.tsx:10`,
  `dashboard/page.tsx:330`).

The `ThemeConfig` shape (lines 13–26):

```ts
export interface ThemeConfig {
  id: CycleCardTheme;
  name: string;
  meaning?: string;
  palette: {
    background: string;
    motif: string;
    chipPrimary: string;
    chipSecondary: string;
    balanceText: string;
    nameText: string;
    brandText: string;
  };
}
```

Notes:
- `meaning` is optional — only Sankofa, Gye Nyame, and Adinkrahene have
  one (the three Adinkra-symbol themes).
- All palette fields are flat hex strings; **no gradients** in the
  config. The card background is a *solid color*, not a CSS gradient.
- A backward-compat alias is also exported (line 126):
  `export const CARD_THEMES = CYCLE_CARD_THEMES;`

---

## 2. THEME_CONFIG Map

File: `src/types/card-theme.ts` (lines 28–123)

```ts
export const CYCLE_CARD_THEMES: Record<CycleCardTheme, ThemeConfig> = {
  sankofa: {
    id: 'sankofa',
    name: 'Sankofa',
    meaning: 'Learn from the past',
    palette: {
      background: '#0D1929',
      motif: '#D4A017',
      chipPrimary: '#C9A94A',
      chipSecondary: '#A88938',
      balanceText: '#E8D9B8',
      nameText: '#E8D9B8',
      brandText: '#D4A017',
    },
  },
  gye_nyame: {
    id: 'gye_nyame',
    name: 'Gye Nyame',
    meaning: 'Except God',
    palette: {
      background: '#3E0F14',
      motif: '#C8C8D0',
      chipPrimary: '#BDBDC5',
      chipSecondary: '#9B9BA3',
      balanceText: '#E8E8EC',
      nameText: '#E8E8EC',
      brandText: '#C8C8D0',
    },
  },
  adinkrahene: {
    id: 'adinkrahene',
    name: 'Adinkrahene',
    meaning: 'Chief of symbols',
    palette: {
      background: '#2A1339',
      motif: '#D4A017',
      chipPrimary: '#C9A94A',
      chipSecondary: '#A88938',
      balanceText: '#E8D9B8',
      nameText: '#E8D9B8',
      brandText: '#D4A017',
    },
  },
  copper: {
    id: 'copper',
    name: 'Copper',
    palette: {
      background: '#1A1A1D',
      motif: '#C87533',
      chipPrimary: '#B88050',
      chipSecondary: '#8F5F3A',
      balanceText: '#E8D4B8',
      nameText: '#E8D4B8',
      brandText: '#C87533',
    },
  },
  emerald: {
    id: 'emerald',
    name: 'Emerald',
    palette: {
      background: '#0F2E1F',
      motif: '#E8DCB4',
      chipPrimary: '#C9A94A',
      chipSecondary: '#A88938',
      balanceText: '#EFE8D0',
      nameText: '#EFE8D0',
      brandText: '#E8DCB4',
    },
  },
  amber: {
    id: 'amber',
    name: 'Amber',
    palette: {
      background: '#0D1929',
      motif: '#E0A040',
      chipPrimary: '#C9A94A',
      chipSecondary: '#A88938',
      balanceText: '#E8D9B8',
      nameText: '#E8D9B8',
      brandText: '#E0A040',
    },
  },
  obsidian: {
    id: 'obsidian',
    name: 'Obsidian',
    palette: {
      background: '#0E1A2E',
      motif: '#C87533',
      chipPrimary: '#B88050',
      chipSecondary: '#8F5F3A',
      balanceText: '#E8D4B8',
      nameText: '#E8D4B8',
      brandText: '#C87533',
    },
  },
};
```

#### Per-theme summary
| Theme | Background | Motif | Chip P / S | Balance / Name | Brand |
| --- | --- | --- | --- | --- | --- |
| sankofa | `#0D1929` (deep navy) | `#D4A017` (gold) | `#C9A94A` / `#A88938` | `#E8D9B8` | `#D4A017` |
| gye_nyame | `#3E0F14` (deep red) | `#C8C8D0` (silver) | `#BDBDC5` / `#9B9BA3` | `#E8E8EC` | `#C8C8D0` |
| adinkrahene | `#2A1339` (royal purple) | `#D4A017` (gold) | `#C9A94A` / `#A88938` | `#E8D9B8` | `#D4A017` |
| copper | `#1A1A1D` (graphite) | `#C87533` (copper) | `#B88050` / `#8F5F3A` | `#E8D4B8` | `#C87533` |
| emerald | `#0F2E1F` (forest) | `#E8DCB4` (cream) | `#C9A94A` / `#A88938` | `#EFE8D0` | `#E8DCB4` |
| amber | `#0D1929` (deep navy) | `#E0A040` (amber) | `#C9A94A` / `#A88938` | `#E8D9B8` | `#E0A040` |
| obsidian | `#0E1A2E` (midnight) | `#C87533` (copper) | `#B88050` / `#8F5F3A` | `#E8D4B8` | `#C87533` |

> `nameText === balanceText` for every theme — they're not split fields
> in practice. iOS can collapse if helpful, but match the struct shape
> for forward-compat.

---

## 3. SVG Motifs

File: `src/components/cycle-card/motifs.tsx` (whole file — lines 1–156)

All 7 motif components share a signature: `({ color }: { color: string }) => React.ReactElement`.
None use `defs`, gradients, masks, or filters. All are pure stroked
geometry except Amber (which uses fills for circles + a 4-point star)
and Adinkrahene/Sankofa/Obsidian (which include a small filled center
dot/circle).

The motifs are exported via a registry on lines 147–155:

```ts
export const MOTIF_COMPONENTS: Record<string, ({ color }: { color: string }) => React.ReactElement> = {
  sankofa: SankofaMotif,
  gye_nyame: GyeNyameMotif,
  adinkrahene: AdinkraheneMotif,
  copper: CopperMotif,
  emerald: EmeraldMotif,
  amber: AmberMotif,
  obsidian: ObsidianMotif,
};
```

### 3.1 Sankofa
File: `src/components/cycle-card/motifs.tsx` (lines 1–19)

```tsx
export function SankofaMotif({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className="absolute"
      style={{ right: '12%', top: '50%', transform: 'translateY(-50%)', width: '22%', height: '55%', opacity: 0.7 }}
      aria-hidden="true"
    >
      <g transform="translate(50, 50)">
        <path d="M 0,-42 C -21,-42 -42,-27 -42,-5 C -42,10 -31,23 -21,31 C -11,39 0,45 0,45 C 0,45 11,39 21,31 C 31,23 42,10 42,-5 C 42,-27 21,-42 0,-42 Z" fill="none" stroke={color} strokeWidth="2.2"/>
        <path d="M 0,-29 C -13,-29 -26,-19 -26,-5 C -26,5 -18,12 -8,12 C -2,12 0,9 0,5 C 0,0 -4,-2 -7,-2" fill="none" stroke={color} strokeWidth="1.6"/>
        <path d="M 0,-29 C 13,-29 26,-19 26,-5 C 26,5 18,12 8,12 C 2,12 0,9 0,5 C 0,0 4,-2 7,-2" fill="none" stroke={color} strokeWidth="1.6"/>
        <line x1="0" y1="-42" x2="0" y2="-29" stroke={color} strokeWidth="1.6"/>
        <line x1="0" y1="15" x2="0" y2="31" stroke={color} strokeWidth="1.6"/>
        <circle cx="0" cy="-5" r="2.5" fill={color}/>
      </g>
    </svg>
  );
}
```

- viewBox: `0 0 100 100`, container `transform="translate(50, 50)"` (origin centered)
- Layout: positioned `right: 12%, top: 50%, translateY(-50%)`,
  `width: 22%`, `height: 55%`, `opacity: 0.7`
- Stroke widths: `2.2` (outer heart-like outline), `1.6` (inner curls + lines)
- Fill: `none` on all paths/lines; **single filled `<circle>`** (`r=2.5`) at center
- Composition: 1 outer cubic-bezier outline + 2 mirrored inner curls + 2 axial lines + 1 center dot

### 3.2 Gye Nyame
File: `src/components/cycle-card/motifs.tsx` (lines 21–38)

```tsx
export function GyeNyameMotif({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className="absolute"
      style={{ right: '12%', top: '50%', transform: 'translateY(-50%)', width: '22%', height: '55%', opacity: 0.72 }}
      aria-hidden="true"
    >
      <g transform="translate(50, 50)">
        <line x1="0" y1="-44" x2="0" y2="44" stroke={color} strokeWidth="2"/>
        <path d="M 0,-42 C -18,-42 -33,-30 -33,-12 C -33,0 -22,8 -12,8 C -3,8 3,3 3,-6 C 3,-13 -2,-17 -7,-17 C -10,-17 -11,-15 -11,-12" fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round"/>
        <path d="M 0,40 C 18,40 33,28 33,10 C 33,-2 22,-12 12,-12 C 3,-12 -3,-5 -3,3 C -3,10 2,14 7,14 C 10,14 11,12 11,10" fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round"/>
        <line x1="-9" y1="-33" x2="9" y2="-33" stroke={color} strokeWidth="1.5"/>
        <line x1="-9" y1="33" x2="9" y2="33" stroke={color} strokeWidth="1.5"/>
      </g>
    </svg>
  );
}
```

- viewBox: `0 0 100 100`, origin centered
- Position: same right-aligned vertical centering (22% / 55% / 0.72 opacity)
- Stroke widths: `2.0` (vertical spine), `1.8` (two curls, with `stroke-linejoin: round`), `1.5` (two horizontal cross-bars)
- Fill: none on all
- Composition: 1 vertical line + 2 mirrored curl paths + 2 horizontal bars (top + bottom)

### 3.3 Adinkrahene
File: `src/components/cycle-card/motifs.tsx` (lines 40–56)

```tsx
export function AdinkraheneMotif({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className="absolute"
      style={{ right: '12%', top: '50%', transform: 'translateY(-50%)', width: '22%', height: '55%', opacity: 0.75 }}
      aria-hidden="true"
    >
      <g transform="translate(50, 50)">
        <circle cx="0" cy="0" r="44" fill="none" stroke={color} strokeWidth="2"/>
        <circle cx="0" cy="0" r="30" fill="none" stroke={color} strokeWidth="2"/>
        <circle cx="0" cy="0" r="16" fill="none" stroke={color} strokeWidth="2"/>
        <circle cx="0" cy="0" r="3.5" fill={color}/>
      </g>
    </svg>
  );
}
```

- viewBox: `0 0 100 100`, origin centered
- Position: 22% / 55% / opacity `0.75`
- 3 concentric stroked circles (`r=44, 30, 16`, all `strokeWidth=2`) + 1 filled center dot (`r=3.5`)
- The simplest motif by far — a quick win for iOS

### 3.4 Copper
File: `src/components/cycle-card/motifs.tsx` (lines 58–76)

```tsx
export function CopperMotif({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMaxYMin slice"
      className="absolute inset-0 w-full h-full"
      style={{ opacity: 0.6 }}
      aria-hidden="true"
    >
      <g fill="none" stroke={color} strokeWidth="1.4">
        <path d="M 100,0 A 90 90 0 0 0 0,50"/>
        <path d="M 100,15 A 80 80 0 0 0 8,62"/>
        <path d="M 100,30 A 70 70 0 0 0 18,72"/>
        <path d="M 100,45 A 60 60 0 0 0 32,80"/>
        <path d="M 100,60 A 50 50 0 0 0 48,85"/>
      </g>
    </svg>
  );
}
```

- viewBox: `0 0 100 100`, **`preserveAspectRatio="xMaxYMin slice"`**
  (anchors to top-right corner, fills the card)
- Position: full-card overlay (`absolute inset-0 w-full h-full`), opacity `0.6`
- 5 concentric SVG arcs (large-radius elliptical-arc curves) sweeping
  from the top-right corner across the card. All `strokeWidth=1.4`,
  `fill="none"`.
- iOS port: each `M x,y A rx ry 0 large-arc sweep x2,y2` → SwiftUI
  `Path.addArc` or manual Bezier; documented enough for a faithful port.

### 3.5 Emerald
File: `src/components/cycle-card/motifs.tsx` (lines 78–95)

```tsx
export function EmeraldMotif({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 100 50"
      preserveAspectRatio="none"
      className="absolute left-0 right-0"
      style={{ top: '30%', width: '100%', height: '40%', opacity: 0.5 }}
      aria-hidden="true"
    >
      <g fill="none" stroke={color} strokeWidth="0.8">
        <path d="M 0,10 Q 10,5 20,10 T 40,10 T 60,10 T 80,10 T 100,10"/>
        <path d="M 0,20 Q 10,15 20,20 T 40,20 T 60,20 T 80,20 T 100,20"/>
        <path d="M 0,30 Q 10,25 20,30 T 40,30 T 60,30 T 80,30 T 100,30"/>
        <path d="M 0,40 Q 10,35 20,40 T 40,40 T 60,40 T 80,40 T 100,40"/>
      </g>
    </svg>
  );
}
```

- viewBox: `0 0 100 50` (wide aspect), `preserveAspectRatio="none"`
  (stretches to fit container)
- Position: full-width band across middle of card (`top: 30%, height: 40%`), opacity `0.5`
- 4 horizontal sinusoidal-wave paths using SVG quadratic bezier (`Q`)
  + smooth-quadratic continuation (`T`). Strokes are very thin (`0.8`).
- iOS port: build with `Path.addQuadCurve` or sample at intervals.

### 3.6 Amber
File: `src/components/cycle-card/motifs.tsx` (lines 97–126)

```tsx
export function AmberMotif({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMaxYMin slice"
      className="absolute"
      style={{ right: 0, top: 0, width: '50%', height: '100%', opacity: 0.7 }}
      aria-hidden="true"
    >
      <g fill={color}>
        <circle cx="40" cy="15" r="1.5"/>
        <circle cx="60" cy="8" r="2"/>
        <circle cx="75" cy="18" r="1"/>
        <circle cx="85" cy="12" r="2.5"/>
        <circle cx="95" cy="22" r="1.2"/>
        <circle cx="50" cy="32" r="1.5"/>
        <circle cx="72" cy="28" r="2"/>
        <circle cx="88" cy="36" r="1"/>
        <circle cx="42" cy="48" r="1.5"/>
        <circle cx="68" cy="52" r="1.2"/>
        <circle cx="90" cy="47" r="1.8"/>
        <circle cx="58" cy="68" r="2"/>
        <circle cx="82" cy="72" r="1.2"/>
      </g>
      <g transform="translate(85, 12)" fill={color}>
        <path d="M 0,-4 L 1,-1 L 4,0 L 1,1 L 0,4 L -1,1 L -4,0 L -1,-1 Z"/>
      </g>
    </svg>
  );
}
```

- viewBox: `0 0 100 100`, `preserveAspectRatio="xMaxYMin slice"`,
  positioned to right half of card (`width: 50%, height: 100%`,
  opacity `0.7`)
- 13 filled "stardust" circles (radii 1.0 – 2.5) scattered in the
  right half, plus 1 small 4-point star path at `(85, 12)` with
  bounding box ±4
- iOS port: 13 `Circle().frame(width:height:).position(x:y:)` plus
  one `Path` for the 8-point closed polygon (it's actually an
  8-point compass-rose, not a 4-point star — the `M 0,-4 L 1,-1 L
  4,0 L 1,1 L 0,4 L -1,1 L -4,0 L -1,-1 Z` traces 8 vertices).

### 3.7 Obsidian
File: `src/components/cycle-card/motifs.tsx` (lines 128–145)

```tsx
export function ObsidianMotif({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className="absolute"
      style={{ right: '12%', top: '50%', transform: 'translateY(-50%)', width: '30%', height: '70%', opacity: 0.7 }}
      aria-hidden="true"
    >
      <g transform="translate(50, 50)">
        <path
          d="M 0,0 m 0,-44 a 44,44 0 1,1 -0.1,0 M 0,-34 a 34,34 0 1,1 -0.1,0 M 0,-24 a 24,24 0 1,1 -0.1,0 M 0,-14 a 14,14 0 1,1 -0.1,0 M 0,-6 a 6,6 0 1,1 -0.1,0"
          fill="none" stroke={color} strokeWidth="1.6"
        />
        <circle cx="0" cy="0" r="2" fill={color}/>
      </g>
    </svg>
  );
}
```

- viewBox: `0 0 100 100`, origin centered
- Position: **30% / 70%** (slightly larger than the centered Adinkra
  motifs), opacity `0.7`
- A single compound path containing **5 concentric circle arcs
  drawn via `m 0,-r a r,r 0 1,1 -0.1,0`** (radii 44, 34, 24, 14, 6),
  followed by 1 filled center dot (`r=2`). All circles are stroked at
  `1.6`.
- iOS port: trivially `ForEach([44, 34, 24, 14, 6]) { Circle()
  .stroke(color, lineWidth: 1.6) }` + center dot. Effectively a
  denser Adinkrahene.

---

## 4. CycleCard Component

File: `src/components/dashboard/cycle-card.tsx` (whole file — lines 1–209)

Two exports:
1. **`CardSurface`** (lines 14–113) — pure visual: theme + balance +
   chip + name + SIKA brand + motif. No interaction. Used by both the
   dashboard `CycleCard` and the picker preview.
2. **`CycleCard`** (lines 117–209) — wraps `CardSurface` with
   tilt-on-mouse-move animation, click → cycle detail, and the
   bottom Received/Spent/Expected stats row.

### `CardSurface` (verbatim)

```tsx
interface CardSurfaceProps {
  themeId: CycleCardTheme;
  cycleNet: number;
  userName: string;
  amountKey?: number;
  mounted?: React.RefObject<boolean>;
}

export function CardSurface({ themeId, cycleNet, userName, amountKey, mounted }: CardSurfaceProps) {
  const { format } = useCurrency();
  const config = CYCLE_CARD_THEMES[themeId] ?? CYCLE_CARD_THEMES.sankofa;
  const { palette } = config;
  const Motif = MOTIF_COMPONENTS[themeId] ?? MOTIF_COMPONENTS.sankofa;

  const isNegative = cycleNet < 0;
  const prefix = isNegative ? '−' : '';
  const balanceColor = isNegative ? '#F43F5E' : cycleNet === 0 ? '#A1A1AA' : palette.balanceText;

  const balanceNode = (
    <span
      style={{
        color: balanceColor,
        fontFamily: 'var(--font-geist-mono)',
        fontWeight: 700,
      }}
      className="text-3xl md:text-4xl tabular-nums sika-sensitive"
    >
      {prefix}{format(Math.abs(cycleNet))}
    </span>
  );

  return (
    <div
      className="relative overflow-hidden select-none border border-white/10"
      style={{
        backgroundColor: palette.background,
        aspectRatio: '85.6 / 54',
        borderRadius: 20,
      }}
    >
      {/* Motif layer */}
      <Motif color={palette.motif} />

      {/* Content layer */}
      <div
        className="relative z-10 h-full flex flex-col justify-between"
        style={{ padding: '20px 24px' }}
      >
        {/* Top: EMV Chip */}
        <div>
          <EmvChip primary={palette.chipPrimary} secondary={palette.chipSecondary} />
        </div>

        {/* Center: Balance */}
        <div>
          {amountKey !== undefined && mounted ? (
            <motion.div
              key={amountKey}
              initial={mounted.current ? { opacity: 0.35, y: 6 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              {balanceNode}
            </motion.div>
          ) : balanceNode}
        </div>

        {/* Bottom: Name + SIKA brand */}
        <div className="flex items-baseline justify-between">
          <span
            style={{
              color: palette.nameText,
              fontFamily: 'var(--font-geist-mono)',
              fontSize: 11,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '65%',
            }}
          >
            {userName}
          </span>
          <span
            style={{
              color: palette.brandText,
              fontFamily: 'var(--font-geist-sans)',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.18em',
            }}
          >
            SIKA
          </span>
        </div>
      </div>
    </div>
  );
}
```

#### Theme-switching logic
- Theme lookup: `CYCLE_CARD_THEMES[themeId] ?? CYCLE_CARD_THEMES.sankofa`
  (line 24) — unknown / unsupported themes silently fall back to Sankofa.
- Motif lookup: `MOTIF_COMPONENTS[themeId] ?? MOTIF_COMPONENTS.sankofa`
  (line 26) — same safety net.
- All visual properties (background, all 5 text colors, motif color)
  read from the resolved palette.

#### Background construction
**Solid color, NOT a gradient.** Line 49: `backgroundColor: palette.background`.
The "depth" comes from the motif overlay + the slight border
(`border-white/10` = 10% white border) — there is no CSS gradient on
the card itself. iOS should match: `Color(hex:)` background, no
`LinearGradient`.

#### Card chrome
- Aspect ratio: `85.6 / 54` (real ID-1 card ratio)
- Corner radius: `20px`
- 1px border at 10% white opacity (`border-white/10`)
- Inner padding: `20px 24px`
- Three-row vertical layout (chip / balance / name+SIKA), separated by
  `flex justify-between`

#### Balance text rules
- Negative → red `#F43F5E` with `−` (U+2212, not `-`) prefix
- Zero → gray `#A1A1AA`
- Positive → `palette.balanceText`
- Font: `var(--font-geist-mono)`, weight 700, size `text-3xl md:text-4xl`,
  `tabular-nums`, `.sika-sensitive` class (used by privacy-blur tooling)

#### Bottom row
- Name: mono, 11 px, uppercase, letter-spacing `0.1em`, ellipsis at 65% width
- SIKA brand: sans, 13 px, weight 700, letter-spacing `0.18em`

#### EMV Chip (sub-component)
File: `src/components/cycle-card/chip.tsx` (whole file — lines 1–16)

```tsx
export function EmvChip({ primary, secondary }: { primary: string; secondary: string }) {
  return (
    <svg width="42" height="32" viewBox="-18 -14 36 28" aria-hidden="true">
      <rect x="-18" y="-14" width="36" height="28" rx="4" fill={primary}/>
      <rect x="-15" y="-11" width="30" height="22" rx="2" fill={secondary}/>
      <line x1="-15" y1="-5" x2="-3" y2="-5" stroke={primary} strokeWidth="1"/>
      <line x1="3" y1="-5" x2="15" y2="-5" stroke={primary} strokeWidth="1"/>
      <line x1="-15" y1="0" x2="-3" y2="0" stroke={primary} strokeWidth="1"/>
      <line x1="3" y1="0" x2="15" y2="0" stroke={primary} strokeWidth="1"/>
      <line x1="-15" y1="5" x2="-3" y2="5" stroke={primary} strokeWidth="1"/>
      <line x1="3" y1="5" x2="15" y2="5" stroke={primary} strokeWidth="1"/>
      <line x1="-3" y1="-11" x2="-3" y2="11" stroke={primary} strokeWidth="1"/>
      <line x1="3" y1="-11" x2="3" y2="11" stroke={primary} strokeWidth="1"/>
    </svg>
  );
}
```

- 42×32 px, viewBox `-18 -14 36 28` (origin centered)
- Two nested rounded rects (outer radius 4, inner 2)
- 6 horizontal lines + 2 vertical lines forming a `#`-like grid
  (3 rows of 2 segments + 2 vertical separators, with a 6-px gap in
  the middle for both axes)

### `CycleCard` wrapper (verbatim — lines 117–209)

```tsx
interface CycleCardProps {
  cycleNet: number;
  cycleLabel: string;
  userName: string;
  theme: CycleCardTheme;
  received: number;
  spent: number;
  expected: number;
}

export function CycleCard({
  cycleNet,
  cycleLabel: _cycleLabel,
  userName,
  theme,
  received,
  spent,
  expected,
}: CycleCardProps) {
  const { formatCompact } = useCurrency();
  const router = useRouter();
  const searchParams = useSearchParams();
  const cardRef = useRef<HTMLDivElement>(null);
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springX = useSpring(rotateX, { stiffness: 180, damping: 22 });
  const springY = useSpring(rotateY, { stiffness: 180, damping: 22 });
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; }, []);

  function handleOpenDetail() {
    const cycleParam = searchParams.get('cycle');
    const target = cycleParam
      ? `/dashboard/cycle-detail?cycle=${cycleParam}`
      : '/dashboard/cycle-detail';
    router.push(target);
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const card = cardRef.current;
    if (!card) return;
    const { left, top, width, height } = card.getBoundingClientRect();
    rotateY.set(((e.clientX - left) / width - 0.5) * 10);
    rotateX.set(((e.clientY - top) / height - 0.5) * -10);
  }

  function handleMouseLeave() {
    rotateX.set(0);
    rotateY.set(0);
  }

  return (
    <div className="space-y-2">
      <div style={{ perspective: '1200px' }}>
        <motion.div
          ref={cardRef}
          role="button"
          tabIndex={0}
          aria-label="View cycle details"
          onClick={handleOpenDetail}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleOpenDetail();
            }
          }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          whileTap={{ scale: 0.985 }}
          style={{ rotateX: springX, rotateY: springY }}
          className="w-full max-w-[440px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-[20px]"
        >
          <CardSurface
            themeId={theme}
            cycleNet={cycleNet}
            userName={userName}
            amountKey={cycleNet}
            mounted={mounted}
          />
        </motion.div>
      </div>

      {/* Supporting stats */}
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-muted-foreground tabular-nums px-1">
        <span>Received <span className="text-muted-foreground">{formatCompact(received)}</span></span>
        <span className="text-muted-foreground/60">·</span>
        <span>Spent <span className="text-muted-foreground">{formatCompact(spent)}</span></span>
        <span className="text-muted-foreground/60">·</span>
        <span>Expected <span className="text-muted-foreground">{formatCompact(expected)}/mo</span></span>
      </div>
    </div>
  );
}
```

#### Tap behavior — **YES, the card navigates**
On click (or `Enter` / `Space`), the dashboard pushes the user to
`/dashboard/cycle-detail` (with `?cycle=...` preserved if present in
the URL). This is the **Cycle Details** page that Phase 6.5 will
mirror on iOS.

For Phase 6 itself, iOS can leave the card tap as a no-op or wire it
to a stub `CycleDetailView` route — match whatever the Phase 6 prompt
specifies.

#### Hover/interaction
- Mouse-move tilt: ±10° rotation on X/Y axes, sprung
  (`stiffness: 180, damping: 22`). Resets on mouse leave.
- `whileTap={{ scale: 0.985 }}` — a small press-down feedback.
- `perspective: 1200px` on parent for 3D effect.

> iOS port: skip the mouse-tilt entirely (no analog on touch). Keep
> the 0.985 scale on press as a subtle haptic feel.

#### Bottom stats row (Received / Spent / Expected)
A muted `flex flex-wrap` row of three compact-formatted stats joined
by middle-dot separators. iOS should render this *outside* the card
itself (it's a separate row, not part of `CardSurface`).

---

## 5. Theme Picker

File: `src/components/cycle-card/theme-picker.tsx` (whole file — lines 1–148)

```tsx
'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { CYCLE_CARD_THEMES, type CycleCardTheme } from '@/types/card-theme';
import { MOTIF_COMPONENTS } from './motifs';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

const THEME_ORDER: CycleCardTheme[] = [
  'sankofa', 'gye_nyame', 'adinkrahene', 'copper', 'emerald', 'amber', 'obsidian',
];

export function ThemePicker() {
  const supabase = createClient();
  const { user, profile, setProfile } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<CycleCardTheme>(
    (profile?.card_theme as CycleCardTheme) ?? 'sankofa'
  );
  const [saving, setSaving] = useState(false);

  const handleSelect = async (themeId: CycleCardTheme) => {
    if (themeId === selected || !user || saving) return;
    const prev = selected;
    setSelected(themeId);
    setSaving(true);
    setOpen(false);

    const { error } = await supabase
      .from('profiles')
      .update({ card_theme: themeId })
      .eq('id', user.id);

    setSaving(false);

    if (error) {
      setSelected(prev);
      toast.error('Failed to update card style');
      return;
    }

    if (profile) setProfile({ ...profile, card_theme: themeId });
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-accent font-medium hover:opacity-80 transition-opacity"
      >
        Change card
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="w-full max-w-md p-0 gap-0 rounded-3xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <DialogTitle className="text-foreground font-semibold text-base">
              Choose your card
            </DialogTitle>
            <button
              onClick={() => setOpen(false)}
              className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors"
              aria-label="Close"
            >
              <span className="text-muted-foreground text-lg leading-none">×</span>
            </button>
          </div>

          <div className="p-5 grid grid-cols-2 gap-3 overflow-y-auto max-h-[70vh]">
            {THEME_ORDER.map((themeId) => {
              const config = CYCLE_CARD_THEMES[themeId];
              const Motif = MOTIF_COMPONENTS[themeId];
              const isSelected = selected === themeId;
              const { palette } = config;

              return (
                <button
                  key={themeId}
                  onClick={() => handleSelect(themeId)}
                  disabled={saving}
                  className={`relative overflow-hidden transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    isSelected
                      ? 'ring-2 ring-accent ring-offset-2 ring-offset-card'
                      : 'hover:opacity-90'
                  }`}
                  style={{
                    aspectRatio: '85.6 / 54',
                    borderRadius: 12,
                    backgroundColor: palette.background,
                  }}
                  aria-label={config.name}
                  aria-pressed={isSelected}
                >
                  <Motif color={palette.motif} />

                  {/* Mini card content */}
                  <div className="absolute inset-0 p-2 flex flex-col">
                    <div className="flex-1" />
                    <div className="flex items-baseline justify-between">
                      <span
                        style={{
                          color: palette.brandText,
                          fontSize: 8,
                          fontWeight: 700,
                          letterSpacing: '1px',
                        }}
                      >
                        SIKA
                      </span>
                      <span
                        style={{
                          color: palette.nameText,
                          fontSize: 7,
                          letterSpacing: '0.05em',
                        }}
                      >
                        {config.name}
                      </span>
                    </div>
                  </div>

                  {/* Selected check */}
                  {isSelected && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                      <Check className="w-3 h-3 text-black" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="px-5 pb-5 pt-1">
            <p className="text-muted-foreground text-xs text-center">
              Inspired by Adinkra symbols and Ghanaian heritage.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

The picker is wrapped by a section component:

File: `src/components/settings/card-theme-picker.tsx` (whole file — lines 1–33)

```tsx
'use client';

import { useAuthStore } from '@/stores/auth-store';
import { ThemePicker } from '@/components/cycle-card/theme-picker';
import { CYCLE_CARD_THEMES, type CycleCardTheme } from '@/types/card-theme';
import { CardSurface } from '@/components/dashboard/cycle-card';

export function CardThemePicker() {
  const { profile } = useAuthStore();
  const themeId = (profile?.card_theme as CycleCardTheme) ?? 'sankofa';
  const config = CYCLE_CARD_THEMES[themeId] ?? CYCLE_CARD_THEMES.sankofa;
  const userName = profile?.full_name?.toUpperCase() ?? 'YOUR NAME';

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-foreground font-semibold">Card Style</h2>
        <ThemePicker />
      </div>
      <p className="text-muted-foreground text-xs mb-4">
        {config.name}{config.meaning ? ` — ${config.meaning}` : ''}
      </p>

      <div className="w-full">
        <CardSurface
          themeId={themeId}
          cycleNet={2426}
          userName={userName}
        />
      </div>
    </div>
  );
}
```

#### Layout
- The Settings section card titled **"Card Style"** with a `<ThemePicker>`-rendered "Change card" link in the right of the title row.
- Below the title: muted xs subtitle showing `{name}{ — meaning?}`
  (e.g. "Sankofa — Learn from the past"; copper/emerald/amber/obsidian
  show only the name).
- Below: a **live full-size preview** of the user's current card via
  `<CardSurface>` with a mock `cycleNet={2426}` and the user's name in
  uppercase (or `"YOUR NAME"` fallback).

#### Modal layout (when "Change card" is tapped)
- A `Dialog` with `max-w-md` (28 rem ≈ 448 px), `rounded-3xl`,
  `overflow-hidden`.
- Top bar: 56-px header with title "Choose your card" + custom × close
  (the dialog's built-in close button is suppressed via
  `showCloseButton={false}`).
- Body: **2-column grid**, gap `12 px`, padding `20 px`,
  `max-h-[70vh]` scrollable. Cards use real card aspect ratio
  (85.6/54) at half-width.
- Each option:
  - `aspectRatio: 85.6 / 54`, `borderRadius: 12 px` (smaller than the
    full card's 20 px)
  - Background: `palette.background`
  - Motif rendered at full opacity behind content
  - Bottom row: tiny SIKA wordmark (8 px, weight 700) on left, theme
    name (7 px) on right
  - **No EMV chip, no balance, no user name** in the mini preview.
- Selected state: 2 px accent ring with 2 px offset against
  `bg-card`, plus a 20-px circular accent badge with `Check` icon
  in the top-right corner.
- Footer: "Inspired by Adinkra symbols and Ghanaian heritage." (xs muted, centered)

#### Tap handler — direct profile update, optimistic
```ts
const handleSelect = async (themeId) => {
  if (themeId === selected || !user || saving) return;
  const prev = selected;
  setSelected(themeId);          // optimistic local update
  setSaving(true);
  setOpen(false);                // close dialog immediately

  const { error } = await supabase
    .from('profiles')
    .update({ card_theme: themeId })
    .eq('id', user.id);

  setSaving(false);

  if (error) {
    setSelected(prev);            // rollback
    toast.error('Failed to update card style');
    return;
  }
  if (profile) setProfile({ ...profile, card_theme: themeId });   // persist to auth store
};
```

- **No "Save" button.** Tap = commit.
- Same-theme taps are a no-op (early return).
- The dialog closes *before* the server confirms, but the local
  selection has already updated, so the live preview behind the
  dialog reflects the change instantly.
- On error: rollback `selected` and show a toast. The auth-store
  `profile.card_theme` is *not* updated until success.

#### Live preview on Home
Yes — the dashboard reads `profile?.card_theme` directly
(`dashboard/page.tsx:330`):

```tsx
theme={(profile?.card_theme ?? 'sankofa') as import('@/types/card-theme').CycleCardTheme}
```

Once `setProfile` has fired in the auth store, the dashboard's
`CycleCard` re-renders with the new theme without a navigation.

---

## 6. Profile Update Path

### Column constraints
File: `supabase/migrations/0014_card_theme.sql` (initial — superseded
by 0028):

```sql
alter table profiles
  add column card_theme text default 'classic_gold' not null
  check (card_theme in (
    'classic_gold','rose_gold','champagne','platinum','black_on_black','dual_tone'
  ));
update profiles set card_theme = 'classic_gold' where card_theme is null;
```

> The pre-heritage rebrand had 6 different theme names (`classic_gold`
> etc.). These no longer exist anywhere in the client and were
> replaced wholesale.

File: `supabase/migrations/0028_heritage_cards.sql` (current source of truth):

```sql
-- 0028_heritage_cards.sql (corrected)

-- DROP old constraint first so UPDATE can succeed
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_card_theme_check;

-- Now migrate values freely
UPDATE profiles
SET card_theme = 'sankofa'
WHERE card_theme IS NULL
   OR card_theme NOT IN (
     'sankofa', 'gye_nyame', 'adinkrahene',
     'copper', 'emerald', 'amber', 'obsidian'
   );

-- Add new constraint with NULL tolerance
ALTER TABLE profiles
ADD CONSTRAINT profiles_card_theme_check
CHECK (card_theme IS NULL OR card_theme IN (
  'sankofa', 'gye_nyame', 'adinkrahene',
  'copper', 'emerald', 'amber', 'obsidian'
));

-- Default + NOT NULL
ALTER TABLE profiles
ALTER COLUMN card_theme SET DEFAULT 'sankofa';

ALTER TABLE profiles
ALTER COLUMN card_theme SET NOT NULL;
```

So the live constraint is:
- Type: `text`
- `NOT NULL`
- `DEFAULT 'sankofa'`
- `CHECK (card_theme IS NULL OR card_theme IN (the 7 heritage values))`

> **Drift between schema and TS:** the CHECK still tolerates `NULL`
> for safety even though `NOT NULL` is set; the TS type
> (`Profile.card_theme?: CardTheme`) treats it as optional but it's
> always populated server-side.

### Mutation
**Direct Supabase update from the client.** No `/api/...` route.

```ts
await supabase
  .from('profiles')
  .update({ card_theme: themeId })
  .eq('id', user.id);
```

(See §5 for the surrounding optimistic-update flow.)

There is an `/api/profile/theme/route.ts` file — but it handles
`theme_preference` (light/dark mode), **not** `card_theme`. Don't
confuse them.

### Optimistic UI
Yes — the picker updates `selected` (local) and closes the dialog
immediately, then writes to Supabase. On error it rolls back
`selected` and toasts. On success, it copies the new value into the
auth store via `setProfile({ ...profile, card_theme: themeId })`.

### Cache invalidation
File: `src/lib/revalidation.ts` (line 30):

```ts
card_theme: ['/dashboard', '/settings'],
```

This is the entity → routes map for revalidation. The picker doesn't
explicitly call `revalidateForEntity('card_theme')` — it relies on
the auth-store `setProfile` triggering re-renders. iOS doesn't have
this concern; just bump local state.

---

## 7. `card_theme_available` HintCard

Defined in the HintId union — `src/lib/hints.ts` line 14.

Rendered above the `CardThemePicker` section in Settings —
`src/app/(app)/settings/page.tsx` (lines 245–254):

```tsx
{/* Card Style picker */}
<div className="mb-6">
  <HintCard
    hintId="card_theme_available"
    title="Customize your card"
    body="Choose from 7 heritage-themed card styles inspired by Adinkra symbols and Ghanaian craft. Tap 'Change card' to browse."
    className="mb-4"
  />
  <CardThemePicker />
</div>
```

- **Title:** "Customize your card"
- **Body:** "Choose from 7 heritage-themed card styles inspired by Adinkra symbols and Ghanaian craft. Tap 'Change card' to browse."
- **Location:** Settings page, immediately above the `CardThemePicker`
  section (which contains the live preview + "Change card" button).
- Once dismissed, the `dismissed_hints` table row prevents re-render
  on subsequent visits. Dismiss does **not** affect anything else
  (the picker section remains visible regardless).
- Default `HintCard` chrome (no `variant="inline"` override here).

---

## 8. Animations / Transitions

Web-side animations are minimal. Specifically:

- **Theme change:** *no* transition. The `CardSurface` swaps theme
  on the next render. `palette.background` is a plain inline style;
  there's no CSS transition on `backgroundColor`.
- **Balance number swap:** There IS a small `motion.div` keyed on
  `amountKey` (the balance value) — when the balance changes, it
  animates `opacity 0.35 → 1, y 6 → 0` over 220 ms ease-out
  (`cycle-card.tsx:69–77`). Skipped on first mount via the `mounted`
  ref.
- **Mouse tilt** (web only): ±10° rotateX/rotateY, sprung
  (`stiffness: 180, damping: 22`).
- **Press feedback:** `whileTap={{ scale: 0.985 }}`.
- **Picker dialog entrance:** uses Radix `Dialog` defaults (the
  shadcn-ui themed wrapper). Standard fade + scale.
- **Picker grid options:** `transition-all` Tailwind utility — only
  the focus/selected ring fades; no entrance stagger.
- **No haptics, no sound.** Web has no haptic API; iOS can add a
  selection feedback if desired (not present on web).

iOS port:
- Match: no theme-change cross-fade.
- Match: small balance-swap fade is nice-to-have if iOS already has
  similar animation infra.
- Skip: mouse tilt (no analog on touch).
- Add: `.sensoryFeedback(.selection, trigger: theme)` on the picker
  options would be a sensible iOS-only enhancement (not in web).

---

## 9. Settings Page Section Order

File: `src/app/(app)/settings/page.tsx` (full layout). Top-to-bottom:

1. Page heading **"Settings"** (line 205)
2. **`<AppearanceSection />`** — light/dark/system toggle (line 208)
3. **Currency** card with link to `/settings/currency` (lines 210–222)
4. **`<HapticsSection />`** (line 225)
5. **`<NotificationSettings />`** — push notifications, gated by `experimental_push_notifications` (line 228)
6. **Income Sources** (with optional `settings_income_sources` `HintCard` if no sources) (lines 230–243)
7. **`HintCard hintId="card_theme_available"`** + **`<CardThemePicker />`** ← **Phase 6's slot** (lines 245–254)
8. Form (`<form onSubmit={handleSubmit(onSaveProfile)}>`) containing:
   - Total Monthly Income (read-only)
   - Budget Month (cycle_start_day input)
   - Budget Split (needs/wants/savings %)
   - "Save changes" button
9. **Categories** (with optional `settings_categories` HintCard) — grouped by bucket, plus income/adjustment sections, plus archived dropdown
10. **App preferences** — "Reset onboarding hints" button
11. **Sign out** button
12. **`<DangerZone />`** (delete account)
13. Privacy policy link

> **iOS Phase 6 placement:** the theme picker section sits between
> Income Sources and the Budget form. iOS's mini-Settings extension
> should preserve this relative ordering so future Settings sections
> can land in the right slots without reflow.

---

## iOS Implementation Notes (Phase 6)

> Path 2: extend the existing iOS Settings shell to include a Card
> Style section + theme picker, plus refactor the `CycleCard` to be
> theme-driven instead of a hard-coded Sankofa placeholder.

### Models

```swift
// Mirror src/types/card-theme.ts CycleCardTheme union (7 cases)
enum CycleCardTheme: String, Codable, CaseIterable {
  case sankofa
  case gyeNyame    = "gye_nyame"
  case adinkrahene
  case copper
  case emerald
  case amber
  case obsidian
}

// Mirror ThemeConfig
struct HeritageThemeConfig: Identifiable {
  let id: CycleCardTheme
  let name: String
  let meaning: String?
  let palette: HeritageThemePalette
}

struct HeritageThemePalette {
  let background: Color
  let motif: Color
  let chipPrimary: Color
  let chipSecondary: Color
  let balanceText: Color
  let nameText: Color
  let brandText: Color
}

// Static registry — port directly from CYCLE_CARD_THEMES.
extension CycleCardTheme {
  static let configs: [CycleCardTheme: HeritageThemeConfig] = [
    .sankofa: .init(
      id: .sankofa, name: "Sankofa", meaning: "Learn from the past",
      palette: .init(
        background: Color(hex: 0x0D1929),
        motif:      Color(hex: 0xD4A017),
        chipPrimary: Color(hex: 0xC9A94A),
        chipSecondary: Color(hex: 0xA88938),
        balanceText: Color(hex: 0xE8D9B8),
        nameText:    Color(hex: 0xE8D9B8),
        brandText:   Color(hex: 0xD4A017))),
    // ... 6 more — copy verbatim from §2 of this audit.
  ]
  var config: HeritageThemeConfig { Self.configs[self] ?? Self.configs[.sankofa]! }
}
```

### Color and gradient handling

There are **no gradients** in any theme. Per-theme `palette.background`
is a single solid color. SwiftUI:

```swift
RoundedRectangle(cornerRadius: 20)
  .fill(theme.config.palette.background)
  .overlay(
    RoundedRectangle(cornerRadius: 20)
      .stroke(.white.opacity(0.10), lineWidth: 1)   // border-white/10
  )
```

For the balance color rules (matches `CardSurface`):

```swift
extension HeritageThemePalette {
  func balanceColor(forNet net: Decimal) -> Color {
    if net < 0 { return Color(hex: 0xF43F5E) }       // red
    if net == 0 { return Color(hex: 0xA1A1AA) }      // gray
    return self.balanceText
  }
}
```

The `−` prefix uses U+2212 (minus sign), **not** U+002D (hyphen):
`"−"` literal.

### SVG motif rendering

All 7 motifs are pure stroked geometry with no `defs`. Strategy:
**translate each SVG `path` / `line` / `circle` to a SwiftUI `Shape`
that draws into a 100×100 unit square**, then scale-to-fit the
positioned overlay frame. Per-motif notes:

| Motif | Complexity | iOS approach |
| --- | --- | --- |
| Sankofa | 3 cubic-bezier paths + 2 lines + 1 dot | `Path` with `.move(to:)` + `.addCurve(to: control1: control2:)` + `.addLine(to:)`; one `Circle` for center |
| Gye Nyame | 1 line + 2 cubic-bezier paths + 2 lines | Same pattern; `.miterLimit` or `.lineJoin: .round` for the curls |
| Adinkrahene | 3 stroked circles + 1 dot | Trivial — `ForEach([44, 30, 16]) { Circle().stroke(color, lineWidth: 2) }` |
| Copper | 5 elliptical-arc paths from `(100,*)` | `Path.addArc` (use `addRelativeArc` w/ start/end angles computed from chord) OR `.addCurve` with cubic Bezier approximation |
| Emerald | 4 sinusoidal `Q...T` paths spanning width | `Path.addQuadCurve` 5× per band; or sample as `.move`/`.addLine` at high density |
| Amber | 13 filled circles + 1 closed 8-point poly | `Circle().frame().position(x:y:)` ×13 + 1 `Path` for the star |
| Obsidian | 5 stroked circles + 1 dot (compound path) | Same as Adinkrahene, denser. `ForEach([44, 34, 24, 14, 6])` |

For exact path data, **port verbatim from §3 above**. Don't redraw —
the artwork has been hand-tuned (e.g. Sankofa's curls).

Default to a simple SwiftUI `Shape`-per-motif approach. Do not pull in
an SVG parsing library — the small fixed set makes literal-translation
faster.

Stroke widths are SVG-space (i.e. relative to 100×100 viewBox). Apply
via `.stroke(color, lineWidth: <svg width>)` *before* scaling, OR
divide by the scale factor when scaling the path.

### Motif positioning

Each motif has a precise overlay position (right %, top %, width %,
height %, opacity). Reproduce these as `frame` + `offset` modifiers
on a parent `ZStack` cell. Positioning recap:

| Motif | Position | Size | Opacity | Notes |
| --- | --- | --- | --- | --- |
| Sankofa | right: 12%, vertical-center | 22% × 55% | 0.70 | Centered around translateY(-50%) |
| Gye Nyame | right: 12%, vertical-center | 22% × 55% | 0.72 | Same as Sankofa |
| Adinkrahene | right: 12%, vertical-center | 22% × 55% | 0.75 | Same |
| Copper | full card overlay | 100% × 100% | 0.60 | preserveAspectRatio="xMaxYMin slice" — anchor top-right, fill |
| Emerald | left/right anchored, top: 30% | 100% × 40% | 0.50 | preserveAspectRatio="none" — stretch |
| Amber | right-half | 50% × 100% | 0.70 | xMaxYMin slice |
| Obsidian | right: 12%, vertical-center | 30% × 70% | 0.70 | Slightly larger than Adinkra trio |

### CycleCard refactor

Refactor your existing iOS `CycleCard` view to take a
`theme: CycleCardTheme` parameter (default `.sankofa`):

```swift
struct CycleCardSurface: View {
  let themeId: CycleCardTheme
  let cycleNet: Decimal
  let userName: String

  private var palette: HeritageThemePalette { themeId.config.palette }
  private var balanceColor: Color { palette.balanceColor(forNet: cycleNet) }
  private var prefix: String { cycleNet < 0 ? "−" : "" }

  var body: some View {
    ZStack(alignment: .topLeading) {
      palette.background
      MotifLayer(theme: themeId, color: palette.motif)   // dispatches to per-theme shape
      VStack(alignment: .leading) {
        EmvChip(primary: palette.chipPrimary, secondary: palette.chipSecondary)
          .frame(width: 42, height: 32)
        Spacer()
        // Balance
        Text("\(prefix)\(formatCurrency(abs(cycleNet)))")
          .font(.system(size: 32, weight: .bold, design: .monospaced))
          .foregroundStyle(balanceColor)
        Spacer()
        HStack(alignment: .lastTextBaseline) {
          Text(userName)
            .font(.system(size: 11, design: .monospaced))
            .tracking(1.1)
            .textCase(.uppercase)
            .foregroundStyle(palette.nameText)
            .lineLimit(1)
            .truncationMode(.tail)
          Spacer()
          Text("SIKA")
            .font(.system(size: 13, weight: .bold))
            .tracking(2.4)
            .foregroundStyle(palette.brandText)
        }
      }
      .padding(EdgeInsets(top: 20, leading: 24, bottom: 20, trailing: 24))
    }
    .aspectRatio(85.6 / 54, contentMode: .fit)
    .clipShape(RoundedRectangle(cornerRadius: 20))
    .overlay(RoundedRectangle(cornerRadius: 20).stroke(.white.opacity(0.10), lineWidth: 1))
  }
}
```

The wrapping `CycleCard` adds the bottom Received/Spent/Expected
stats row (outside the card surface) and tap → cycle-detail. For
Phase 6, leaving the tap as a no-op is fine; Phase 6.5 wires up
`CycleDetailView`.

**Default to `.sankofa`** when `profile.cardTheme` is nil/unknown:

```swift
let theme = CycleCardTheme(rawValue: profile?.cardTheme ?? "sankofa") ?? .sankofa
```

### Settings extension (Path 2)

Add a section to the iOS Settings shell, sandwiched between the
existing surfaces in the same relative slot as web (between Income
Sources and Budget settings). Match the section card chrome the iOS
codebase already uses for other Settings sections.

```swift
struct CardStyleSection: View {
  @EnvironmentObject var profileState: ProfileState
  @State private var pickerOpen = false

  private var theme: CycleCardTheme {
    CycleCardTheme(rawValue: profileState.profile?.cardTheme ?? "sankofa") ?? .sankofa
  }

  var body: some View {
    SettingsCard {
      HStack {
        Text("Card Style").font(.headline)
        Spacer()
        Button("Change card") { pickerOpen = true }
          .font(.subheadline.weight(.medium))
          .foregroundStyle(.tint)
      }
      Text(theme.config.subtitleLine)         // "Sankofa — Learn from the past"
        .font(.caption).foregroundStyle(.secondary)
        .padding(.bottom, 12)

      // Live preview — full-size CardSurface with mock balance
      CycleCardSurface(themeId: theme,
                       cycleNet: 2426,
                       userName: profileState.profile?.fullName?.uppercased() ?? "YOUR NAME")
    }
    .sheet(isPresented: $pickerOpen) {
      ThemePickerSheet(selected: theme) { picked in
        Task { await profileState.updateCardTheme(picked) }
        pickerOpen = false
      }
      .presentationDetents([.medium, .large])
    }
  }
}

extension HeritageThemeConfig {
  var subtitleLine: String { meaning.map { "\(name) — \($0)" } ?? name }
}
```

The picker sheet:

```swift
struct ThemePickerSheet: View {
  let selected: CycleCardTheme
  let onPick: (CycleCardTheme) -> Void

  private let columns = [GridItem(.flexible(), spacing: 12),
                         GridItem(.flexible(), spacing: 12)]

  var body: some View {
    NavigationStack {
      ScrollView {
        LazyVGrid(columns: columns, spacing: 12) {
          ForEach(CycleCardTheme.allCases, id: \.self) { theme in
            ThemePickerCard(theme: theme, isSelected: theme == selected)
              .onTapGesture { onPick(theme) }
          }
        }
        .padding(20)
        Text("Inspired by Adinkra symbols and Ghanaian heritage.")
          .font(.caption).foregroundStyle(.secondary)
          .frame(maxWidth: .infinity)
          .padding(.bottom, 20)
      }
      .navigationTitle("Choose your card")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .navigationBarTrailing) {
          Button("Close") { /* dismiss */ }
        }
      }
    }
  }
}

struct ThemePickerCard: View {
  let theme: CycleCardTheme
  let isSelected: Bool
  var body: some View {
    ZStack(alignment: .topTrailing) {
      ZStack(alignment: .bottom) {
        theme.config.palette.background
        MotifLayer(theme: theme, color: theme.config.palette.motif)
        HStack(alignment: .lastTextBaseline) {
          Text("SIKA")
            .font(.system(size: 8, weight: .bold)).tracking(1.2)
            .foregroundStyle(theme.config.palette.brandText)
          Spacer()
          Text(theme.config.name)
            .font(.system(size: 7)).tracking(0.5)
            .foregroundStyle(theme.config.palette.nameText)
        }
        .padding(8)
      }
      .aspectRatio(85.6 / 54, contentMode: .fit)
      .clipShape(RoundedRectangle(cornerRadius: 12))
      .overlay {
        if isSelected {
          RoundedRectangle(cornerRadius: 12)
            .stroke(.tint, lineWidth: 2)
            .padding(-4)        // ring offset
        }
      }
      if isSelected {
        Circle().fill(.tint).frame(width: 20, height: 20)
          .overlay(Image(systemName: "checkmark").font(.system(size: 10, weight: .bold)).foregroundStyle(.black))
          .padding(6)
      }
    }
  }
}
```

Mini-card content matches web: only "SIKA" wordmark + theme name in
the bottom row. **No EMV chip, no balance, no user name.**

### `card_theme_available` HintCard

Phase 4 should already have shipped `HintId.cardThemeAvailable` on
iOS. Add a `HintCard` consumer in Settings, **above** the
`CardStyleSection`:

```swift
HintCard(
  id: .cardThemeAvailable,
  title: "Customize your card",
  body: "Choose from 7 heritage-themed card styles inspired by Adinkra symbols and Ghanaian craft. Tap 'Change card' to browse."
)
CardStyleSection()
```

If `HintId.cardThemeAvailable` does not yet exist on iOS, add it to
the iOS HintId enum (matching the web string `"card_theme_available"`).

### Profile model

Confirm the iOS `Profile` model has a `cardTheme: String?` (or
`CycleCardTheme?`) field with `CodingKey "card_theme"`. If not, add
it:

```swift
struct Profile: Codable {
  // ...
  var cardTheme: String?
  enum CodingKeys: String, CodingKey {
    // ...
    case cardTheme = "card_theme"
  }
}
```

> Web uses `string` for `card_theme` and casts to `CycleCardTheme` at
> the consumer. iOS can do the same (decode as String, then map via
> `CycleCardTheme(rawValue:)` with `.sankofa` fallback) to be tolerant
> of future server-side additions.

Update path on iOS — direct Supabase, optimistic, with rollback on error:

```swift
extension ProfileState {
  func updateCardTheme(_ theme: CycleCardTheme) async {
    let prev = self.profile?.cardTheme
    self.profile?.cardTheme = theme.rawValue          // optimistic

    do {
      try await supabase
        .from("profiles")
        .update(["card_theme": theme.rawValue])
        .eq("id", value: userID)
        .execute()
    } catch {
      self.profile?.cardTheme = prev                  // rollback
      Toast.shared.error("Failed to update card style")
    }
  }
}
```

### Behavioral notes

- **Theme change applies immediately on Home** — no save step, no
  refresh. iOS should match: optimistic update flips the local
  `Profile`, the bound `CycleCard` re-renders.
- **Cross-platform parity:** writing on iOS must show on web on next
  load (and vice versa). Both write to the same `profiles.card_theme`
  column.
- **Default fallback:** unknown theme strings (e.g. legacy
  `'classic_gold'` from migration 0014, or new ones added server-side
  later) should silently degrade to `.sankofa` rather than crashing.
- **No haptics on web.** Suggest adding `.sensoryFeedback(.selection,
  trigger: theme)` on iOS picker option taps as a tasteful platform
  affordance.

### Out of scope for Phase 6

- **Cycle Details navigation:** web has `/dashboard/cycle-detail`;
  iOS Phase 6.5 will mirror. For Phase 6, leave the card tap as a
  no-op (or stub navigation).
- **Other Settings sections:** keep the iOS Settings minimal; only
  the Card Style section + its hint are part of Phase 6.
- **Theme animations:** web has none. iOS should not add cross-fades.
- **Mouse-tilt:** desktop-only on web; skip entirely on iOS.

### Source-of-truth files for iOS Phase 6 prompt

If the Phase 6 prompt embeds verbatim source, the load-bearing files are:

1. `src/types/card-theme.ts` — type union + `CYCLE_CARD_THEMES` map (127 lines)
2. `src/components/cycle-card/motifs.tsx` — all 7 SVG motifs (156 lines)
3. `src/components/cycle-card/chip.tsx` — EMV chip SVG (16 lines)
4. `src/components/dashboard/cycle-card.tsx` — `CardSurface` + `CycleCard` (209 lines)
5. `src/components/cycle-card/theme-picker.tsx` — Dialog picker (148 lines)
6. `src/components/settings/card-theme-picker.tsx` — Settings section wrapper (33 lines)
7. `src/app/(app)/settings/page.tsx` lines 245–254 — HintCard + section placement
8. `supabase/migrations/0028_heritage_cards.sql` — column constraints (28 lines)
