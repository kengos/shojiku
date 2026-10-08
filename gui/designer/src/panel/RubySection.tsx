// Ruby (furigana) on the CONTENT tab of a `text` item: the readings
// (`ruby: [{ base, text }]`) and their size (`rubySize`). A SIBLING of the
// content section, not a part of it, for the `LinkField` reason: that section
// returns the spans editor early, and ruby applies to a spans text as well —
// plain or spans, horizontal or vertical, typed or bound (the engine matches the
// DRAWN text, so a bound item's base is matched against its value).
//
// Two gates, like `LinkField`: the TYPE (`TextItem` is the only struct with
// `ruby`, and every other item struct is `deny_unknown_fields`; `char_grid` has
// a `rubySize` of its own, edited with its grid) and the CAPABILITY (an
// older engine rejects `ruby` at parse). The entry rows are `RubyRows`; the
// model is `rubyModel.ts`.
//
// The engine never grows a line for its readings, its default line height
// leaves them little room, and the first line's readings stick out of the box
// (`apply_horizontal_ruby` puts a reading's bottom at its line's top), so the
// section says both in a fixed sentence rather than guessing from the effective
// line height when they collide.

import type { Op } from '@shojiku/designer-core';
import { useState } from 'react';
import { useI18n } from '../i18n/context';
import { BTN_SM } from '../ui/chrome';
import { rubyPx } from './CharGridInkFields';
import type { ItemPanelProps } from './itemPanelProps';
import { hasCapability } from './itemPanelProps';
import { applyPanelOp } from './model';
import { NumericComboField } from './NumericComboField';
import { HelpfulHeading } from './panelHelpers';
import { RubyRows } from './RubyRows';
import { clearRubyOp, MAX_RUBY_CHARS, RUBY_CAPABILITY, readRuby, rubySizeOp } from './rubyModel';

/** Sizes worth offering, in points: around half of the common body sizes
 * (10–16pt), which is what an unset size draws at. */
export const RUBY_TEXT_SIZE_PRESETS = ['5', '6', '7', '8'] as const;

export function RubySection(props: ItemPanelProps) {
  const { t } = useI18n();
  const { controller, path, view: item, capabilities } = props;
  const [tooLong, setTooLong] = useState(false);
  const [sizeRefused, setSizeRefused] = useState(false);
  if (item.type !== 'text' || !hasCapability(capabilities, RUBY_CAPABILITY)) {
    return null;
  }
  const view = readRuby(controller.read, path);
  const dispatch = (op: Op | null) => applyPanelOp(controller, op);
  const unreadable = t('panel.ruby.unreadable');
  return (
    <section className="mt-4">
      <HelpfulHeading
        title={t('panel.ruby.title')}
        topic="ruby"
        onOpenGlossary={props.onOpenGlossary}
      />
      <p className="mb-2 text-sm text-muted">
        {
          // Names the two fields by THEIR label keys, never a retyped copy.
          t('panel.ruby.spacing', {
            lineHeight: t('panel.field.lineHeight'),
            padding: t('panel.edge.padding'),
          })
        }
      </p>
      {view.state === 'unreadable' ? (
        <div className="mb-2 flex items-center gap-2">
          <span className="text-sm text-muted italic">{t('panel.ruby.unreadableList')}</span>
          <button type="button" className={BTN_SM} onClick={() => dispatch(clearRubyOp(path))}>
            {t('panel.ruby.clear')}
          </button>
        </div>
      ) : (
        <RubyRows ctx={{ path, view, dispatch, onTooLong: setTooLong }} />
      )}
      {tooLong ? (
        <output className="mt-1 block rounded-md bg-error-bg px-2 py-0.5 text-sm text-error-text">
          {t('panel.ruby.tooLong', { max: MAX_RUBY_CHARS })}
        </output>
      ) : null}
      <div className="mt-3">
        <NumericComboField
          label={t('panel.ruby.size')}
          // An unreadable size shows as such, so the 「auto」 row is a CHANGE
          // and can remove it.
          value={view.sizeUnreadable ? unreadable : view.size}
          placeholder={t('panel.ruby.sizeAuto')}
          unit="pt"
          hint={sizeRefused ? t('panel.ruby.sizeRefused') : undefined}
          presets={[
            { value: '', label: t('panel.ruby.sizeAuto'), note: t('panel.ruby.sizeDefault') },
            ...RUBY_TEXT_SIZE_PRESETS.map((preset) => ({
              value: preset,
              sample: (
                <span className="text-muted italic" style={{ fontSize: `${rubyPx(preset)}px` }}>
                  {t('panel.charGrid.rubySample')}
                </span>
              ),
            })),
          ]}
          onCommit={(raw) => {
            // The field never commits the label it shows for an unreadable
            // size (an unchanged value), so `raw` is always the reader's entry.
            const entry = raw.trim();
            const op = rubySizeOp(path, view, entry);
            // Refused, as opposed to unchanged: an empty or same value says nothing.
            setSizeRefused(op === null && entry !== '' && entry !== view.size);
            dispatch(op);
          }}
        />
      </div>
    </section>
  );
}
