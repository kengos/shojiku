// The background engine-module load, as chrome that does NOT block anything.
// Catalog-first boot means the template catalog renders while the wasm module is
// still arriving, so the module's progress has to live in the shell rather than
// in front of it: a hairline rail under the header, plus a muted status line in
// the header itself. Both disappear the moment the module is ready — a finished
// download has nothing to say.
//
// Kept in one file because they are one concern (the same load, reported in two
// places) and each is a handful of lines.

import { useI18n } from '@shojiku/designer';
import type { ModuleLoad } from './moduleLoad';
import { ProgressBar } from './ProgressBar';
import { readProgress } from './progress';

export interface EngineLoadProps {
  readonly load: ModuleLoad;
}

/** The hairline rail directly under the app header. Nothing at all once the
 * module is ready or has failed — the failure is reported in words (in the
 * header, and in the open panel when a preset is waiting on it), never as a bar
 * frozen part-way. */
export function EngineLoadBar({ load }: EngineLoadProps) {
  const { t } = useI18n();
  if (load.kind !== 'loading') {
    return null;
  }
  return (
    <ProgressBar
      reading={readProgress(load.bytes)}
      label={t('app.loading.engine')}
      heightClass="h-[3px] rounded-none"
    />
  );
}

/** The header's status line: what is happening, plus the percentage when the
 * transfer size is known. Right-aligned before the header's icon controls. */
export function EngineLoadStatus({ load }: EngineLoadProps) {
  const { t } = useI18n();
  if (load.kind === 'failed') {
    // The header gets the short form; the full sentence (with the remedy) goes
    // in the open panel, where the user is actually blocked.
    return (
      <output className="shrink-0 text-error-text text-xs">{t('app.loading.failedShort')}</output>
    );
  }
  if (load.kind !== 'loading') {
    return null;
  }
  const reading = readProgress(load.bytes);
  return (
    <output className="shrink-0 text-muted text-xs tabular-nums">
      {t('app.loading.engine')}
      {reading !== null ? ` ${String(reading.percent)}%` : null}
    </output>
  );
}
