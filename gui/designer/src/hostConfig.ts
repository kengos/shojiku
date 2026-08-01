// The RESOLVED host configuration: the `props.ts` values the render tree reads,
// with every default already applied. One bundle rather than a loose scatter —
// the shell children took nine of these as separate props before, and a default
// resolved in two places can fork.
//
// The raw untrusted host inputs (`hostMenuEntries`) deliberately do NOT live
// here: this bundle is threaded to every shell child, and unvalidated host
// input has no business reaching that far. It stays a narrow TopChrome input,
// validated (`validateHostEntries`) adjacent to the menubar it feeds.

import type { ImageCodec } from './image/import';
import type { DesignerProps } from './props';
import type { ValueSynth } from './sample/synth';

export interface HostConfig {
  /** Host-installed `fontFamily` options — the family dropdown's rows. */
  readonly fontFamilies: readonly string[] | undefined;
  /** The engine's capability keys; absent = the bundled engine (every key). */
  readonly capabilities: readonly string[] | undefined;
  readonly defaultFontFamily: string | undefined;
  /** The locale the ENGINE formats in (distinct from the chrome `locale`). */
  readonly engineLocale: string | undefined;
  /** The resolved chrome locale (the i18n catalog's). */
  readonly locale: string;
  readonly imageCodec: ImageCodec | undefined;
  readonly synth: ValueSynth | undefined;
  /** Mounted host: the sample side is read-only. */
  readonly sampleDataReadOnly: boolean;
  /** App-derived from the definitions-save wire — adds the data-item editor's
   * project-scope impact hint. */
  readonly definitionsProjectScoped: boolean;
}

/** Resolve the host configuration once, in the composer. The two flags carry
 * their defaults HERE and nowhere else, so the render tree can never read a
 * different default than the wiring did. */
export function hostConfigOf(props: DesignerProps, locale: string): HostConfig {
  // Destructuring defaults, not `?? false` in the body — the same construct the
  // composer used before, so the resolved flags keep their existing coverage
  // shape rather than gaining a nullish branch to cover.
  const { sampleDataReadOnly = false, definitionsProjectScoped = false } = props;
  return {
    fontFamilies: props.fontFamilies,
    capabilities: props.capabilities,
    defaultFontFamily: props.defaultFontFamily,
    engineLocale: props.engineLocale,
    locale,
    imageCodec: props.imageCodec,
    synth: props.synth,
    sampleDataReadOnly,
    definitionsProjectScoped,
  };
}
