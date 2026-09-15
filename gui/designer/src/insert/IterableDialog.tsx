// The iterable-insert dialog: pick an array data source (a definitions array
// group, or — workshop mode — a fresh blank-start spec typed inline) and a
// presentation (table / cards / grid / list), then confirm. The dialog owns only the
// choice; the Designer builds the scaffold ops and reports a typed refusal
// back for display. Modal chrome (focus trap + restore, Escape, outside click,
// ARIA, portal) is `ui/Modal`'s. Every string is a catalog key or user/document
// text rendered through React's escaping.

import { useState } from 'react';
import { useI18n } from '../i18n/context';
import type { PaletteGroup } from '../palette/model';
import { TOUR_ANCHORS } from '../tutorial/anchors';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { IterableCreateForm, type IterableDraft } from './iterableCreateForm';
import { confirmChoice, type IterableChoice, type IterableRefusal } from './iterableModel';
import { IterableSourceList } from './iterableSourceList';
import { IterableVariantPicker } from './iterableVariantPicker';
import {
  SCAFFOLD_VARIANTS,
  type ScaffoldVariant,
  scaffoldFromGroup,
  variantFitsBody,
  variantsFor,
} from './scaffold';

export interface IterableDialogProps {
  /** The bindable array groups (may be empty — the create flow remains). */
  readonly groups: readonly PaletteGroup[];
  /** Whether the blank-start create flow is offered (workshop mode only). */
  readonly workshop: boolean;
  /** Whether the document's body is a flow — every iterable lands there, and
   * the cards and the grid lay out nowhere else. Required, not defaulted: a
   * host that stopped passing it must fail to compile, not quietly offer the
   * variants that skip. */
  readonly flowBody: boolean;
  /** Apply the choice. A typed refusal comes back for display (the dialog
   * stays open); `null` = applied (the Designer closes the dialog). */
  readonly onConfirm: (choice: IterableChoice) => IterableRefusal | null;
  readonly onClose: () => void;
}

export function IterableDialog({
  groups,
  workshop,
  flowBody,
  onConfirm,
  onClose,
}: IterableDialogProps) {
  const { t } = useI18n();
  const [mode, setMode] = useState<'group' | 'create'>(groups.length > 0 ? 'group' : 'create');
  const [groupId, setGroupId] = useState(groups[0]?.id ?? '');
  const [variant, setVariant] = useState<ScaffoldVariant>('table');
  const [draft, setDraft] = useState<IterableDraft>(() => ({
    name: '',
    fields: [1, 2, 3].map((n) => ({
      name: t('iterable.fieldDefault', { n }),
      kind: 'text' as const,
    })),
  }));
  const [refusal, setRefusal] = useState<IterableRefusal | null>(null);

  const selectedGroup = groups.find((group) => group.id === groupId);
  const available = (
    mode === 'group' && selectedGroup !== undefined
      ? variantsFor(scaffoldFromGroup(selectedGroup))
      : SCAFFOLD_VARIANTS
  ).filter((option) => variantFitsBody(option, flowBody));
  // A group switch can strand the picked variant (a field-less group offers
  // only the list) — clamp at render, commit the clamped value. This clamp is
  // the ONE door every confirm passes through, so it is also what keeps a
  // flow-only variant out of a body that would skip it; the list fits every
  // body, so `available` is never empty.
  const effectiveVariant = available.includes(variant) ? variant : available[0];

  const confirm = () => {
    const outcome = confirmChoice(mode, selectedGroup, draft.name, draft.fields, effectiveVariant);
    if (outcome.ok) {
      setRefusal(onConfirm(outcome.choice));
    } else {
      setRefusal(outcome.refusal);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      tour={TOUR_ANCHORS.dialogIterable}
      title={t('iterable.title')}
      closeLabel={t('help.close')}
      footer={
        <>
          <Button onClick={onClose}>{t('iterable.cancel')}</Button>
          <Button variant="primary" onClick={confirm}>
            {t('iterable.insert')}
          </Button>
        </>
      }
    >
      {workshop && groups.length > 0 ? (
        <div role="radiogroup" aria-label={t('iterable.mode')} className="flex flex-wrap gap-3">
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="sj-iterable-mode"
              checked={mode === 'group'}
              onChange={() => setMode('group')}
            />
            {t('iterable.mode.group')}
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="sj-iterable-mode"
              checked={mode === 'create'}
              onChange={() => setMode('create')}
            />
            {t('iterable.mode.create')}
          </label>
        </div>
      ) : null}

      {mode === 'group' ? (
        <IterableSourceList groups={groups} groupId={groupId} onPick={setGroupId} />
      ) : (
        <IterableCreateForm
          draft={draft}
          onDraft={setDraft}
          showFields={effectiveVariant !== 'list'}
        />
      )}

      <IterableVariantPicker
        available={available}
        selected={effectiveVariant}
        onPick={setVariant}
        flowBody={flowBody}
      />

      {refusal !== null ? (
        <output className="text-sm text-error-text">{t(`iterable.error.${refusal}`)}</output>
      ) : null}
    </Modal>
  );
}
