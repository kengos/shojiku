// The inline rich-text format bar: the MARKS a fragment may carry, over
// whatever the reader has selected. Pressing one splits the fragments
// underneath — invisibly, which is the point — so this bar shows no fragment
// number and offers no boundary control of any kind.
//
// The fifth mark, tate-chu-yoko, is offered only where it can draw: the host
// passes `combineUpright` while the block is vertical (or a fragment already
// carries one, so it can be cleared) on an engine honouring it per span.
//
// The marks are exactly that, and NOT the three metrics (`fontSize`,
// `fontFamily`, `letterSpacing`). `canvas/InlineTextEditor` records why: the
// surface is "deliberately NOT WYSIWYG — the Designer never re-resolves
// fonts/styles", so painting a metric would make its line breaks a prediction
// of the engine's. The metrics are the property panel's, per fragment.
//
// Every control is the toolbar's own (`ToggleButton`, `ColorSwatchPicker`), so
// a reader who has met the format toolbar has met this bar too.

import type { ReactNode } from 'react';
import { useI18n } from '../i18n/context';
import { FMT_BTN, ToggleButton } from '../toolbar/fmtChrome';
import { ColorSwatchPicker } from '../ui/ColorSwatchPicker';
import { Sep } from '../ui/Sep';
import {
  setColor,
  toggleBold,
  toggleCombine,
  toggleDecoration,
  toggleItalic,
  UNSELECTED_MARKS,
} from './runMarks';
import { combineOn, hasLineThrough, hasUnderline, type RunMarks } from './spanRuns';

/** The bar's own shell. It rides ON the item being edited rather than floating
 * over the selection: a bar that moved as the reader dragged would move the
 * thing they were reaching for.
 *
 * And it rides OUTSIDE the item's top edge, out of flow (`absolute bottom-full`
 * against the editor root): in flow it pushed the surface down by its own
 * height — measured, the words being edited sat 42px below where the page
 * prints them — which every static text now opens onto. Over the content above
 * is the cheaper place for it, the way a word processor's mini toolbar sits. */
const BAR =
  'absolute bottom-full left-0 z-10 mb-1 flex w-max items-center gap-0.5 rounded-md border border-border bg-chrome px-1 py-0.5 shadow-[0_2px_8px_rgb(0_0_0/0.12)]';

export interface RunFormatBarProps {
  /** The marks the selection shares, or `null` for no usable selection — which
   * disables every control rather than hiding the bar. A bar that appeared and
   * vanished as the reader dragged would move the thing they were reaching for. */
  readonly marks: RunMarks | null;
  /** Apply a transform to every fragment the selection covers. */
  readonly onMark: (next: (current: RunMarks) => RunMarks) => void;
  /** The chip insert trigger, supplied by the editor shell — a bound value is
   * authored as a `{key}` chip inside a fragment's text, never as a new `data:`
   * fragment (the user's decision), so it belongs on this bar beside the marks. */
  readonly children?: ReactNode;
  /** The engine takes both decoration lines at once
   * (`style.textDecoration.combined`); without it U and S are exclusive. */
  readonly combined?: boolean;
  /** Offer the tate-chu-yoko toggle. */
  readonly combineUpright?: boolean;
}

export function RunFormatBar({
  marks,
  onMark,
  children,
  combined = true,
  combineUpright = false,
}: RunFormatBarProps) {
  const { t } = useI18n();
  const common = marks ?? UNSELECTED_MARKS;
  const disabled = marks === null;
  return (
    <div className={BAR} role="toolbar" aria-label={t('flow.title')}>
      <ToggleButton
        label={t('toolbar.bold')}
        glyph={<span className="font-bold">B</span>}
        pressed={common.bold}
        disabled={disabled}
        onToggle={() => onMark((current) => toggleBold(current, common))}
      />
      <ToggleButton
        label={t('toolbar.italic')}
        glyph={<span className="font-serif italic">I</span>}
        pressed={common.italic}
        disabled={disabled}
        onToggle={() => onMark((current) => toggleItalic(current, common))}
      />
      <ToggleButton
        label={t('flow.underline')}
        glyph={<span className="underline">U</span>}
        pressed={hasUnderline(common.decoration)}
        disabled={disabled}
        onToggle={() =>
          onMark((current) => toggleDecoration(current, common, 'underline', combined))
        }
      />
      <ToggleButton
        label={t('flow.lineThrough')}
        glyph={<span className="line-through">S</span>}
        pressed={hasLineThrough(common.decoration)}
        disabled={disabled}
        onToggle={() =>
          onMark((current) => toggleDecoration(current, common, 'line_through', combined))
        }
      />
      <Sep />
      <ColorSwatchPicker
        label={t('toolbar.textColor')}
        value={common.color}
        onCommit={(next) => onMark((current) => setColor(current, next))}
        triggerClassName={FMT_BTN}
        tip={t('toolbar.textColor')}
        customLabel={t('toolbar.color.custom')}
        clearLabel={t('toolbar.color.clear')}
      />
      {combineUpright ? (
        <ToggleButton
          label={t('flow.combine')}
          glyph={<span className="text-[10px] leading-none tracking-tighter">12</span>}
          pressed={combineOn(common.combine)}
          disabled={disabled}
          onToggle={() => onMark((current) => toggleCombine(current, common))}
        />
      ) : null}
      {children}
    </div>
  );
}
