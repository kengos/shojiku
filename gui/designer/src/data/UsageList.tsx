// Where this template uses a data item, as a list a person can read: each place
// named the way the layer tree names it (kind + label), with the column or
// header group it sits in, and what the reference does there (the value, inside
// the text, the row condition …). Shared by the header's usage chip and the
// rename / delete confirmations, so all three name a place the same way.
//
// One row per owner + role: an item using the key in its text twice is one row.
// Every string here is document text — rendered as React text only.

import { useI18n } from '../i18n/context';
import { kindName } from '../tree/labels';
import { type DataRef, DOCUMENT_OWNER } from './refs/types';

/** The words for a reference's role; a role a panel already names reads that
 * panel's own label key, so the list and the panel cannot drift apart. */
const CARRIER_KEYS: Readonly<Record<DataRef['carrier'], string>> = {
  value: 'data.usage.carrier.value',
  inline: 'data.usage.carrier.inline',
  link: 'data.usage.carrier.link',
  visible: 'panel.visible.title',
  mark: 'data.usage.carrier.mark',
  ellipse: 'panel.mark.ellipseState',
  checkbox: 'panel.mark.checkboxState',
  source: 'data.usage.carrier.source',
  column: 'data.usage.carrier.column',
  rowCondition: 'data.usage.carrier.rowCondition',
  declaration: 'data.usage.carrier.declaration',
  label: 'data.usage.carrier.label',
  document: 'data.usage.carrier.document',
};

interface Place {
  readonly key: string;
  readonly ref: DataRef;
}

function places(refs: readonly DataRef[]): Place[] {
  const seen = new Map<string, Place>();
  for (const ref of refs) {
    const key = JSON.stringify([ref.owner.path, ref.detail, ref.carrier]);
    if (!seen.has(key)) {
      seen.set(key, { key, ref });
    }
  }
  return [...seen.values()];
}

/** The words naming one place's owner. */
export function useOwnerName(): (ref: DataRef) => string {
  const { t } = useI18n();
  return (ref) => {
    if (ref.owner.path === DOCUMENT_OWNER) {
      return t('data.usage.document');
    }
    const kind = kindName(ref.owner.type === '' ? 'item' : ref.owner.type, t);
    const owner =
      ref.owner.label === null ? kind : t('data.usage.item', { kind, label: ref.owner.label });
    return ref.detail === null ? owner : t('data.usage.inside', { owner, label: ref.detail });
  };
}

export function UsageList({ refs }: { readonly refs: readonly DataRef[] }) {
  const { t } = useI18n();
  const name = useOwnerName();
  return (
    <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-sm">
      {places(refs).map(({ key, ref }) => (
        <li key={key} className="flex flex-wrap justify-between gap-x-3 rounded-md px-1.5 py-0.5">
          <span className="min-w-0 [overflow-wrap:anywhere]">{name(ref)}</span>
          <span className="text-muted">{t(CARRIER_KEYS[ref.carrier])}</span>
        </li>
      ))}
    </ul>
  );
}
