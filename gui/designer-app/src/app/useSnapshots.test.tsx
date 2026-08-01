// EditorScreen-level tests for useSnapshots.ts — the restore-points dialog
// state + store I/O (refuse-at-cap, quota failures surfaced, restore
// reseeds the document).
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DraftStore } from '../persistence/drafts';
import { SnapshotStore } from '../persistence/snapshots';
import {
  clean,
  FILES,
  makePrep,
  memoryStorage,
  resolvingFonts,
  services,
  TEMPLATE,
} from '../testkit/fixtures';
import { fakeController, LATO_FONT, prepWithFonts } from '../testkit/fonts';
import { pickMenu, renderEditor } from '../testkit/harness';
import { EditorScreen } from './EditorScreen';

const unwritableStorage = (): Storage =>
  ({
    getItem: () => null,
    setItem: () => {
      throw new Error('quota');
    },
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  }) as unknown as Storage;

const withSample = {
  active: 'default',
  variants: [{ id: 'default', text: '{}' }],
} as const;

describe('EditorScreen restore points', () => {
  it('opens the restore-points dialog from the File menu (empty)', () => {
    renderEditor(
      <EditorScreen
        services={services()}
        docKey="p"
        engineLocale="en-US"
        files={FILES}
        prep={makePrep(clean, resolvingFonts(), [])}
        initialText={TEMPLATE}
        onBack={vi.fn()}
      />,
    );
    pickMenu('File', 'Restore points…');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/No restore points yet/)).toBeTruthy();
  });

  it('closes the restore-points dialog via its close button', () => {
    renderEditor(
      <EditorScreen
        services={services()}
        docKey="p"
        engineLocale="en-US"
        files={FILES}
        prep={makePrep(clean, resolvingFonts(), [])}
        initialText={TEMPLATE}
        onBack={vi.fn()}
      />,
    );
    pickMenu('File', 'Restore points…');
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    // onClose ran without wedging the editor — the menu is still operable.
    expect(screen.getByRole('button', { name: 'File' })).toBeTruthy();
  });

  it('captures the current working copy under a name', async () => {
    const snapshots = new SnapshotStore(memoryStorage());
    renderEditor(
      <EditorScreen
        services={services({ snapshots, now: () => 4242 })}
        docKey="p"
        engineLocale="en-US"
        files={FILES}
        prep={makePrep(clean, resolvingFonts(), [])}
        initialText={TEMPLATE}
        onBack={vi.fn()}
      />,
    );
    pickMenu('File', 'Restore points…');
    fireEvent.change(screen.getByLabelText('Restore point name'), {
      target: { value: 'before change' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save point' }));
    await waitFor(async () => expect((await snapshots.list('p')).length).toBe(1));
    const [saved] = await snapshots.list('p');
    expect(saved.name).toBe('before change');
    expect(saved.createdAt).toBe(4242);
    expect(saved.text).toBe(TEMPLATE);
    expect(await screen.findByText('before change')).toBeTruthy();
  });

  it('surfaces a storage failure when a capture cannot be saved', async () => {
    const snapshots = new SnapshotStore(unwritableStorage());
    renderEditor(
      <EditorScreen
        services={services({ snapshots })}
        docKey="p"
        engineLocale="en-US"
        files={FILES}
        prep={makePrep(clean, resolvingFonts(), [])}
        initialText={TEMPLATE}
        onBack={vi.fn()}
      />,
    );
    pickMenu('File', 'Restore points…');
    fireEvent.change(screen.getByLabelText('Restore point name'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save point' }));
    expect(await screen.findByText(/Could not save the point/)).toBeTruthy();
  });

  it('restores a point (with sample), replacing the working copy', async () => {
    const alt = TEMPLATE.replace('"hi"', '"restored"');
    const snapshots = new SnapshotStore(memoryStorage());
    await snapshots.capture('p', {
      name: 'earlier',
      createdAt: 1,
      text: alt,
      fonts: [],
      sample: withSample,
    });
    const drafts = new DraftStore(memoryStorage());
    renderEditor(
      <EditorScreen
        services={services({ snapshots, drafts })}
        docKey="p"
        engineLocale="en-US"
        files={FILES}
        prep={makePrep(clean, resolvingFonts(), [])}
        initialText={TEMPLATE}
        onBack={vi.fn()}
      />,
    );
    pickMenu('File', 'Restore points…');
    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    // The restored working copy is persisted as the local draft.
    await waitFor(async () => expect((await drafts.load('p'))?.text).toBe(alt));
  });

  it('restores a point’s fonts, replacing the picked set', async () => {
    const snapshots = new SnapshotStore(memoryStorage());
    await snapshots.capture('p', {
      name: 'fonts pt',
      createdAt: 1,
      text: TEMPLATE,
      fonts: [LATO_FONT],
    });
    const controller = fakeController();
    renderEditor(
      <EditorScreen
        services={services({ snapshots, loadFontCatalog: vi.fn() })}
        docKey="p"
        engineLocale="en-US"
        files={FILES}
        prep={prepWithFonts(controller)}
        initialText={TEMPLATE}
        onBack={vi.fn()}
      />,
    );
    pickMenu('File', 'Restore points…');
    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(controller.restore).toHaveBeenCalledWith([LATO_FONT]));
  });

  it('shows a font error when restoring a point’s fonts fails', async () => {
    const snapshots = new SnapshotStore(memoryStorage());
    await snapshots.capture('p', {
      name: 'fonts pt',
      createdAt: 1,
      text: TEMPLATE,
      fonts: [LATO_FONT],
    });
    const controller = fakeController({
      restore: vi.fn(async () => {
        throw new Error('reload failed');
      }),
    });
    renderEditor(
      <EditorScreen
        services={services({ snapshots, loadFontCatalog: vi.fn() })}
        docKey="p"
        engineLocale="en-US"
        files={FILES}
        prep={prepWithFonts(controller)}
        initialText={TEMPLATE}
        onBack={vi.fn()}
      />,
    );
    pickMenu('File', 'Restore points…');
    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(await screen.findByText(/font could not be added/)).toBeTruthy();
  });

  it('deletes a restore point', async () => {
    const snapshots = new SnapshotStore(memoryStorage());
    await snapshots.capture('p', { name: 'doomed', createdAt: 1, text: TEMPLATE, fonts: [] });
    renderEditor(
      <EditorScreen
        services={services({ snapshots })}
        docKey="p"
        engineLocale="en-US"
        files={FILES}
        prep={makePrep(clean, resolvingFonts(), [])}
        initialText={TEMPLATE}
        onBack={vi.fn()}
      />,
    );
    pickMenu('File', 'Restore points…');
    expect(await screen.findByText('doomed')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(async () => expect((await snapshots.list('p')).length).toBe(0));
  });
});
