// The placement tab's two collapsible sections under the box fields: the
// item's spacing (inner padding, outer margin) and its size bounds. Offered on
// the types and sides where the engine honours them (`styleSurfaces`,
// `edgeRules`) and behind the engine's own capability keys.

import { isRelativeLength } from '../canvas/lengths';
import { useI18n } from '../i18n/context';
import { EdgeFields } from './EdgeFields';
import { type EdgeView, edgeSteppable, readEdge } from './edgeModel';
import { edgeRules, horizontalOnly } from './edgeRules';
import { hasCapability, type ItemPanelProps } from './itemPanelProps';
import { applyPanelOp } from './model';
import { PanelSection } from './PanelSection';
import type { Placement } from './placementModel';
import { StepperField } from './StepperField';
import { readSizeLimits, sizeLimitKeys, sizeLimitOp, sizeLimitStepOp } from './sizeLimits';
import { PADDING_TYPES } from './styleSurfaces';
import { joinParts, lengthText } from './tableContentSummaries';

type Props = ItemPanelProps & { readonly placement: Placement; readonly step: number };

/** What an edge value says while its section is closed: one length, or `''`
 * when it is unset or differs per side. */
function edgeText(view: EdgeView): string {
  return view.mode === 'uniform' ? lengthText(view.uniform) : '';
}

export function SpacingSections(props: Props) {
  const i18n = useI18n();
  const { t } = i18n;
  const { controller, path, view, capabilities, placement, step } = props;
  const node = controller.read(path);
  const hOnly = horizontalOnly(view.type, placement);
  const padding = PADDING_TYPES.has(view.type) && hasCapability(capabilities, 'box.padding');
  const margin = hasCapability(capabilities, 'box.margin');
  const paddingView = readEdge(node, 'padding');
  const marginView = readEdge(node, 'margin');
  const perSide = (v: EdgeView) => (v.mode === 'perSide' ? t('panel.edge.perSide') : edgeText(v));
  const spacingSummary = joinParts(i18n, [
    padding && paddingView.mode !== 'none'
      ? `${t('panel.edge.padding')} ${perSide(paddingView)}`.trim()
      : '',
    margin && marginView.mode !== 'none'
      ? `${t('panel.edge.margin')} ${perSide(marginView)}`.trim()
      : '',
  ]);
  const limits = readSizeLimits(node);
  const limitKeys = sizeLimitKeys(hOnly);
  const limitSummary = joinParts(
    i18n,
    limitKeys.map((key) =>
      limits[key] === '' ? '' : `${t(`panel.box.${key}`)} ${lengthText(limits[key])}`,
    ),
  );
  return (
    <>
      {padding || margin ? (
        <PanelSection
          id="item.spacing"
          title={t('panel.edge.title')}
          summary={spacingSummary === '' ? t('panel.tableSection.none') : spacingSummary}
          help={hOnly ? t('panel.edge.tableHelp') : t('panel.edge.help')}
        >
          {padding ? (
            <EdgeFields
              controller={controller}
              path={path}
              edgeKey="padding"
              rules={edgeRules('padding', view.type, placement)}
            />
          ) : null}
          {margin ? (
            <EdgeFields
              controller={controller}
              path={path}
              edgeKey="margin"
              rules={edgeRules('margin', view.type, placement)}
            />
          ) : null}
        </PanelSection>
      ) : null}
      {hasCapability(capabilities, 'box.minmax') ? (
        <PanelSection
          id="item.sizeLimits"
          title={t('panel.box.limits.title')}
          summary={limitSummary === '' ? t('panel.tableSection.none') : limitSummary}
          help={t('panel.box.limits.help')}
        >
          <div className="grid grid-cols-2 gap-2">
            {limitKeys.map((key) => (
              <StepperField
                key={key}
                label={t(`panel.box.${key}`)}
                value={limits[key]}
                unit="pt"
                unitHint={t('stepper.unitHint')}
                canStep={edgeSteppable(limits[key])}
                stepHint={isRelativeLength(limits[key]) ? t('stepper.relativeUnit') : undefined}
                onCommit={(entry) =>
                  applyPanelOp(controller, sizeLimitOp(path, key, limits[key], entry))
                }
                onStep={(dir) =>
                  applyPanelOp(controller, sizeLimitStepOp(path, key, limits[key], dir, step))
                }
              />
            ))}
          </div>
        </PanelSection>
      ) : null}
    </>
  );
}
