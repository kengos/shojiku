// EditorScreen-level tests for useFontInstall.ts — the font-picker flow for
// one mount: capability-narrowed picker gate, pick/install, draft restore,
// degraded failures behind the banner.
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FontCatalog } from '../fonts/catalog';
import { DraftStore } from '../persistence/drafts';
import { FILES, memoryStorage, services, TEMPLATE } from '../testkit/fixtures';
import { fakeController, LATO_FONT, prepWithFonts } from '../testkit/fonts';
import { pickMenu, renderEditor } from '../testkit/harness';
import { EditorScreen } from './EditorScreen';

const FONT_CATALOG: FontCatalog = {
  version: 1,
  ref: 'abc',
  families: [
    {
      id: 'lato',
      family: 'Lato',
      category: 'Sans Serif',
      subsets: ['latin'],
      license: 'OFL-1.1',
      licenseFile: 'OFL.txt',
      licenseUrl: 'https://raw.githubusercontent.com/x/OFL.txt',
      faces: [{ file: 'Lato-Regular.ttf', url: 'https://raw.githubusercontent.com/x/L.ttf' }],
    },
  ],
};

/** A structural FontController fake: the screen only calls these members. */

describe('EditorScreen font picker', () => {
  it('hides the add-font button when the engine lacks the capabilities', () => {
    const svc = services({ loadFontCatalog: vi.fn() });
    renderEditor(
      <EditorScreen
        services={svc}
        docKey="p"
        engineLocale="en-US"
        files={FILES}
        prep={prepWithFonts(null)}
        initialText={TEMPLATE}
        onBack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'File' }));
    expect(screen.queryByRole('menuitem', { name: 'Add font…' })).toBeNull();
  });

  it('hides the add-font button when the host offers no catalog', () => {
    const svc = services();
    renderEditor(
      <EditorScreen
        services={svc}
        docKey="p"
        engineLocale="en-US"
        files={FILES}
        prep={prepWithFonts(fakeController())}
        initialText={TEMPLATE}
        onBack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'File' }));
    expect(screen.queryByRole('menuitem', { name: 'Add font…' })).toBeNull();
  });

  it('opens the picker, installs a pick, autosaves the fonts, and feeds the panel', async () => {
    const drafts = new DraftStore(memoryStorage());
    const controller = fakeController();
    const svc = services({ drafts, loadFontCatalog: vi.fn(async () => FONT_CATALOG) });
    renderEditor(
      <EditorScreen
        services={svc}
        docKey="p"
        engineLocale="en-US"
        files={FILES}
        prep={prepWithFonts(controller)}
        initialText={TEMPLATE}
        onBack={vi.fn()}
      />,
    );
    pickMenu('File', 'Add font…');
    expect(await screen.findByRole('dialog')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Lato/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add this font' }));
    await waitFor(() => expect(controller.pick).toHaveBeenCalled());
    // The draft now carries the installed font (reload survives the tab).
    await waitFor(async () => expect((await drafts.load('p'))?.fonts).toEqual([LATO_FONT]));
    // And the modal closes on demand.
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('reopens the picker from the cached catalog without a second fetch', async () => {
    const load = vi.fn(async () => FONT_CATALOG);
    const svc = services({ loadFontCatalog: load });
    renderEditor(
      <EditorScreen
        services={svc}
        docKey="p"
        engineLocale="en-US"
        files={FILES}
        prep={prepWithFonts(fakeController())}
        initialText={TEMPLATE}
        onBack={vi.fn()}
      />,
    );
    pickMenu('File', 'Add font…');
    expect(await screen.findByRole('dialog')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    pickMenu('File', 'Add font…');
    expect(await screen.findByRole('dialog')).toBeDefined();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('shows a localized banner when the install fails', async () => {
    const controller = fakeController({
      pick: vi.fn(async () => Promise.reject(new Error('offline'))),
    });
    const svc = services({ loadFontCatalog: vi.fn(async () => FONT_CATALOG) });
    renderEditor(
      <EditorScreen
        services={svc}
        docKey="p"
        engineLocale="en-US"
        files={FILES}
        prep={prepWithFonts(controller)}
        initialText={TEMPLATE}
        onBack={vi.fn()}
      />,
    );
    pickMenu('File', 'Add font…');
    fireEvent.click(await screen.findByRole('button', { name: /Lato/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add this font' }));
    expect(await screen.findByText(/could not be added/)).toBeDefined();
  });

  it('closes the picker and shows the banner when the catalog fetch fails', async () => {
    const svc = services({
      loadFontCatalog: vi.fn(async () => Promise.reject(new Error('404'))),
    });
    renderEditor(
      <EditorScreen
        services={svc}
        docKey="p"
        engineLocale="en-US"
        files={FILES}
        prep={prepWithFonts(fakeController())}
        initialText={TEMPLATE}
        onBack={vi.fn()}
      />,
    );
    pickMenu('File', 'Add font…');
    expect(await screen.findByText(/could not be added/)).toBeDefined();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it("restores a draft's fonts on mount through the controller", async () => {
    const controller = fakeController();
    const svc = services({ loadFontCatalog: vi.fn(async () => FONT_CATALOG) });
    renderEditor(
      <EditorScreen
        services={svc}
        docKey="p"
        engineLocale="en-US"
        files={FILES}
        prep={prepWithFonts(controller)}
        initialText={TEMPLATE}
        initialFonts={[LATO_FONT]}
        onBack={vi.fn()}
      />,
    );
    await waitFor(() => expect(controller.restore).toHaveBeenCalledWith([LATO_FONT]));
  });

  it("shows the banner when a draft's font restore fails, and stays usable", async () => {
    const controller = fakeController({
      restore: vi.fn(async () => Promise.reject(new Error('offline'))),
    });
    const svc = services({ loadFontCatalog: vi.fn(async () => FONT_CATALOG) });
    renderEditor(
      <EditorScreen
        services={svc}
        docKey="p"
        engineLocale="en-US"
        files={FILES}
        prep={prepWithFonts(controller)}
        initialText={TEMPLATE}
        initialFonts={[LATO_FONT]}
        onBack={vi.fn()}
      />,
    );
    expect(await screen.findByText(/could not be added/)).toBeDefined();
    // The editor stays usable — its menubar chrome is still present.
    expect(screen.getByRole('button', { name: 'File' })).toBeDefined();
  });

  it('exports a kit when fonts are installed', async () => {
    const controller = fakeController();
    const svc = services({ loadFontCatalog: vi.fn(async () => FONT_CATALOG) });
    renderEditor(
      <EditorScreen
        services={svc}
        docKey="p"
        engineLocale="en-US"
        files={FILES}
        prep={prepWithFonts(controller)}
        initialText={TEMPLATE}
        initialFonts={[LATO_FONT]}
        onBack={vi.fn()}
      />,
    );
    await waitFor(() => expect(controller.restore).toHaveBeenCalled());
    pickMenu('File', 'Export');
    const exported = (svc.exportFile as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      filename: string;
      bytes?: Uint8Array;
    };
    expect(exported.filename).toBe('p-kit.zip');
    expect(exported.bytes).toBeInstanceOf(Uint8Array);
  });
});
