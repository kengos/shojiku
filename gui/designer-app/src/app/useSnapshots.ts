// Restore points: named captures of the working copy over the LOCAL snapshot
// store, in both modes. This hook owns the dialog's state and the store I/O;
// the RESTORE itself is the caller's (it reseeds the document, which the editor
// screen owns) — `restore` closes the dialog and hands the point over.

import type { SampleSet } from '@shojiku/designer';
import { toStored } from '@shojiku/designer';
import { useState } from 'react';
import type { InstalledFont } from '../fonts/library';
import type { Snapshot } from '../persistence/snapshotEntry';
import type { SnapshotStore } from '../persistence/snapshots';

export interface SnapshotsOptions {
  readonly snapshots: SnapshotStore;
  readonly docKey: string;
  /** Injected clock — keeps capture timestamps and relative freshness
   * deterministic in tests. */
  readonly now: () => number;
  readonly currentText: string;
  readonly sampleSet: SampleSet;
  readonly fonts: () => readonly InstalledFont[];
  /** Replace the working copy with this point — the caller reseeds. */
  readonly onRestore: (snapshot: Snapshot) => void;
}

export interface Snapshots {
  readonly open: boolean;
  readonly list: readonly Snapshot[];
  /** The reference time freshness is measured against (captured at open). */
  readonly now: number;
  readonly busy: boolean;
  readonly error: boolean;
  readonly openDialog: () => void;
  readonly close: () => void;
  readonly capture: (name: string) => void;
  readonly remove: (id: string) => void;
  readonly restore: (snapshot: Snapshot) => void;
}

export function useSnapshots({
  snapshots,
  docKey,
  now,
  currentText,
  sampleSet,
  fonts,
  onRestore,
}: SnapshotsOptions): Snapshots {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<readonly Snapshot[]>([]);
  const [stamp, setStamp] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const refresh = () => {
    void snapshots.list(docKey).then(setList);
  };

  return {
    open,
    list,
    now: stamp,
    busy,
    error,
    openDialog: () => {
      setError(false);
      setStamp(now());
      setOpen(true);
      refresh();
    },
    close: () => setOpen(false),
    // Capture the current working copy (text + picked fonts + the sample set).
    // The sample rides in both modes — on a mounted host it equals the
    // engineer's data, so restoring it is a harmless no-op there. A `full`
    // outcome cannot arrive (the dialog disables capture at the cap), so any
    // non-ok is the storage-failure banner.
    capture: (name: string) => {
      setBusy(true);
      setError(false);
      void snapshots
        .capture(docKey, {
          name,
          createdAt: now(),
          text: currentText,
          fonts: fonts(),
          sample: toStored(sampleSet),
        })
        .then((outcome) => {
          setBusy(false);
          if (outcome.ok) {
            refresh();
          } else {
            setError(true);
          }
        });
    },
    remove: (id: string) => {
      void snapshots.remove(docKey, id).then(refresh);
    },
    restore: (snapshot: Snapshot) => {
      setOpen(false);
      onRestore(snapshot);
    },
  };
}
