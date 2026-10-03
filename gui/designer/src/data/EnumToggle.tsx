// The 「値を選択肢で決める」 checkbox of the choices section and what turning it
// off does. ON writes nothing (the table opens; the first member writes the
// list). OFF over members — including a list this editor can only show — asks
// first, then removes the key; OFF over an authored EMPTY list removes it at
// once (nothing is lost, and an empty list makes every value warn); OFF over a
// list that was only opened here just closes it.

import { useState } from 'react';
import { useI18n } from '../i18n/context';
import { BTN_SM } from '../ui/chrome';

export interface EnumToggleProps {
  readonly on: boolean;
  readonly editable: boolean;
  /** The document carries an `enum` key at all. */
  readonly present: boolean;
  /** Members turning it off would remove; `null` when they cannot be counted
   * (a value that is not a list). */
  readonly count: number | null;
  readonly onOpen: (open: boolean) => void;
  /** Remove the key. */
  readonly onRemove: () => void;
}

export function EnumToggle({ on, editable, present, count, onOpen, onRemove }: EnumToggleProps) {
  const { t } = useI18n();
  const [confirming, setConfirming] = useState(false);
  const off = () => {
    if (!present) {
      onOpen(false);
    } else if (count === 0) {
      onRemove();
    } else {
      setConfirming(true);
    }
  };
  return (
    <>
      <label className="flex items-center gap-1.5 text-sm text-text">
        <input
          type="checkbox"
          checked={on}
          disabled={!editable}
          onChange={(event) => (event.currentTarget.checked ? onOpen(true) : off())}
        />
        {t('data.choices.toggle')}
      </label>
      <p className="m-0 text-sm text-muted">{t('data.choices.toggleHint')}</p>
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-error-text px-2 py-1.5 text-sm text-error-text">
          <span>
            {count === null
              ? t('data.choices.confirmClearUnknown')
              : t('data.choices.confirmClear', { count })}
          </span>
          <button
            type="button"
            className={BTN_SM}
            onClick={() => {
              onRemove();
              setConfirming(false);
            }}
          >
            {t('data.choices.confirmClearSubmit')}
          </button>
          <button type="button" className={BTN_SM} onClick={() => setConfirming(false)}>
            {t('data.add.cancel')}
          </button>
        </div>
      ) : null}
    </>
  );
}
