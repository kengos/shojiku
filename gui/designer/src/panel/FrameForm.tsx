// The panel for a selected sub-template FRAME — a grid's cell, a card, a table
// column's cell (`frameModel`). Each is a container with no `type:`, drawn once
// per data element, so the form says first that an edit reaches every one of
// them, then offers what a frame is for: the inner padding, the fill and the
// border. The fields are the ordinary path-generic ones (`PaddingField`,
// `PanelColorField`, `BorderEditor`) pointed at the frame's path, so a frame
// edits exactly as any boxed item's decoration does. A way back out to the owner
// sits at the foot, because the tree places the frame between the owner and its
// fields.

import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { cascadeContext } from '../toolbar/cascade';
import { BTN_SM, FIELD_LABEL, PANEL, SECTION_TITLE } from '../ui/chrome';
import { BorderEditor } from './BorderEditor';
import { readBorder } from './borderModel';
import { readRadius } from './borderRadius';
import type { Frame } from './frameModel';
import { hasCapability } from './itemPanelProps';
import { PaddingField } from './PaddingField';
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
  return (
    <aside className={PANEL} aria-label={t('panel.title')}>
      <h3 className={SECTION_TITLE}>{t(`panel.frame.title.${kind}`)}</h3>
      <p className="mt-0 mb-2 text-sm text-muted">{t(`panel.frame.every.${kind}`)}</p>
      {kind === 'columnCell' ? (
        <p className="mt-0 mb-2 text-sm text-muted">{t('panel.frame.columnNote')}</p>
      ) : null}
      <PaddingField controller={controller} path={path} />
      {hasCapability(capabilities, 'style.backgroundColor') ? (
        <PanelColorField
          label={t('panel.field.backgroundColor')}
          styleKey="backgroundColor"
          ctx={cascadeContext(controller.read, path, floor)}
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
      {onSelectPath === undefined ? null : (
        <button type="button" className={BTN_SM} onClick={() => onSelectPath(frame.ownerPath)}>
          {t(`panel.frame.selectOwner.${kind}`)}
        </button>
      )}
    </aside>
  );
}
