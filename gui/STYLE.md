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

## Actions: emphasis and the ellipsis

Chrome is copied, never invented, and "copied" means from a NAMED source. Two
external rules govern how an action looks and what its label promises; both are
enforced by `designer/src/ui/actionConvention.test.ts` and
`designer/src/i18n/ellipsis.test.ts`, which walk the package source — so a
violation is a red gate, not a review finding.

### Emphasis — Material Design 3

One primary action per screen; **filled > outlined > text**. M3 names the two
failure modes explicitly: the same high-emphasis style on every action, and
treating the three tiers as interchangeable cosmetics. Our `Button` variants
map `primary`=filled, `default`=outlined, `ghost`=text (there is no
filled-tonal tier).
<https://m3.material.io/components/all-buttons>

- **A dialog is a screen**: its footer's confirming action is
  `<Button variant="primary">` and its dismissing action is `<Button>` — or
  `ghost` for a tertiary that is neither (the tutorial's *Clear progress*, the
  PDF preview's *Close*). Exactly one primary per footer, gated.
- **The work surface carries no primary.** A toolbar, a property panel, a
  menubar and the layer tree are PEER sets: the action you leave a canvas app
  with (Share / Download) is the only thing Docs, Figma and Canva ever fill,
  and electing an editing tool as primary is an argument with no answer. This
  is why the panel's `BTN`/`BTN_SM` rows below are not `Button`s and should not
  become them — they are peers by design, not un-migrated code.
  - **This is gated, in both directions.** Every footer carries exactly one
    primary, and every primary is inside a footer — bar an exact, self-checking
    list of sanctioned exceptions. Ranking footers alone left the complement
    unwatched, so a filled button added to a work surface passed every check;
    it is now a red gate rather than a design-time read. (Keying the rule on
    the DIRECTORY instead would have been wrong on arrival: three of the
    thirteen footers live under `panel/`.)
  - **Two surfaces sit outside a footer** (three lines), each pinned by
    `path:line`. The first is an EMPTY STATE: `shell/CanvasArea.tsx` fills its
    *Add text* CTA because, with no body items, it is the only thing on the
    page — that screen's primary rather than one voice among peers
    (`Designer.test.tsx` pins that it renders). The second
    is the RESTORE-POINTS dialog, which has no footer at all: its capture
    control belongs beside the name input it commits. That dialog holds the
    one-fill rule at RUNTIME instead — arming a row's restore makes that row
    the decision in front of the reader, so the standing capture button steps
    down to outlined for exactly that span and takes the fill back on cancel
    or on restore. Emphasis only; the button stays enabled.
    `SnapshotDialog.test.tsx` counts the fills in both states, because the
    defect this replaced was not a wrong button but two right ones at once.
    The other way round — demoting the armed row's restore and leaving the
    capture button filled — was rejected: it would leave a DESTRUCTIVE
    confirm's affirmative and its cancel looking identical, and put the one
    fill on a control that is not the decision being asked.
  - **A primary may not hide behind an indirection.** The gate reads the
    emphasis token on a `variant=`, and also refuses that token anywhere else
    in the two packages except a declared list — today the `ButtonVariant`
    union and the font-pack TIER, which is a homonym. A
    `const emphasis = … ? 'primary' : …` read three lines above the JSX would
    otherwise be invisible to it.
- **The filled accent is minted in exactly one place**, `ui/Button.tsx`'s
  `primary` variant. Hand-rolling `bg-accent … text-on-accent` onto a
  `<button>` is what made `grep 'variant="primary"'` under-report the real
  emphasis surface by more than half; the gate now refuses it. A STATE-prefixed
  accent (`aria-pressed:bg-accent`, `data-checked:bg-accent`) is a toggle
  indicator, not emphasis, and a filled `<span>` is a badge — neither is this
  rule's business, and both exclusions are pinned by their own tests.
- **Accent-coloured TEXT over a wide area behaves as a fill in peripheral
  vision** (measured: the tutorial hint, `text-accent underline` on
  `bg-chrome`, was the only thing a blurred first glance detected in the whole
  editor). So a salience judgement is about the AREA wearing the accent, not
  about `bg-*` alone. This one is a design-time read, not a gate.

### The ellipsis — Apple HIG

A control whose label ends in `…` opens another view and asks for more before
it proceeds; one without it acts immediately. The dialog's TITLE then matches
the label that opened it, minus the ellipsis.
<https://developer.apple.com/design/human-interface-guidelines/components/menus-and-actions/buttons/>

- The File menu's `Save…` / `Export…` promise the review pane; that pane's own
  confirm is `Save` / `Export` and ACTS. They are deliberately different keys
  (`app.save` / `menu.export` vs `review.confirm.save` / `review.confirm.export`),
  and the golden-path e2e matches both exactly rather than by substring.
- **The ellipsis is a property of the ACTION, not of the language**, so the set
  of chrome keys whose value ends in `…` is identical in every catalog — gated.
  A label that carried it in en and fil while reading as a noun phrase in
  ja/zh/hi is how this was first found.
- **It therefore belongs on a control and nowhere else.** No `<h1>`–`<h6>`
  heading may render an ellipsis label — gated. That same key was a section
  `<h3>`, promising a dialog no heading can open.
- **Not every trailing `…` is a control label.** A progress or placeholder
  string (`Saving…`, `Paste here…`) uses it in its ordinary sense and is
  exempt from the HIG reading — which is why the gate keys on PARITY and on
  HEADINGS rather than trying to classify a key as a control.
- **An opener earns the ellipsis by ASKING, not by opening.** Apple's wording
  is "requires additional input", so a view that merely SHOWS something takes
  none: *Keyboard shortcuts* and *Glossary* are terminal reference views and
  are correctly bare, while *Tutorial…* opens a launcher that asks which
  chapter to start — the same shape that gives *Container…* its ellipsis. The
  split is also what the gates allow: `shortcuts.title` and `glossary.title`
  are ONE key doing two jobs (the menu label AND the dialog `title=`), so an
  ellipsis on either would break the no-heading rule above and cost a key
  split; `menu.help.tutorial` is a label only.
- **A label QUOTED IN PROSE drops its ellipsis.** The in-app course cites menu
  paths ("Insert → Container", 「挿入」→「コンテナ」); the Microsoft Writing
  Style Guide and Google's developer documentation style guide both omit the
  trailing ellipsis when citing a command, because it belongs to the control as
  rendered rather than to the name. Gated by `tutorial/copy.test.ts` over both
  languages. Each language keeps its own delimiter — 「」 is the only device
  Japanese has for marking a label boundary in run-on kana/kanji, and English
  gets that free from capitalisation and the arrow — so the quoting difference
  between the two files is convention, not drift.
- Still open, and deliberately not fixed here: the title-matches-label half is
  unmet for several pairs (*Container…* opens "Insert a container"; *Download
  as PDF…* opens "PDF preview"). That is copy work across six catalogs.

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
  rows inside dropdowns get bubbles too. The accessible NAME stays on the
  control — never move a name into a bubble, and never append to a name
  something a bubble is saying: a name is re-read on every visit, so a hint
  that is always present becomes chrome in the audio channel exactly as a
  permanent line would in the visual one. The bubble is `aria-hidden` by
  DEFAULT, which makes it mouse-only; where the hint is worth having without a
  mouse, give the bubble an `id` and point the control's `aria-describedby` at
  it — and put `group/tip` on the whole FIELD rather than on the label, or
  hovering the control the hint is ABOUT shows nothing. The `id` is the single
  opt-in and turns on both channels: `TipBubble` drops its own `aria-hidden`
  AND starts revealing on keyboard focus. It is deliberately opt-in rather
  than the default, because of one category: **any tip group wrapping a
  focusable TEXT FIELD**, where a reveal-on-focus parks a tooltip over the rows
  below for as long as the user types. Known instances — examples, not the
  definition — are `StepperField`, `SeededField`, `fields.tsx`,
  `TableTextCells` and `toolbar/TypographyGroup`'s font-size box; the last
  carries an `originHint`, so it is the likeliest next opt-in and the one where
  the trade-off must be re-judged rather than assumed. A bubble near a scroller's left edge also
  wants `align="start"`: centred, it is wider than the control it explains and
  the property panel clips the first characters off. The band editors' origin
  hints are the worked example of all three.
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
- **`ui/ColorSwatchPicker.tsx`** — the shared color popover: the `ui/SwatchGrid`
  palette + native `<input type=color>` + clear, behind the `isHexColor` guard.
  Used for toolbar text-color/fill, the panel 塗り・枠線 cluster, and the border
  editor's pen — the caller owns the op it builds, so no hand-typed hex anywhere.
  The palette is a hue × darkness STRUCTURE (`ui/swatchPalette.ts`), not a flat
  list, so a reader who cannot distinguish the colours can reach one by counting
  to a column and a row; `ui/SwatchGrid` renders the axis labels and the readout
  line that names whatever is hovered or focused.
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
