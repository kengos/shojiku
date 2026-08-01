// The format toolbar's border control: a rail button opening a popover that
// hosts the SAME `panel/BorderEditor` the decoration tab renders — no second
// implementation, and the editor carries no wire knowledge of its own.

import type { EditorController } from '../editor/useEditor';
import { usePopover } from '../hooks/usePopover';
import { useI18n } from '../i18n/context';
import { BorderEditor } from '../panel/BorderEditor';
import type { BorderView, RadiusView } from '../panel/borderTypes';
import { IconBorder } from '../ui/icons';
import { TipBubble } from '../ui/TipBubble';
import { FMT_BTN, FMT_POPOVER } from './fmtChrome';

/** The border control: a rail button opening a popover that hosts the shared
 * Excel-style `BorderEditor` (no second implementation — the same editor the
 * decoration tab renders). Keyed by path so the editor's pen resets on selection
 * change. */
export function BorderControl({
  view,
  radius,
  path,
  controller,
  capabilities,
  isTable,
}: {
  readonly view: BorderView;
  readonly radius: RadiusView;
  readonly path: string;
  readonly controller: EditorController;
  readonly capabilities?: readonly string[];
  readonly isTable: boolean;
}) {
  const { t } = useI18n();
  const { open, setOpen, rootRef } = usePopover();
  return (
    <div className="group/tip relative" ref={rootRef}>
      {open ? null : <TipBubble text={t('toolbar.border')} />}
      <button
        type="button"
        className={FMT_BTN}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('toolbar.border')}
        onClick={() => setOpen((v) => !v)}
      >
        <IconBorder size={15} />
      </button>
      {open ? (
        <div role="menu" className={`${FMT_POPOVER} w-72 p-3`}>
          <BorderEditor
            key={path}
            view={view}
            radius={radius}
            path={path}
            controller={controller}
            capabilities={capabilities}
            isTable={isTable}
          />
        </div>
      ) : null}
    </div>
  );
}
