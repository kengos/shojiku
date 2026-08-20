// ONE row of the document's 表示形式 section: what a given field type renders as
// throughout the document, unless an item overrides it.
//
// The row has TWO shapes, and the asymmetry is the honest part. `date`,
// `datetime` and `currency` have real named variants, so they get a picker.
// `number`, `percentage` and `quantity` have none in v1 — the engine warns on
// any pick but `default` — so they show what they render and offer NO control:
// a control that can only produce a warning is worse than an absent one. Which
// shape a type takes is the ENGINE's answer (`FormatTypeEntry.fixed`), never a
// list kept in step here.
//
// A row is never blank. An unset slot reads 「ロケール既定」 in muted type with
// the sample the engine actually produces beside it, so "what happens if I
// leave this alone" is answered without opening anything.

import { useState } from 'react';
import type { FormatCatalog, PatternProbe, ProbeResult } from '../engine/types';
import { usePopover } from '../hooks/usePopover';
import { useI18n } from '../i18n/context';
import { BTN_SM, PICKER_POPOVER, PICKER_TOGGLE } from '../ui/chrome';
import { IconChevronDown } from '../ui/icons';
import { FormatOptionList } from './FormatOptionList';
import { type FormatDefaultValue, PATTERN_TYPES } from './formatDefaultsModel';
import { variantLabelKey } from './formatLabels';
import { isFixedType, variantOptions, variantSamples } from './formatModel';
import { PatternField } from './PatternField';

export interface FormatDefaultRowProps {
  readonly type: string;
  readonly value: FormatDefaultValue;
  readonly catalog: FormatCatalog | null;
  readonly probe: (probes: readonly PatternProbe[]) => Promise<readonly ProbeResult[]>;
  /** Pick a variant name; an EMPTY spelling clears the slot back to the
   * locale default. */
  readonly onPick: (spelling: string) => void;
  /** Write an inline pattern. An empty one authors nothing (the wire field is
   * required), which is enforced by the caller's op builder. */
  readonly onPattern: (pattern: string) => void;
}

export function FormatDefaultRow({
  type,
  value,
  catalog,
  probe,
  onPick,
  onPattern,
}: FormatDefaultRowProps) {
  const { t } = useI18n();
  const { open, setOpen, rootRef } = usePopover();
  // A slot with no pattern yet has nothing to edit, so writing one is an
  // explicit choice from the picker rather than a field sitting there empty.
  const [writing, setWriting] = useState(false);

  const fixed = isFixedType(catalog, type);
  const labelKey = value.kind === 'name' ? variantLabelKey(value.name) : undefined;
  const label =
    value.kind === 'name'
      ? labelKey === undefined
        ? value.name
        : t(labelKey)
      : value.kind === 'inline'
        ? t('formats.customPattern')
        : t('formats.localeDefault');
  // The inline arm's own live preview is the pattern field's job; a name (or
  // nothing at all) resolves to what the engine renders for it.
  const samples =
    value.kind === 'inline'
      ? []
      : variantSamples(catalog, type, value.kind === 'name' ? value.name : 'default');
  const patternOpen = PATTERN_TYPES.includes(type) && (value.kind === 'inline' || writing);

  return (
    <div className="mb-2">
      <div className="relative flex items-center gap-2" ref={rootRef}>
        <span className="w-24 shrink-0 text-sm text-muted">{t(`format.label.${type}`)}</span>
        <span className={`min-w-0 flex-1 truncate ${value.kind === 'unset' ? 'text-muted' : ''}`}>
          {label}
        </span>
        {samples.length > 0 ? (
          <span className="shrink-0 text-sm text-muted italic [overflow-wrap:anywhere]">
            {samples.join(' / ')}
          </span>
        ) : null}
        {fixed ? null : (
          <button
            type="button"
            className={PICKER_TOGGLE}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={t('formats.choose', { type: t(`format.label.${type}`) })}
            onClick={() => setOpen((v) => !v)}
          >
            <IconChevronDown size={12} className="text-muted" />
          </button>
        )}
        {open ? (
          <div role="menu" className={PICKER_POPOVER}>
            <FormatOptionList
              options={variantOptions(catalog, type)}
              leading={{
                label: t('formats.localeDefault'),
                samples: variantSamples(catalog, type, 'default'),
                onPick: () => {
                  setOpen(false);
                  setWriting(false);
                  onPick('');
                },
              }}
              onPick={(spelling) => {
                setOpen(false);
                setWriting(false);
                onPick(spelling);
              }}
            />
            {PATTERN_TYPES.includes(type) ? (
              <button
                type="button"
                role="menuitem"
                className={`${BTN_SM} m-1 block w-[calc(100%-0.5rem)] text-left`}
                onClick={() => {
                  setOpen(false);
                  setWriting(true);
                }}
              >
                {t('formats.writePattern')}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {patternOpen ? (
        <div className="mt-1 ml-24 pl-2">
          <PatternField
            label={t('formats.pattern')}
            fieldType={type === 'datetime' ? 'datetime' : 'date'}
            value={value.kind === 'inline' ? value.pattern : ''}
            probe={probe}
            onCommit={onPattern}
          />
        </div>
      ) : null}
    </div>
  );
}
