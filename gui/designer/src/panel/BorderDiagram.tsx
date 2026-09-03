// The border editor's paper diagram: a 96×64 sheet whose four edges are click
// targets. It PAINTS the cascade-effective per-side state (so the diagram shows
// what the page will print, dashes and all) and reports which edge was clicked;
// deciding what a click authors is `borderOps`' job, threaded in as `onEdge`.

import type { ReactNode } from 'react';
import { HelpHint } from '../help/HelpHint';
import { useI18n } from '../i18n/context';
import { isHexColor } from '../ui/chipContrast';
import { SIDES, type Side } from './borderSides';
import type { BorderView } from './borderTypes';

/** The diagram box geometry (a 96×64 paper rect inset by 6px). */
const GEO: Readonly<Record<Side, { x1: number; y1: number; x2: number; y2: number }>> = {
  top: { x1: 6, y1: 6, x2: 90, y2: 6 },
  right: { x1: 90, y1: 6, x2: 90, y2: 58 },
  bottom: { x1: 6, y1: 58, x2: 90, y2: 58 },
  left: { x1: 6, y1: 6, x2: 6, y2: 58 },
};

/** The overlaid edge hit-zone rectangles (px in the 96×64 box). */
const HIT: Readonly<Record<Side, { left: number; top: number; width: number; height: number }>> = {
  top: { left: 0, top: 0, width: 96, height: 16 },
  bottom: { left: 0, top: 48, width: 96, height: 16 },
  left: { left: 0, top: 16, width: 16, height: 32 },
  right: { left: 80, top: 16, width: 16, height: 32 },
};

/** One edge's SVG: a faint dotted placeholder when off, else the effective line
 * (a second offset stroke for `double`), colored per the guarded effective color
 * on a fixed paper tint so authored colors read truthfully in both themes. */
function EdgeLine({ side, view }: { readonly side: Side; readonly view: BorderView }): ReactNode {
  const g = GEO[side];
  const width = view.width.effective[side];
  if (width <= 0) {
    return (
      <line
        x1={g.x1}
        y1={g.y1}
        x2={g.x2}
        y2={g.y2}
        stroke="#cbd5e1"
        strokeWidth={1}
        strokeDasharray="2 3"
      />
    );
  }
  const raw = view.color.effective[side];
  const color = isHexColor(raw) ? raw : '#111827';
  const stroke = Math.min(Math.max(width, 1), 4);
  const effective = view.style.effective[side] === '' ? 'solid' : view.style.effective[side];
  if (effective !== 'double') {
    // dashed/dotted preview the real pattern (3× / 1× the stroke), so the
    // diagram shows what the page will print, not just "a line is here".
    const dashes: Record<string, string | undefined> = {
      dashed: `${stroke * 3} ${stroke * 3}`,
      dotted: `${stroke} ${stroke}`,
    };
    return (
      <line
        x1={g.x1}
        y1={g.y1}
        x2={g.x2}
        y2={g.y2}
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={dashes[effective]}
      />
    );
  }
  const horiz = g.y1 === g.y2;
  const dx = horiz ? 0 : 1.5;
  const dy = horiz ? 1.5 : 0;
  return (
    <>
      <line
        x1={g.x1 - dx}
        y1={g.y1 - dy}
        x2={g.x2 - dx}
        y2={g.y2 - dy}
        stroke={color}
        strokeWidth={1}
      />
      <line
        x1={g.x1 + dx}
        y1={g.y1 + dy}
        x2={g.x2 + dx}
        y2={g.y2 + dy}
        stroke={color}
        strokeWidth={1}
      />
    </>
  );
}

export interface BorderDiagramProps {
  readonly view: BorderView;
  /** A `table` draws the map form as its OUTER frame only (inner ruling is the
   * table's own spec) — the editor notes this so the per-side controls don't
   * read as inner-cell borders. */
  readonly isTable: boolean;
  readonly onEdge: (side: Side) => void;
}

export function BorderDiagram({ view, isTable, onEdge }: BorderDiagramProps) {
  const { t } = useI18n();
  return (
    <div className="flex items-start gap-3">
      {/* The paper stays a PAPER TINT rather than a theme token, and for the
        reason `styles.css` states for the canvas grid and margin guide: what
        this box previews is the engine-rendered page, which is pixels and is
        white in either colour scheme, so an authored `#333` border has to read
        against white here exactly as it will there. What changed is how loudly
        it says so. At `#fcfcfa` it was a near-white slab — indistinguishable
        from the light chrome it sits on (`#fdfcfa`), and in dark chrome the
        brightest thing in the panel by a wide margin, outshouting every control
        that can actually be pressed. One step down, plus the hairline ring every
        other control in the panel wears, makes it read as a bounded object in
        both schemes while keeping ~15:1 against the guarded ink below.

        It also casts the PAGE's own shadow (`--sj-paper-shadow`, the token the
        canvas page uses). A fresh reader shown both schemes read the same box as
        "too loud" in dark and "hard to find at all" in light, where the tint sits
        a hair off the chrome behind it and only the ring separates them. A shadow
        answers the light half without touching the tint the dark half is about:
        it says "sheet of paper" by depth rather than by brightness. */}
      <div
        className="relative shrink-0 rounded-sm border border-border bg-[#f0eee9] shadow-[0_1px_3px_var(--sj-paper-shadow)]"
        style={{ width: 96, height: 64 }}
      >
        <svg
          viewBox="0 0 96 64"
          className="absolute inset-0"
          style={{ pointerEvents: 'none' }}
          aria-hidden="true"
        >
          {SIDES.map((side) => (
            <EdgeLine key={side} side={side} view={view} />
          ))}
        </svg>
        {SIDES.map((side) => (
          <button
            key={side}
            type="button"
            aria-pressed={view.width.effective[side] > 0}
            aria-label={t(`border.edge.${side}`)}
            // The edges ARE the control here, so they say so on hover rather
            // than relying on the cursor alone: a 5% wash is nearly invisible
            // on paper this light.
            className="absolute cursor-pointer border-0 bg-transparent p-0 hover:bg-black/10"
            style={HIT[side]}
            onClick={() => onEdge(side)}
          />
        ))}
      </div>
      <div className="min-w-0 flex-1">
        {/* The whole explanation — the ACTION (click an edge) and the ORDER
          (pen first, spreadsheet-style) — lives in this one `?`; there is no
          always-visible hint line, which is a line back in a cramped panel.
          It lives here rather than beside the section heading so all THREE
          hosts of this editor get it (decoration tab, canvas context menu,
          format toolbar). No "learn more": this component is presentational
          and is handed no glossary opener, like the content heading's hint. */}
        <div className="mb-1 flex justify-end">
          <HelpHint
            label={t('help.border.title')}
            title={t('help.border.title')}
            body={t('help.border.body')}
          />
        </div>
        {view.width.origin === 'style' ? (
          <p className="m-0 text-sm text-muted">
            {t('border.fromStyle', { name: view.width.styleName })}
          </p>
        ) : null}
        {isTable ? <p className="m-0 text-sm text-muted">{t('border.tableNote')}</p> : null}
      </div>
    </div>
  );
}
