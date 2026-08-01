# Designer style guide (`gui/`)

> CSSは頑張らない。One rule governs everything below: **ride Tailwind's stock
> scales; the only things we customize are what Tailwind genuinely can't source
> — the brand color palette and the CJK font stack.** Effort goes into edit UX,
> not chrome styling.

Policy home: [`docs/agents/gui.md`](../docs/agents/gui.md) § CSS foundation.
This file is the operational how-to that policy points at.

## The one rule

Layout, spacing, type, radius, borders — express them with **plain, unprefixed
Tailwind v4 utilities at their stock values**. Do **not** redefine Tailwind's
scales (`--text-*`, `--spacing`, `--radius-*`, border widths) in `@theme`. If a
design wants a different size, it picks a different stock step — it does not
mint a custom value.

| Concern | Use | Never |
| --- | --- | --- |
| Font size | `text-sm` (14) / `text-base` (16) / `text-lg` (18) / `text-xl` (20) — Tailwind stock | a `--text-*` override in `@theme` |
| Spacing (margin/padding/gap) | `p-*` `m-*` `gap-*` on the stock 4px grid (`1`=4, `2`=8, `3`=12, `4`=16, `6`=24) | a `--spacing` override |
| Radius | `rounded-md` (6px = our corner) and siblings — stock | a `--radius-*` override |
| Border | `border` (1px), `border-2`, etc. — stock widths | a custom border-width scale |
| Color | our tokens, bridged (see below) | hardcoded hex in a utility |

Rationale: 16px base already equals Tailwind's default, and our 6px corner is
exactly `rounded-md` — so once the palette is bridged, there is nothing left to
customize. A custom scale is a maintenance tax with no payoff; a stock scale is
self-documenting and every agent already knows it.

## The customizations Tailwind can't source: color + CJK font

Two things Tailwind genuinely cannot provide, so they stay ours.

**Color** — our warm-paper palette and the light/dark switch. The palette lives
as data in
[`designer/src/theme/tokens.ts`](designer/src/theme/tokens.ts) (`LIGHT_THEME` /
`DARK_THEME`), emitted as `--sj-*` custom properties on the app/mount root per
scheme, and bridged into Tailwind via `@theme inline` **color maps only** (see
[`designer-app/src/tailwind.css`](designer-app/src/tailwind.css)):

```css
@theme inline {
  --color-surface: var(--sj-surface);
  --color-text:    var(--sj-text);
  /* …colors only. No --text-*, no --spacing, no --radius-*. */
}
```

`inline` is required: the tokens live on a non-`:root` scope, so the non-inline
form resolves to empty. Address colors through the generated utilities
(`bg-surface`, `text-muted`, `border-border`, `text-accent`), never a raw hex.
The `--sj-*` names are an **internal** value source now — the Designer ships as
an own-page app (sidekiq-web style), so there is no host-facing theming
contract.

**CJK font stack** — `--sj-font-family` (Hiragino → Noto Sans JP → system-ui),
applied at the page root. Tailwind's stock `font-sans` is a Latin stack, so the
Japanese-first family stays a token.

### Escape hatch: raw `--sj-*` in arbitrary values

The scale rule bans redefining Tailwind's scales in `@theme` (`--text-*`,
`--spacing`, `--radius-*`) — it does **not** ban reading a raw `--sj-*` token
inside a one-off Tailwind arbitrary value where no stock step fits, e.g.
`rounded-[calc(var(--sj-radius)+3px)]` for a slightly-rounder panel corner.
That's the escape hatch, not a second scale — reach for a stock step first
(`rounded-md`, `p-2`) and only drop to `--sj-*` arbitrary values for genuine
one-offs.

## Namespace: `sj` for everything we author

Two prefixes, one family:

- **`--sj-*`** — our CSS custom properties (the color + font tokens above, plus
  the raw primitives used in arbitrary-value escape hatches).
- **`.sj-*`** — our hand-written CSS classes (the carve-out below) and the
  test-hook marker classes tests `querySelector`.
- **Unprefixed** — Tailwind utilities.

Do not touch the **`@shojiku/`** package scope (that's a JS import path, not
CSS) or the **"Shojiku"** product name in copy.

## Hand-CSS carve-out (`styles.css`, `.sj-*` classes)

Write raw CSS **only where a utility genuinely can't express it**. The current
irreducible set:

- Canvas SVG paint (box-overlay stroke/fill on hover/selected/focus; handles,
  guides, grid, drag-ghost, drop-indicator) — SVG presentation attributes over
  the engine render, a deliberate hand-CSS decision.
- The contenteditable chip editor and its imperative `{key}` chips.
- Rendering-status dim + the place-chip pulse keyframe.

Everything else — app shell, toolbars, panels, pickers, banners — is utilities.
Shared utility strings live in the `ui/chrome.ts` modules
(`BTN`/`INPUT`/`PANEL`/…), not re-typed per call site.

## Behavior primitives: Headless UI, styled by us

Dialog / menu / listbox / tabs / popover / switch ride `@headlessui/react`
**unstyled** — the behavior is theirs, the look is entirely our utilities and
tokens. Portaled overlays escape the mount-root scope, so theme tokens live on
`document.documentElement` and the page-root base (typography, `border-box`,
form-control `font: inherit`) is applied there too.

## Icons: a third-party set is allowed for CHROME, never for domain marks

`ui/icons.tsx` is hand-drawn today, and that is a consequence, not a policy —
there is no zero-dependency rule for icons (the `gui/` dependency posture is
deliberately liberal; only `engine/` is strict). Adopting a set is fine, and
the natural candidate is one from the Tailwind Labs family, since Tailwind and
Headless UI are already dependencies.

