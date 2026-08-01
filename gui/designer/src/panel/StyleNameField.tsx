// How the style form takes the NAME — the one field whose behaviour differs by
// mode, which is why it is its own leaf. Create authors the name (IME-guarded:
// a Japanese user pressing Enter to confirm a conversion must not commit
// mid-composition), while an EXISTING style's name is read-only here, badged
// with the hint that renaming lives in the row's overflow menu — a rename
// rewrites every reference and is a different, transactional operation.

import { useI18n } from '../i18n/context';
import { FIELD_LABEL, INPUT } from '../ui/chrome';

export interface StyleNameFieldProps {
  /** Create authors the name; update renders it read-only with the hint badge. */
  readonly isCreate: boolean;
  readonly value: string;
  /** Create only — never called while the field is read-only. */
  readonly onChange: (value: string) => void;
  /** Create only — Enter submits the whole form (IME-guarded). */
  readonly onSubmit: () => void;
}

export function StyleNameField({ isCreate, value, onChange, onSubmit }: StyleNameFieldProps) {
  const { t } = useI18n();
  return (
    <div>
      <label className={FIELD_LABEL} htmlFor="sj-style-form-name">
        {t('styles.namePlaceholder')}
        {isCreate ? null : (
          <span className="ml-2 rounded-full bg-accent/15 px-1.5 py-0.5 text-xs text-accent">
            {t('styles.renameHint')}
          </span>
        )}
      </label>
      {isCreate ? (
        <input
          id="sj-style-form-name"
          type="text"
          className={INPUT}
          value={value}
          placeholder={t('styles.namePlaceholder')}
          onChange={(event) => onChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            // A Japanese user pressing Enter to confirm an IME conversion must
            // not commit mid-composition.
            if (event.nativeEvent.isComposing) {
              return;
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              onSubmit();
            }
          }}
        />
      ) : (
        <input
          id="sj-style-form-name"
          type="text"
          className={`${INPUT} cursor-default bg-bg text-muted`}
          value={value}
          readOnly
        />
      )}
    </div>
  );
}
