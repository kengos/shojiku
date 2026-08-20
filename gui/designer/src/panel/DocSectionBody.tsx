// WHICH surface each document-settings section shows. Split out of the page so
// the page owns navigation (the rail, the selected section, the preview pane)
// and this owns the section→component mapping; adding a section then touches
// the vocabulary (`docSections`) and this file, never the page's layout.
//
// A section's own capability gate lives HERE rather than at the rail, because
// the 表示形式 section has TWO gated halves and either one alone is still a
// section worth opening. The rail's decision — whether to LIST the row at all
// — is the page's, and reads the same two flags.

import type { EditorController } from '../editor/useEditor';
import type { FormatCatalog, PatternProbe, ProbeResult } from '../engine/types';
import type { FormatUsage } from '../formats/usage';
import type { StyleUsage } from '../styles/usage';
import { DefaultsFormatFields } from './DefaultsFormatFields';
import { DocumentDefaults } from './DocumentDefaults';
import { DocumentMetaFields } from './DocumentMetaFields';
import type { DocSection } from './docSections';
import { FormatsManager } from './FormatsManager';
import { PageSetup } from './PageSetup';
import { StylesManager } from './StylesManager';

export interface DocSectionBodyProps {
  readonly section: DocSection;
  readonly controller: EditorController;
  readonly fontFamilies: readonly string[];
  readonly capabilities: readonly string[] | undefined;
  readonly defaultFontFamily: string | undefined;
  readonly styleUsage: StyleUsage | null;
  readonly formatUsage: FormatUsage | null;
  readonly formatCatalog: FormatCatalog | null;
  readonly probeFormat: (probes: readonly PatternProbe[]) => Promise<readonly ProbeResult[]>;
  /** `template.defaults` — the per-type format defaults half. */
  readonly showDefaults: boolean;
  /** `template.formats` — the named-format registry half. */
  readonly showRegistry: boolean;
  /** The session's template-size cap, for the registry rename's size guard. */
  readonly maxBytes: number;
}

export function DocSectionBody(props: DocSectionBodyProps) {
  const { section, controller, fontFamilies, capabilities, defaultFontFamily } = props;
  switch (section) {
    case 'page':
      return <PageSetup controller={controller} titled={false} />;
    case 'metadata':
      return <DocumentMetaFields controller={controller} />;
    case 'defaults':
      return (
        <DocumentDefaults
          controller={controller}
          fontFamilies={fontFamilies}
          capabilities={capabilities}
          defaultFontFamily={defaultFontFamily}
          section="style"
        />
      );
    case 'formats':
      return (
        <>
          {props.showDefaults ? (
            <DefaultsFormatFields
              controller={controller}
              catalog={props.formatCatalog}
              probe={props.probeFormat}
            />
          ) : null}
          {props.showRegistry ? (
            <FormatsManager
              controller={controller}
              usage={props.formatUsage}
              catalog={props.formatCatalog}
              probe={props.probeFormat}
              maxBytes={props.maxBytes}
            />
          ) : null}
        </>
      );
    case 'styles':
      return (
        <StylesManager
          controller={controller}
          fontFamilies={fontFamilies}
          usage={props.styleUsage}
          titled={false}
        />
      );
    default:
      return (
        <DocumentDefaults
          controller={controller}
          fontFamilies={fontFamilies}
          capabilities={capabilities}
          section="locale"
        />
      );
  }
}