The line to draw is by **what the icon means**, not by where it came from:

- **Generic chrome** — plus, minus, close, chevron, check, overflow dots,
  search, trash, help, undo/redo. A third-party set covers these well; import
  them rather than drawing them. A future batch of chrome work (quick-fix
  buttons, page thumbnails, a diff pane, restore points) is the moment this
  pays off.
- **Our domain's marks** — the layer tree's per-item-type marks, and the
  editor vocabulary a general-purpose set has no words for. These stay ours.

What an evaluation of Heroicons v2.2 (MIT, 325 outline icons) actually found,
so the next person does not re-derive it:

- It has **no text-alignment icons at all**, and none of the container-layout
  vocabulary (row/column, `alignItems` top/middle/bottom/stretch). Those are
  gdoc/Figma words; we draw them.
- Of the 19 item-type marks, 7 map cleanly — but `table`, `char_grid`,
  `repeat` and `container` all collapse onto two icons, and those four are
  exactly the ones that must read apart at row size. Also missing: a plain
  circle, a square checkbox, a diagonal line, a "T".
- Only the **24px set has outline** variants; 16 and 20 are solid-only. Our
  chrome is 16px outline, so importing means scaling 24 down (thinner strokes)
  or switching that surface to solid.

Mixing an imported set with `ui/icons.tsx` is fine — normalize both behind the
same wrapper contract (`currentColor`, `aria-hidden`, a `size` prop) so call
sites cannot tell which is which.

**The coverage angle, in favor of importing**: a hand-drawn icon is a function,
and the 100% function-coverage gate means every one needs a test that renders
it. Imported icons live in `node_modules` and are outside coverage. The more
generic icons a change adds, the more this argues for importing them.

## Trap: don't compose conflicting base utilities

Composing a shared const (`${BTN}`, which sets `bg-surface`) with an
unconditional override (`bg-accent`) does **not** reliably win — both are plain
`background-color`, so generated-CSS source order decides and the override may
lose. Write a dedicated string for the variant instead. State variants
(`hover:`, `aria-pressed:`, `data-*:`) are safe — the attribute selector raises
specificity.

## Toolbar chrome: reuse the rail parts

Format-toolbar surfaces (the slim-toolbar clusters, and any future one) reuse
the parts in
[`designer/src/toolbar/FormatToolbar.tsx`](designer/src/toolbar/FormatToolbar.tsx)
(rail/separator) plus the shared pickers in `designer/src/ui/`, rather than
re-inventing them:

- **`FMT_BTN`** — the one rail: fixed `h-8`, `inline-flex items-center
  justify-center`, so every control (letter glyph, icon, swatch, dropdown
  trigger) sits at the same height. New toolbar controls join this rail.
- **`ui/TipBubble.tsx`** — the instant tooltip (~300ms CSS delay via
  `group-hover/tip:delay-300`, inverse-token bubble), a shared `ui/` primitive.
  Native `title` is **banned on every icon-only control in the package**, not
  just toolbar ones: its OS-controlled delay (~1s) reads as "no tooltip". The
  shared primitives already carry it — `IconButton`, the `Menu` icon trigger
  and `HelpHint` each ship their own bubble, so a call site gets it for free
  and passes only `label`. For a one-off control, wrap it in
  `group/tip relative`; dropdowns render the bubble only while closed, and
  rows inside dropdowns get bubbles too. The bubble is `aria-hidden` and the
  accessible NAME stays on the control — never move a name into a bubble.
  The bubble is width-bounded, because a label may interpolate a
  document-derived name.
  **Constraint to know**: the bubble is `absolute` inside its wrapper, so a
  scrolling ancestor clips it — and in this app essentially every control has
  one (the app shell and the document-settings pane are both `overflow-y-auto`).
  It hangs DOWNWARD, so this only bites a control sitting at a scroller's
  bottom edge (measured: the lowest one today keeps 344px of room). Put a new
  icon-only control where it has room below, or the tooltip is the thing that
  gets cut.
  The ONE exception, documented in place, is the app header's document-title
  button: its visible text IS its accessible name (WCAG label-in-name), so the
  rename hint rides `title` as an accessible DESCRIPTION.
- **`ui/ColorSwatchPicker.tsx`** — the shared color popover (curated `SWATCHES`
  grid + native `<input type=color>` + clear; the `isHexColor` guard). Used for
  toolbar text-color/fill, the panel 塗り・枠線 cluster, and the border editor's
  pen — the caller owns the op it builds, so no hand-typed hex anywhere.
- **`Sep`** — the thin vertical rule between clusters (gdoc grouping).
- Dropdown triggers show the current value (style name, family, align glyph) +
  the shared `Caret`; icons come from `ui/icons.tsx`, never text glyphs —
  again package-wide, not toolbar-only (the layer tree's twisty and its
  per-item-type marks are icons for the same reason).

**Both rules are enforced by a test**, not by review alone:
`designer/src/ui/chromeConvention.test.ts` walks every source file in the
package and fails on a native `title=` DOM attribute or a banned text glyph.
Adding a new mark character to a control means the guard's character set is
incomplete — widen it in the same change rather than working around it.
- Value fields must fit their widest realistic value (`10.5`); note Chrome
  reserves indicator width inside datalist inputs even when hidden — the size
  field dropped its datalist for exactly this.

The conventions themselves (gdoc-parity, self-explanatory controls) are the
design-time rule in the gui-professional skill; this section is the how-to.
