// The one door a column's kind change goes through, shared by the column form
// and the column sheet: a pick applies `kindSwitchOps` as ONE batch, except a
// switch OUT of a `cell:` column that holds items — that deletes what the cell
// carries, so it waits for a confirm naming the column, how many items go and of
// which kinds, and what the column keeps (the GridSteppers shrink-confirm
// precedent). An empty cell switches at once: there is nothing to lose.
//
// Strings from the document (the column label, the carried key, item types)
// reach the screen as React text only; an item type outside the known set shows
// its wire spelling, as the layer tree does.

import type { ReactNode } from 'react';
import { useState } from 'react';
import type { EditorController } from '../editor/useEditor';
import { isMacPlatform, modifierGlyph } from '../help/shortcutsModel';
import { useI18n } from '../i18n/context';
import { formatList } from '../i18n/format';
import { kindName } from '../tree/labels';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { cellSummary, kindSwitchOps } from './columnKindOps';
import { type ColumnKind, columnKindOf } from './columnKinds';

type I18nT = ReturnType<typeof useI18n>['t'];

export interface ColumnKindSwitch {
  /** Switch the column to `to` — at once, or after the confirm. */
  readonly request: (to: ColumnKind) => void;
  /** The confirm dialog (render it once, anywhere under the caller). */
  readonly dialog: ReactNode;
}

/** `types` as "Text ×2, Image ×1" in first-seen order. */
function kindsLine(types: readonly string[], t: I18nT, locale: string): string {
  const counts = new Map<string, number>();
  for (const type of types) {
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return formatList(
    [...counts].map(([type, n]) =>
      t('panel.column.kindConfirm.kindCount', {
        // An item whose `type` is no string has no name to give.
        kind: type === '' ? t('panel.column.kindConfirm.otherKind') : kindName(type, t),
        n,
      }),
    ),
    locale,
  );
}

export function useColumnKindSwitch(
  controller: EditorController,
  path: string,
  label: string,
): ColumnKindSwitch {
  const { t, locale } = useI18n();
  const [pending, setPending] = useState<ColumnKind | null>(null);
  const apply = (to: ColumnKind) => {
    const ops = kindSwitchOps(controller.read, path, to);
    if (ops.length > 0) {
      controller.applyAll(ops);
    }
  };
  const raw = controller.read(path);
  const inCell = columnKindOf(raw) === 'cell';
  // `columnKindOf` said `cell` only for a map column with an OWN map `cell`.
  const summary = cellSummary(inCell ? (raw as Readonly<Record<string, unknown>>).cell : undefined);
  const request = (to: ColumnKind) => {
    if (inCell && to !== 'cell' && summary.count > 0) {
      setPending(to);
      return;
    }
    apply(to);
  };
  const close = () => setPending(null);
  const kind = (target: ColumnKind) => t(`panel.column.kind.${target}`);
  const dialog =
    pending === null ? null : (
      <Modal
        open
        onClose={close}
        title={
          label === ''
            ? t('panel.column.kindConfirm.titleUnnamed', { kind: kind(pending) })
            : t('panel.column.kindConfirm.title', { label, kind: kind(pending) })
        }
        closeLabel={t('help.close')}
        footer={
          <>
            <Button onClick={close}>{t('panel.column.kindConfirm.cancel')}</Button>
            <Button
              variant="primary"
              onClick={() => {
                apply(pending);
                close();
              }}
            >
              {t('panel.column.kindConfirm.confirm')}
            </Button>
          </>
        }
      >
        <p className="m-0">
          {t('panel.column.kindConfirm.body', { kinds: kindsLine(summary.types, t, locale) })}{' '}
          {summary.binding === null
            ? t('panel.column.kindConfirm.noCarry')
            : t('panel.column.kindConfirm.carry', { key: summary.binding.key })}
        </p>
        <p className="m-0 mt-2 text-muted text-sm">
          {t('panel.column.kindConfirm.undo', { mod: modifierGlyph(isMacPlatform()) })}
        </p>
      </Modal>
    );
  return { request, dialog };
}
