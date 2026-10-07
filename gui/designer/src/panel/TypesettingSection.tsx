// The 「vertical text & line breaks」 section of a decoration tab: the six
// typesetting keys over the item's own `style`, each an inherited-select like
// the vertical-alignment row (own value in the select, the cascade's answer on
// the origin line under it, the section's own 「not set」 row removes the key —
// not the panel's shared 「(default)」 row, which reads as false under an
// inherited value and next to the 「Off」 options two of these keys have).
// Which keys a type gets, and which options this engine takes, is
// `typesettingModel`'s; this file only decides what is on screen. `typesettingParts` answers `null` when the type
// gets no key — an empty section would be a heading that opens onto nothing —
// and the two decoration tabs (`ItemDecorationSections`,
// `TableDecorationSections`) wrap what it returns in their own `PanelSection`.
//
// The two vertical-only keys hide while the item reads horizontal, and hanging
// punctuation while horizontal spans ignore it — unless the item authors the
// key itself: a value left behind by a switch must stay visible to be cleared.

import type { Op } from '@shojiku/designer-core';
import type { ReactNode } from 'react';
import { useI18n } from '../i18n/context';
import { type CascadeContext, cascadeContext } from '../toolbar/cascade';
import { effectiveValueIn } from '../toolbar/effective';
import { SelectField } from './choiceFields';
import type { ItemPanelProps } from './itemPanelProps';
import { applyPanelOp } from './model';
import { OriginBadge } from './OriginBadge';
import { styleOptionLabel, type Translate } from './styleLabels';
import { withAuthored } from './TextLookFields';
import { joinParts, type SummaryI18n } from './tableContentSummaries';
import {
  type TypesettingKey,
  typesettingKeys,
  typesettingOp,
  typesettingOptions,
  UNREADABLE_COMBINE,
  VERTICAL_ONLY_KEYS,
  VERTICAL_RL,
} from './typesettingModel';

/** The section's `?`: only where it styles something other than the item's own
 * text — a container's reach its children, a table's every cell. */
function helpKey(type: string): string | undefined {
  if (type === 'container') {
    return 'panel.itemSection.typesetting.inheritHelp';
  }
  return type === 'table' ? 'panel.itemSection.typesetting.tableHelp' : undefined;
}

/** What the section shows, or `null` when the type gets no key on this engine.
 * The caller supplies the heading and the `PanelSection` (the item tab lists it
 * among its sections; a table renders it between its own). */
export interface TypesettingParts {
  readonly summary: string;
  readonly help: string | undefined;
  readonly body: ReactNode;
}

export function typesettingParts(
  props: ItemPanelProps,
  i18n: SummaryI18n,
): TypesettingParts | null {
  const { t } = i18n;
  const { controller, path, view, capabilities } = props;
  const ctx = cascadeContext(controller.read, path, props.floor);
  const vertical = effectiveValueIn(ctx, 'writingMode').value === VERTICAL_RL;
  const subject = { type: view.type, hasSpans: view.hasSpans, vertical };
  // One predicate over every key the type can take in EITHER mode: shown when
  // the item authors it, or when it is offered and honoured in the mode the
  // item reads now. The state-dependent hides (the vertical-only pair while
  // horizontal, hanging punctuation in horizontal spans) therefore never hide a
  // value the item carries — it must stay visible to be cleared.
  const offered = new Set(typesettingKeys(subject, capabilities));
  const shown = typesettingKeys({ ...subject, vertical: true }, capabilities).filter(
    (key) =>
      effectiveValueIn(ctx, key).own !== '' ||
      (offered.has(key) && (vertical || !VERTICAL_ONLY_KEYS.has(key))),
  );
  if (shown.length === 0) {
    return null;
  }
  const summary =
    joinParts(
      i18n,
      shown.map((key) => {
        const own = effectiveValueIn(ctx, key).own;
        return own === '' ? '' : styleOptionLabel(t, key, own);
      }),
    ) || t('panel.tableSection.band.unset');
  const help = helpKey(view.type);
  // The engine skips a text `mark:` on a vertical block
  // (`vertical_text_unsupported`), so say so beside the switch that causes it.
  const markHidden = view.type === 'text' && vertical && hasMark(controller.read(path));
  return {
    summary,
    help: help === undefined ? undefined : t(help),
    body: (
      <TypesettingFields
        props={props}
        ctx={ctx}
        keys={shown}
        note={markHidden ? t('panel.itemSection.typesetting.markVertical') : null}
      />
    ),
  };
}

interface TypesettingFieldsProps {
  readonly props: ItemPanelProps;
  readonly ctx: CascadeContext;
  readonly keys: readonly TypesettingKey[];
  readonly note: string | null;
}

function TypesettingFields({ props, ctx, keys, note }: TypesettingFieldsProps) {
  const { t } = useI18n();
  const { controller, path, capabilities } = props;
  const dispatch = (op: Op | null) => applyPanelOp(controller, op);
  return (
    <>
      {keys.map((key) => {
        const effective = effectiveValueIn(ctx, key);
        return (
          <div key={key}>
            <SelectField
              label={t(`panel.field.${key}`)}
              value={effective.own}
              options={withAuthored(typesettingOptions(key, capabilities), effective.own)}
              noneLabel={t('panel.itemSection.typesetting.notSet')}
              optionLabel={(option) => ownOptionLabel(t, key, option)}
              onCommit={(next) => dispatch(typesettingOp(path, key, effective.own, next))}
            />
            <OriginBadge
              effective={effective}
              onNavigate={props.onNavigateDefaults}
              valueLabel={(value) => styleOptionLabel(t, key, value)}
            />
          </div>
        );
      })}
      {note === null ? null : <p className="mt-1 text-[11px] leading-relaxed text-muted">{note}</p>}
    </>
  );
}

/** A select row's wording. The unreadable `textCombineUpright` row says how to
 * get out — pick the 「not set」 row, which removes it — naming that row by its
 * own label (brackets dropped, so it can be quoted) rather than retyping it.
 * The origin line keeps the short label: a value from a style, an ancestor or
 * the defaults is not removed by this item's 「not set」. */
function ownOptionLabel(t: Translate, key: string, option: string): string {
  if (key === 'textCombineUpright' && option === UNREADABLE_COMBINE) {
    const notSet = t('panel.itemSection.typesetting.notSet').replace(/^[(（](.*)[)）]$/u, '$1');
    return t('panel.itemSection.typesetting.invalidOwn', { notSet });
  }
  return styleOptionLabel(t, key, option);
}

function hasMark(node: unknown): boolean {
  return (
    typeof node === 'object' &&
    node !== null &&
    Object.hasOwn(node, 'mark') &&
    (node as Record<string, unknown>).mark != null
  );
}
