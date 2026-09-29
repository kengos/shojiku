// The type-face pair a styled band leads with — font family and size, the first
// two controls of Google's format toolbar — over the band's cascade-effective
// values. `TableBandFields` composes it ahead of the weight/colour/alignment
// controls; it is its own file only because the band's control set outgrew one.
//
// Both fields show what the band RESOLVES to and author through `toolbar/wire`,
// like every other band control. Each carries its own changed-guard: tabbing
// through a field that shows an inherited value must author nothing, and the
// family combo has no guard of its own.

import type { Op } from '@shojiku/designer-core';
import { useId } from 'react';
import { readLength } from '../canvas/lengths';
import { useI18n } from '../i18n/context';
import type { CascadeContext } from '../toolbar/cascade';
import { effectiveValueIn } from '../toolbar/effective';
import { comboWire } from '../toolbar/wire';
import { OriginLine } from './bandFieldParts';
import { ComboField } from './choiceFields';
import { stepValueOp } from './model';
import { StepperField } from './StepperField';

/** A font SIZE steps by 1pt, as the item's own typography fields do. */
const FONT_SIZE_STEP_PT = 1;

export function BandTypeFields({
  ctx,
  path,
  keys,
  fontFamilies,
  onOp,
}: {
  readonly ctx: CascadeContext;
  readonly path: string;
  /** The key prefix the band owns (see `TableBandFields`). */
  readonly keys: readonly string[];
  /** The host's font families, offered as the combo's suggestions. */
  readonly fontFamilies: readonly string[];
  readonly onOp: (op: Op | null) => void;
}) {
  const { t } = useI18n();
  const family = effectiveValueIn(ctx, 'fontFamily');
  const size = effectiveValueIn(ctx, 'fontSize');
  const familyKeys = [...keys, 'fontFamily'];
  const sizeKeys = [...keys, 'fontSize'];
  // One id per mount: two bands can be open at once and share a key suffix.
  const listId = useId();
  return (
    <>
      <ComboField
        label={t('panel.field.fontFamily')}
        value={family.value}
        options={fontFamilies}
        listId={listId}
        onCommit={(raw) => {
          if (raw !== family.value) {
            onOp(comboWire(path, familyKeys, family, raw, false));
          }
        }}
      />
      <OriginLine effective={family} />
      <StepperField
        label={t('panel.field.fontSize')}
        value={size.value}
        canStep={readLength(size.value) !== null}
        unit="pt"
        unitHint={t('stepper.unitHint')}
        onCommit={(raw) => onOp(comboWire(path, sizeKeys, size, raw, true))}
        onStep={(dir) =>
          onOp(stepValueOp(path, sizeKeys, size.value, dir, FONT_SIZE_STEP_PT, 'length'))
        }
      />
      <OriginLine effective={size} />
    </>
  );
}
