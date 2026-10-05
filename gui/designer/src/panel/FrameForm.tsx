// The panel for a selected sub-template FRAME — a grid's cell, a card, a table
// column's cell (`frameModel`). Each is a container with no `type:`, drawn once
// per data element, so the form says first that an edit reaches every one of
// them, then offers its name (`id:`, through the same `ItemIdField` every item
// has) and what a frame is for: the inner padding, the fill, the border,
// whether content sticking out of it is hidden, and its opacity. The fields are
// the ordinary path-generic ones (`EdgeFields`, `PanelColorField`,
// `BorderEditor`, `OverflowField`, `OpacityField`) pointed at the frame's path,
// so a frame edits exactly as any boxed item's decoration does. A way back out
// to the owner sits at the foot, because the tree places the frame between the
// owner and its fields.

import type { EditorController } from '../editor/useEditor';
import { HelpHint } from '../help/HelpHint';
import { useI18n } from '../i18n/context';
import { cascadeContext } from '../toolbar/cascade';
import { BTN_SM, FIELD_LABEL, PANEL, SECTION_TITLE } from '../ui/chrome';
import { BorderEditor } from './BorderEditor';
import { readBorder } from './borderModel';
import { readRadius } from './borderRadius';
import { EdgeFields } from './EdgeFields';
import { FRAME_PADDING_RULES } from './edgeRules';
import type { Frame } from './frameModel';
import { ItemIdField } from './ItemIdField';
import { hasCapability } from './itemPanelProps';
import { OpacityField } from './OpacityField';
import { OverflowField, overflowOffered } from './OverflowFields';
import { PanelColorField } from './StyleTabFields';

export interface FrameFormProps {
  readonly controller: EditorController;
  readonly path: string;
  readonly frame: Frame;
  readonly capabilities?: readonly string[];
  readonly floor?: Readonly<Record<string, unknown>>;
  readonly onSelectPath?: (path: string) => void;
}

export function FrameForm({
  controller,
  path,
  frame,
  capabilities,
  floor,
  onSelectPath,
}: FrameFormProps) {
  const { t } = useI18n();
  const { kind } = frame;
  const ctx = cascadeContext(controller.read, path, floor);
  return (
    <aside className={PANEL} aria-label={t('panel.title')}>
      <h3 className={SECTION_TITLE}>{t(`panel.frame.title.${kind}`)}</h3>
      <p className="mt-0 mb-2 text-sm text-muted">{t(`panel.frame.every.${kind}`)}</p>
      {kind === 'columnCell' ? (
        <p className="mt-0 mb-2 text-sm text-muted">{t('panel.frame.columnNote')}</p>
      ) : null}
      <ItemIdField key={path} controller={controller} path={path} />
      {hasCapability(capabilities, 'box.padding') ? (
        <EdgeFields
          controller={controller}
          path={path}
          edgeKey="padding"
          rules={FRAME_PADDING_RULES}
        />
      ) : null}
      {hasCapability(capabilities, 'style.backgroundColor') ? (
        <PanelColorField
          label={t('panel.field.backgroundColor')}
          styleKey="backgroundColor"
          ctx={ctx}
          path={path}
          controller={controller}
        />
      ) : null}
      {hasCapability(capabilities, 'style.border') ? (
        <div className="mb-2">
          <span className={FIELD_LABEL}>{t('panel.field.border')}</span>
          <BorderEditor
            key={path}
            view={readBorder(controller.read, path)}
            radius={readRadius(controller.read, path)}
            path={path}
            controller={controller}
            capabilities={capabilities}
            isTable={false}
          />
        </div>
      ) : null}
      {overflowOffered('overflow', capabilities) ? (
        <OverflowField
          styleKey="overflow"
          path={path}
          controller={controller}
          ctx={ctx}
          capabilities={capabilities}
        />
      ) : null}
      {hasCapability(capabilities, 'style.opacity') ? (
        <OpacityField
          path={path}
          controller={controller}
          ctx={ctx}
          // A frame is a container: its opacity fades its own fill and border,
          // never the items drawn in it.
          help={
            <HelpHint
              label={t('panel.section.helpLabel', { title: t('panel.field.opacity') })}
              title={t('panel.field.opacity')}
              body={t('panel.itemSection.opacity.decorationHelp')}
            />
          }
        />
      ) : null}
      {onSelectPath === undefined ? null : (
        <button type="button" className={BTN_SM} onClick={() => onSelectPath(frame.ownerPath)}>
          {t(`panel.frame.selectOwner.${kind}`)}
        </button>
      )}
    </aside>
  );
}
