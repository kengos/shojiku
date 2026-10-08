// The row under the ruby entries that adds one (`RubyRows`). It is a DRAFT the
// document does not see: an entry with an empty side is one the engine skips
// with a warning, so nothing is written until both sides are filled and the
// reader asks for it (the button, or Enter outside an IME composition).
// Leaving one of its inputs never commits and never drops what was typed. The
// draft is this component's state, reset when the selected item changes (the
// section is keyed by path). At the entry cap the inputs are disabled and the
// reason is said under them.

import { type KeyboardEvent, useRef, useState } from 'react';
import { useI18n } from '../i18n/context';
import { IconButton } from '../ui/Button';
import { INPUT } from '../ui/chrome';
import { IconPlus } from '../ui/icons';
import { addRubyOp, MAX_RUBY_ENTRIES, type RubyRowsContext, rubyAddable } from './rubyModel';

/** An entry input's look, shared with the existing rows (`RubyRows`). */
export const ENTRY_INPUT = `${INPUT} min-w-0 flex-1`;

export function AddRow({ ctx }: { readonly ctx: RubyRowsContext }) {
  const { t } = useI18n();
  const [base, setBase] = useState('');
  const [text, setText] = useState('');
  const baseRef = useRef<HTMLInputElement>(null);
  const addable = rubyAddable(ctx.view);
  const ready = addable && base !== '' && text !== '';
  const add = () => {
    if (!ready) {
      return;
    }
    const op = addRubyOp(ctx.path, ctx.view, base, text);
    ctx.onTooLong(op === null);
    if (op !== null) {
      ctx.dispatch(op);
      setBase('');
      setText('');
      baseRef.current?.focus();
    }
  };
  const addOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      add();
    }
  };
  return (
    <>
      <div className="mt-1 flex min-w-0 items-center gap-1">
        <input
          ref={baseRef}
          type="text"
          aria-label={t('panel.ruby.newBase')}
          placeholder={t('panel.ruby.base')}
          className={ENTRY_INPUT}
          value={base}
          disabled={!addable}
          onChange={(event) => setBase(event.currentTarget.value)}
          onKeyDown={addOnEnter}
        />
        <input
          type="text"
          aria-label={t('panel.ruby.newReading')}
          placeholder={t('panel.ruby.reading')}
          className={ENTRY_INPUT}
          value={text}
          disabled={!addable}
          onChange={(event) => setText(event.currentTarget.value)}
          onKeyDown={addOnEnter}
        />
        {/* An icon button in the column the rows' remove buttons use, so the
            two inputs line up with the entries above and keep their width. */}
        <IconButton label={t('panel.ruby.add')} variant="ghost" disabled={!ready} onClick={add}>
          <IconPlus />
        </IconButton>
      </div>
      {addable ? null : (
        <p className="mt-1 text-sm text-muted">{t('panel.ruby.full', { max: MAX_RUBY_ENTRIES })}</p>
      )}
    </>
  );
}
