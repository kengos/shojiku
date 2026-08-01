// The instant tooltip bubble (gdoc-style): shown ~300ms into a hover of the
// enclosing `group/tip` wrapper, hidden instantly on leave. Decorative — the
// accessible name stays on the control (native `title` is NOT used; its
// OS-controlled ~1s delay is what this replaces). Inverse-token colors read as a
// dark bubble on light chrome and vice versa. The tooltip of EVERY icon-only
// control in the Designer (STYLE.md § Toolbar chrome).
//
// The text is bounded: a label may interpolate a DOCUMENT-derived name (the
// styles-list row menu carries the style's own name), and an unbounded hostile
// name on a `whitespace-nowrap` bubble would paint a strip clean off the
// viewport. React escapes the text; `max-w` + `truncate` bound its width.

export function TipBubble({ text }: { readonly text: string }) {
  return (
    <span
      aria-hidden
      data-sj-tip
      className="sj-tip pointer-events-none absolute left-1/2 top-[calc(100%+4px)] z-30 max-w-64 -translate-x-1/2 truncate whitespace-nowrap rounded-md bg-text px-2 py-1 text-xs text-bg opacity-0 transition-opacity duration-100 group-hover/tip:opacity-100 group-hover/tip:delay-300"
    >
      {text}
    </span>
  );
}
