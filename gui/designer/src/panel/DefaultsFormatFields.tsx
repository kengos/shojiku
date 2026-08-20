// The document-settings 表示形式 section: `defaults.formats` — how each kind of
// value looks THROUGHOUT the document, unless an item overrides it. A live view
// (it re-reads `controller.read('defaults')` each render) dispatching one
// root-addressed named op per edit, like every other panel surface.
//
// It sits directly after ロケール・通貨 in the section rail because the two are
// read together: 和暦 comes from the ja-JP pack and the currency symbol from
// `defaults.currency`, so what this section can offer is downstream of what
// that one is set to.
//
// The vocabulary and every sample come from the ENGINE's format catalog. With
// no catalog (an older engine, or a host whose transport omits the query) the
// rows still show what the document holds, without samples and without a
// vocabulary to pick from — degraded, never blank.

import type { EditorController } from '../editor/useEditor';
import type { FormatCatalog, PatternProbe, ProbeResult } from '../engine/types';
import { FORMAT_DEFAULT_TYPES } from '../formats/model';
import { useI18n } from '../i18n/context';
import { FormatDefaultRow } from './FormatDefaultRow';
import {
  formatDefaultNameOp,
  formatDefaultPatternOp,
  readFormatDefaultsView,
} from './formatDefaultsModel';
import { applyPanelOp } from './model';

export interface DefaultsFormatFieldsProps {
  readonly controller: EditorController;
  readonly catalog: FormatCatalog | null;
  readonly probe: (probes: readonly PatternProbe[]) => Promise<readonly ProbeResult[]>;
}

export function DefaultsFormatFields({ controller, catalog, probe }: DefaultsFormatFieldsProps) {
  const { t } = useI18n();
  const view = readFormatDefaultsView(controller.read('defaults'));

  return (
    <div>
      <p className="mt-0 mb-2 text-sm text-muted">{t('formats.defaultsIntro')}</p>
      {FORMAT_DEFAULT_TYPES.map((type) => {
        const value = view[type];
        return (
          <FormatDefaultRow
            key={type}
            type={type}
            value={value}
            catalog={catalog}
            probe={probe}
            onPick={(spelling) => applyPanelOp(controller, formatDefaultNameOp(type, spelling))}
            // An empty pattern yields no op: `InlineFormat.pattern` is a
            // REQUIRED wire field, so clearing the box would author a template
            // the engine cannot parse — the field simply reseeds instead.
            onPattern={(pattern) =>
              applyPanelOp(controller, formatDefaultPatternOp(type, pattern, value))
            }
          />
        );
      })}
    </div>
  );
}
