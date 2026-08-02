// The inputs every insert surface shares. Held as ONE context object so each
// scaffold hook takes a single argument; a hook destructures it at the top and
// puts those stable fields (never the context itself) in its memo deps.

import type { EditorController } from '../editor/useEditor';
import type { I18n } from '../i18n/context';
import type { ValueSynth } from '../sample/synth';
import type { SampleSet } from '../sample/variants';

export interface InsertContext {
  readonly read: EditorController['read'];
  readonly selection: string | null;
  readonly apply: EditorController['apply'];
  readonly applyAll: EditorController['applyAll'];
  readonly select: EditorController['select'];
  readonly t: I18n['t'];
  readonly params: string;
  readonly sampleSet: SampleSet;
  readonly commitSet: (next: SampleSet) => void;
  readonly synth: ValueSynth | undefined;
  readonly locale: string;
  /** Whether a scaffold may name a charset-unsafe field through a declaration
   * instead of degrading (an older engine parse-rejects `bindings:`). */
  readonly canDeclare: boolean;
}
