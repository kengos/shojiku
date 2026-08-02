// The variant bar of the data-item editor: the switcher across the named
// sample-data documents, an add form, and a two-step delete of the active user
// variant. Ported from the retired sample panel.
//
// Preset variants are deliberately not removable, so the delete control appears
// only for a user variant; every refusal comes back typed and renders as a
// localized notice rather than a thrown error.

import { type FormEvent, useState } from 'react';
import { useI18n } from '../i18n/context';
import { VariantSelect } from '../sample/VariantSelect';
import { addVariant, removeVariant, type SampleSet, type VariantRefusal } from '../sample/variants';
import { BTN_SM, SELECT_SM } from '../ui/chrome';

/** Variant management (switch / add / delete), mirroring the retired sample
 * panel's controls. Absent for a one-document host; hidden in read-only mode. */
export interface VariantControls {
  readonly set: SampleSet;
  readonly onSwitch: (id: string) => void;
  readonly onCommit: (set: SampleSet) => void;
}

const VARIANT_REFUSAL_KEY: Record<VariantRefusal, string> = {
  empty_name: 'sample.variant.error.emptyName',
  too_many: 'sample.variant.error.tooMany',
  not_removable: 'sample.variant.error.cannotRemove',
  last_variant: 'sample.variant.error.cannotRemove',
};

/** The variant bar: switcher (>1), an add form, and a two-step delete of the
 * active user variant. Ported from the retired sample panel. */
export function VariantBar({ set, onSwitch, onCommit }: VariantControls) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<VariantRefusal | null>(null);

  const active = set.variants.find((variant) => variant.id === set.active);
  const removable = active?.origin === 'user';

  const submitAdd = (event: FormEvent) => {
    event.preventDefault();
    const result = addVariant(set, name);
    if (result.ok) {
      onCommit(result.set);
      setName('');
      setNotice(null);
    } else {
      setNotice(result.reason);
    }
  };

  const confirmDelete = () => {
    const result = removeVariant(set, set.active);
    if (result.ok) {
      onCommit(result.set);
      setConfirming(false);
      setNotice(null);
    } else {
      setNotice(result.reason);
      setConfirming(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {set.variants.length > 1 ? <VariantSelect set={set} onSwitch={onSwitch} /> : null}
      {notice !== null ? (
        <output className="basis-full text-sm text-error-text">
          {t(VARIANT_REFUSAL_KEY[notice])}
        </output>
      ) : null}
      <form className="flex min-w-0 items-center gap-1" onSubmit={submitAdd}>
        <input
          type="text"
          className={SELECT_SM}
          aria-label={t('sample.variant.name')}
          placeholder={t('sample.variant.name')}
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <button type="submit" className={`${BTN_SM} whitespace-nowrap`}>
          {t('sample.variant.add')}
        </button>
      </form>
      {removable ? (
        confirming ? (
          <span className="flex flex-wrap items-center gap-1 text-sm">
            <span>{t('sample.variant.removeConfirm')}</span>
            <button type="button" className={BTN_SM} onClick={confirmDelete}>
              {t('styles.confirm')}
            </button>
            <button type="button" className={BTN_SM} onClick={() => setConfirming(false)}>
              {t('styles.cancel')}
            </button>
          </span>
        ) : (
          <button type="button" className={BTN_SM} onClick={() => setConfirming(true)}>
            {t('sample.variant.remove')}
          </button>
        )
      ) : null}
    </div>
  );
}
