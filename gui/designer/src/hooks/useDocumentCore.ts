// The composer's HEAD: the document itself and everything derived straight
// from it — the size cap, the editor session, the sample data, the definitions
// ownership, the preview session, and the theme style. A contiguous prefix of
// the wiring order, so calling it where those hooks used to sit keeps every
// effect in its original position.

import type { CSSProperties } from 'react';
import { useMemo } from 'react';
import { useEditor } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { useEngineTransport } from '../preview/context';
import { DEFAULT_SCALE } from '../preview/usePreview';
import type { DesignerProps } from '../props';
import { cssVars, resolveTheme } from '../theme/resolve';
import { useDefinitionsOwnership } from './useDefinitionsOwnership';
import { usePreviewSession } from './usePreviewSession';
import { useSampleData } from './useSampleData';
import { useTemplateCap } from './useTemplateCap';

export interface DocumentCore {
  readonly transport: ReturnType<typeof useEngineTransport>;
  readonly t: ReturnType<typeof useI18n>['t'];
  readonly locale: string;
  readonly cap: ReturnType<typeof useTemplateCap>;
  readonly editor: ReturnType<typeof useEditor>;
  readonly sample: ReturnType<typeof useSampleData>;
  readonly defs: ReturnType<typeof useDefinitionsOwnership>;
  readonly session: ReturnType<typeof usePreviewSession>;
  readonly themeStyle: CSSProperties;
}

export function useDocumentCore({
  source,
  params: initialParams,
  sampleSet: initialSampleSet,
  onSampleSetChange,
  onParamsChange,
  definitions,
  sampleDataReadOnly = false,
  initialDefinitionsEdits,
  onDefinitionsChange,
  templateMaxBytes,
  scale = DEFAULT_SCALE,
  colorScheme = 'light',
  theme,
}: DesignerProps): DocumentCore {
  const transport = useEngineTransport();
  const { t, locale } = useI18n();
  const cap = useTemplateCap(templateMaxBytes, source);
  const editor = useEditor(source, cap.maxBytes);

  const sample = useSampleData({
    initialParams,
    initialSampleSet,
    onSampleSetChange,
    onParamsChange,
    definitions,
    sampleDataReadOnly,
  });
  const defs = useDefinitionsOwnership({
    definitions,
    stub: sample.stub,
    initialDefinitionsEdits,
    onDefinitionsChange,
  });
  // Zoom → render → auto-fit, in that order (the zoom picks the render scale;
  // Fit measures what the render produced). The stub never reaches the engine:
  // its job is the PALETTE + the exported artifact, not the in-session call.
  const session = usePreviewSession({
    transport,
    text: editor.text,
    params: sample.params,
    definitions: defs.definitionsForEngine,
    baseScale: scale,
    maxBytes: cap.maxBytes,
  });
  const themeStyle = useMemo(
    // React's CSSProperties type has no index for custom properties; the
    // cssVars map is exactly `--sj-*: string` entries, which React applies
    // via style.setProperty.
    () => cssVars(resolveTheme(colorScheme, theme)) as CSSProperties,
    [colorScheme, theme],
  );

  return { transport, t, locale, cap, editor, sample, defs, session, themeStyle };
}
