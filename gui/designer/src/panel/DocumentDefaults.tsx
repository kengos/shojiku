// The document-defaults surface: it edits the template's `defaults:` map, which
// is two unrelated things — the cascade root style (`DefaultsStyleFields`) and
// the locale / currency document settings (`DefaultsLocaleFields`). This module
// is the shell that gates them on the engine's capabilities and renders
// whichever half its host asked for.
//
// `section` is REQUIRED: the document-settings view opens one half at a time
// and supplies the heading itself, which is the only way this surface is
// reached. It once also had a headed standalone stacked form for a host that
// wanted both at once; nothing ever asked for it.

import type { EditorController } from '../editor/useEditor';
import type { LocaleFacts } from '../engine/types';
import { DefaultsLocaleFields } from './DefaultsLocaleFields';
import { DefaultsStyleSection } from './DefaultsStyleFields';
import { hasCapability } from './itemPanelProps';

export interface DocumentDefaultsProps {
  readonly controller: EditorController;
  readonly fontFamilies?: readonly string[];
  readonly capabilities?: readonly string[];
  /** The locale's default font face (the engine's `fontFamily` default) —
   * seeded into the unset family field. Absent → that field shows a localized
   * placeholder instead of a seed value. */
  readonly defaultFontFamily?: string;
  /** What the picked `defaults.locale` DOES, as the engine's own rendered
   * samples — `null` (the default) claims nothing about the pick, which is
   * also what an engine without the `locale.facts` query leaves behind. */
  readonly localeFacts?: LocaleFacts | null;
  /** Which half to render — the caller supplies the heading, so no internal
   * `<h3>`/`<h4>` chrome: `'locale'` = the locale + currency controls,
   * `'style'` = the inherited-style defaults. */
  readonly section: 'locale' | 'style';
}

/** A capability-gated feature is shown when the host did not gate at all, or the
 * key is present (never version-sniff). A half whose capability is gated off
 * renders nothing. */
export function DocumentDefaults({
  controller,
  fontFamilies = [],
  capabilities,
  defaultFontFamily,
  localeFacts = null,
  section,
}: DocumentDefaultsProps) {
  if (section === 'locale') {
    return hasCapability(capabilities, 'template.defaults.document') ? (
      <div>
        <DefaultsLocaleFields controller={controller} facts={localeFacts} />
      </div>
    ) : null;
  }
  return hasCapability(capabilities, 'template.defaults') ? (
    <DefaultsStyleSection
      controller={controller}
      fontFamilies={fontFamilies}
      defaultFontFamily={defaultFontFamily}
    />
  ) : null;
}
