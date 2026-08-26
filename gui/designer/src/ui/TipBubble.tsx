// The instant tooltip bubble (gdoc-style): shown ~300ms into a hover of the
// enclosing `group/tip` wrapper, hidden instantly on leave. Decorative — the
// accessible name stays on the control (native `title` is NOT used; its
// OS-controlled ~1s delay is what this replaces). Inverse-token colors read as a
// dark bubble on light chrome and vice versa. The tooltip of EVERY icon-only
// control in the Designer (STYLE.md § Toolbar chrome).
//
// Given an `id` it stops being decorative on BOTH channels at once, and the
// two go together on purpose:
//   - it becomes the control's `aria-describedby` target, which is how a
//     hover-only hint reaches a screen reader. Not the NAME: a name is re-read
//     on every visit, and these hints ride values that always resolve, so
//     folding one into a name rebuilds in audio exactly the permanent chrome
//     the visible-line rule rejects;
//   - and it reveals on keyboard FOCUS as well as hover, so a sighted keyboard
//     user is not the one person who cannot summon it.
// A bubble with no `id` stays hover-only, deliberately. Most label an icon-only
// button, where revealing on focus would be pure gain — but the category that
// must NOT get it is any tip group wrapping a FOCUSABLE TEXT FIELD, where the
// bubble would sit open over the rows below for as long as the user types.
// Known instances, as examples rather than as the definition: `StepperField`,
// `SeededField`, `fields.tsx`, `TableTextCells`, and `toolbar/TypographyGroup`'s
// font-size box — that last one carries an `originHint`, i.e. the same class of
// hint this `id` exists for, so it is the one most likely to be opted in next
// and the one where the trade-off has to be re-judged rather than assumed.
//
// The text is bounded: a label may interpolate a DOCUMENT-derived name (the
// styles-list row menu carries the style's own name), and an unbounded hostile
// name on a `whitespace-nowrap` bubble would paint a strip clean off the
// viewport. React escapes the text; `max-w` + `truncate` bound its width.

export function TipBubble({
  text,
  id,
  align = 'center',
}: {
  readonly text: string;
  readonly id?: string;
  /** Where the bubble hangs relative to its wrapper. `center` is the default
   * and right for an icon-only control sitting in open chrome. Use `start`
   * against a NARROW wrapper near a scroller's left edge: a centered bubble is
   * wider than the control it explains, so it overhangs on both sides and the
   * property panel (`overflow-y-auto`, hence clipping on x too) cuts the first
   * characters off — measured at 16px on the band editors' 太字 row, which is
   * how a hint that now reaches the keyboard would still arrive unreadable. */
  readonly align?: 'center' | 'start';
}) {
  const anchor = align === 'start' ? 'left-0' : 'left-1/2 -translate-x-1/2';
  // Opt-in, keyed on the same `id` that makes this a description — see the
  // header: a decorative bubble around a text input must not sit open while
  // the field has focus.
  const onFocus =
    id === undefined ? '' : ' group-focus-within/tip:opacity-100 group-focus-within/tip:delay-300';
  return (
    <span
      id={id}
      // Hidden from assistive tech ONLY while nothing points at it. A bubble
      // with an `id` is somebody's description, and an `aria-hidden` target is
      // not read.
      aria-hidden={id === undefined ? true : undefined}
      data-sj-tip
      className={`sj-tip pointer-events-none absolute ${anchor} top-[calc(100%+4px)] z-30 max-w-64 truncate whitespace-nowrap rounded-md bg-text px-2 py-1 text-xs text-bg opacity-0 transition-opacity duration-100 group-hover/tip:opacity-100 group-hover/tip:delay-300${onFocus}`}
    >
      {text}
    </span>
  );
}
