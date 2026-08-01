// The font-picker modal: search the catalog snapshot, preview a family, add it.
//
// Selection-first UX (the daily user picks, never types an id): a searchable
// list narrowed by writing-system subset, a per-family detail pane whose sample
// renders in the REAL font once the injected specimen loader resolves, the
// licence spelled out, and one Add action. The modal itself performs no
// installation — `onPick` hands the family to the owner (the editor screen),
// which drives the install flow and its progress/failure chrome, so this
// component stays pure over its props.

import { useI18n } from '@shojiku/designer';
import { useEffect, useState } from 'react';
import { APP_BUTTON, APP_SELECT } from '../app/chrome';
import { type CatalogFamily, catalogSubsets, type FontCatalog, searchFamilies } from './catalog';
import { packIdFor } from './manifest';

export interface FontPickerProps {
  readonly catalog: FontCatalog;
  /** Preselected subset filter (the preset locale's writing system), when it
   * exists in the catalog; the user can always widen to all. */
  readonly defaultSubset?: string;
  /** Load a family's specimen: resolves the CSS font-family name to render the
   * sample with (the host wires FontFace over the fetched face bytes), or null
   * for no specimen. Absent → samples render in the UI font. */
  readonly specimen?: (family: CatalogFamily) => Promise<string | null>;
  /** True while the owner is installing a pick — disables Add (single-flight). */
  readonly busy: boolean;
  /** Already-installed pack ids (the controller's) — an installed family shows
   * as added instead of addable. Matched via `packIdFor`, the ONE home of the
   * catalog-id → pack-id mapping. */
  readonly installedPackIds: readonly string[];
  readonly onPick: (family: CatalogFamily) => void;
  readonly onClose: () => void;
}

const SAMPLE_TEXT = 'AaBbCc 0123 あア亜';

export function FontPicker({
  catalog,
  defaultSubset,
  specimen,
  busy,
  installedPackIds,
  onPick,
  onClose,
}: FontPickerProps) {
  const { t } = useI18n();
  const subsets = catalogSubsets(catalog);
  const [query, setQuery] = useState('');
  const [subset, setSubset] = useState(
    defaultSubset !== undefined && subsets.includes(defaultSubset) ? defaultSubset : '',
  );
  const [selected, setSelected] = useState<CatalogFamily | null>(null);
  const [specimenFont, setSpecimenFont] = useState<string | null>(null);

  const results = searchFamilies(catalog, query, subset === '' ? undefined : subset);

  // Resolve the selected family's specimen. Guarded against out-of-order
  // resolutions: only the CURRENT selection's font may land.
  useEffect(() => {
    setSpecimenFont(null);
    if (selected === null || specimen === undefined) {
      return;
    }
    let stale = false;
    specimen(selected).then(
      (font) => {
        if (!stale) {
          setSpecimenFont(font);
        }
      },
      () => {
        // No specimen is a degraded preview, never an error state.
      },
    );
    return () => {
      stale = true;
    };
  }, [selected, specimen]);

  const alreadyInstalled = selected !== null && installedPackIds.includes(packIdFor(selected));

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40">
      <dialog
        open
        className="m-0 flex max-h-[80vh] w-[min(640px,92vw)] flex-col overflow-hidden rounded-[calc(var(--sj-radius)+3px)] border border-border bg-chrome text-text shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
        aria-label={t('fontPicker.title')}
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="m-0 text-[15px]">{t('fontPicker.title')}</h2>
          <button type="button" className={APP_BUTTON} onClick={onClose}>
            {t('fontPicker.close')}
          </button>
        </header>
        <div className="flex gap-3 border-b border-border px-4 py-2 text-sm text-muted">
          <label className="flex items-center gap-2">
            {t('fontPicker.search')}
            <input
              type="search"
              className={APP_SELECT}
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </label>
          <label className="flex items-center gap-2">
            {t('fontPicker.subset')}
            <select
              className={APP_SELECT}
              value={subset}
              onChange={(event) => setSubset(event.currentTarget.value)}
            >
              <option value="">{t('fontPicker.subsetAll')}</option>
              {subsets.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
        {results.length === 0 ? (
          <p className="m-0 p-4 text-muted">{t('fontPicker.empty')}</p>
        ) : (
          <ul className="m-0 flex-1 list-none overflow-y-auto p-2">
            {results.map((family) => (
              <li key={family.id}>
                <button
                  type="button"
                  className="flex w-full cursor-pointer justify-between gap-2 rounded-md border border-transparent bg-transparent px-3 py-1 text-left text-text hover:bg-bg aria-pressed:border-accent aria-pressed:bg-bg"
                  aria-pressed={selected?.id === family.id}
                  onClick={() => setSelected(family)}
                >
                  {family.family}
                  <span className="text-sm text-muted">{family.category}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {selected !== null ? (
          <div className="border-t border-border px-4 py-3">
            <p
              className="m-0 mb-2 text-lg"
              style={specimenFont !== null ? { fontFamily: specimenFont } : undefined}
            >
              {SAMPLE_TEXT}
            </p>
            <p className="m-0 mb-2 text-sm text-muted">
              {t('fontPicker.license')}: {selected.license}
            </p>
            {alreadyInstalled ? (
              <p className="m-0 text-muted">{t('fontPicker.installed')}</p>
            ) : (
              <button
                type="button"
                className={APP_BUTTON}
                disabled={busy}
                onClick={() => onPick(selected)}
              >
                {busy ? t('fontPicker.installing') : t('fontPicker.add')}
              </button>
            )}
          </div>
        ) : null}
      </dialog>
    </div>
  );
}
