// The per-document assembly's core suite: mount, preview wiring, draft
// save/restore, open/export, page setup, blocks. The remote-save / font /
// header-report / restore-point suites live next to their hooks
// (app/use*.test.tsx) over the shared ../testkit substrate.
import { type DefinitionsStore, I18nProvider, type TemplateDoc } from '@shojiku/designer';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FontSource } from '../engine/fontSource';
import { APP_CATALOG } from '../i18n/appCatalog';
import { DraftStore } from '../persistence/drafts';
import {
  clean,
  FILES,
  makePrep,
  memoryStorage,
  resolvingFonts,
  services,
  TEMPLATE,
  withGlyph,
} from '../testkit/fixtures';
import { fakeController, LATO_FONT, prepWithFonts } from '../testkit/fonts';
import {
  changePageSize,
  file,
  openDataField,
  pickMenu,
  renderEditor,
  reportedRename,
} from '../testkit/harness';
import type { HeaderDoc } from './AppHeader';
import { EditorScreen } from './EditorScreen';

describe('EditorScreen', () => {
  it('offers the booted pack families in the format toolbar family dropdown', () => {
    renderEditor(
      <EditorScreen
        services={services()}
        docKey="receipt-us"
        engineLocale="en-US"
        files={FILES}
        prep={{ ...makePrep(clean, resolvingFonts(), []), familyIds: ['biz-udp-gothic'] }}
        initialText={TEMPLATE}
        onBack={vi.fn()}
      />,
    );
    // Select the text item via the layer tree, then open the family dropdown.
    fireEvent.click(screen.getByRole('button', { name: 'hi' }));
    fireEvent.click(screen.getByLabelText('Font family'));
    expect(screen.getByRole('menuitemradio', { name: 'biz-udp-gothic' })).toBeTruthy();
  });

  it('threads the boot-collected copilot provider to the Designer (absent → hidden)', () => {
    const withoutCopilot = renderEditor(
      <EditorScreen
        services={services()}
        docKey="receipt-us"
        engineLocale="en-US"
        files={FILES}
        prep={makePrep(clean, resolvingFonts(), [])}
        initialText={TEMPLATE}
        onBack={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Ask AI' })).toBeNull();
    withoutCopilot.unmount();

    renderEditor(
      <EditorScreen
        services={services({ copilot: vi.fn(async () => ({ ops: [] })) })}
        docKey="receipt-us"
        engineLocale="en-US"
        files={FILES}
        prep={makePrep(clean, resolvingFonts(), [])}
        initialText={TEMPLATE}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Ask AI' })).toBeTruthy();
  });

  it('exports the current template text under a preset-named file', () => {
    const svc = services();
    renderEditor(
      <EditorScreen
        services={svc}
        docKey="receipt-us"
        engineLocale="en-US"
        files={FILES}
        prep={makePrep(clean, resolvingFonts(), [])}
        initialText={TEMPLATE}
        onBack={vi.fn()}
      />,
    );
    pickMenu('File', 'Export');
    expect(svc.exportFile).toHaveBeenCalledWith({
      filename: 'receipt-us-templates.yml',
      text: TEMPLATE,
    });
  });

  it('downloads the rendered PDF under the document name', async () => {
    const svc = services();
    renderEditor(
      <EditorScreen
        services={svc}
        docKey="receipt-us"
        engineLocale="en-US"
        documentName="Receipt US"
        files={FILES}
        prep={makePrep(clean, resolvingFonts(), [])}
        initialText={TEMPLATE}
        onBack={vi.fn()}
      />,
    );
    pickMenu('File', 'Download as PDF…');
    fireEvent.click(await screen.findByRole('button', { name: 'Download' }));
    // The engine's bytes go out through the SAME download seam as the YAML
    // export, named after the document.
    expect(svc.exportFile).toHaveBeenCalledWith({
      filename: 'receipt-us.pdf',
      bytes: expect.any(Uint8Array),
    });
  });

  it('still names the PDF when the host supplies no document name', async () => {
    const svc = services();
    renderEditor(
      <EditorScreen
        services={svc}
        docKey="receipt-us"
        engineLocale="en-US"
        files={FILES}
        prep={makePrep(clean, resolvingFonts(), [])}
        initialText={TEMPLATE}
        onBack={vi.fn()}
      />,
    );
    pickMenu('File', 'Download as PDF…');
    fireEvent.click(await screen.findByRole('button', { name: 'Download' }));
    expect(svc.exportFile).toHaveBeenCalledWith({
      filename: 'template.pdf',
      bytes: expect.any(Uint8Array),
    });
  });

  it('hides the PDF action when the booted engine lacks the capability', () => {
    // Pins the THREADING, not just the model: the app reads the real module's
    // key list, so a Designer that never received it would fail open here.
    const svc = services();
    renderEditor(
      <EditorScreen
        services={svc}
        docKey="receipt-us"
        engineLocale="en-US"
        files={FILES}
        prep={makePrep(clean, resolvingFonts(), [], [])}
        initialText={TEMPLATE}
        onBack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'File' }));
    expect(screen.queryByRole('menuitem', { name: 'Download as PDF…' })).toBeNull();
  });

  it('persists a saved reusable block through the app-global block store', () => {
    const svc = services();
    renderEditor(
      <EditorScreen
        services={svc}
        docKey="receipt-us"
        engineLocale="en-US"
        files={FILES}
        prep={makePrep(clean, resolvingFonts(), [])}
        initialText={TEMPLATE}
        onBack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'hi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save selection as block…' }));
    fireEvent.change(screen.getByLabelText('Block name'), { target: { value: 'seal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(svc.blocks.load().map((b) => b.name)).toEqual(['seal']);
  });

  it('opens a file, reseeds the editor, and exports the opened text', async () => {
    const opened = TEMPLATE.replace('"hi"', '"opened"');
    const svc = services({ openFile: vi.fn(async () => file('t.yml', 20, opened)) });
    renderEditor(
      <EditorScreen
        services={svc}
        docKey="receipt-us"
        engineLocale="en-US"
        files={FILES}
        prep={makePrep(clean, resolvingFonts(), [])}
        initialText={TEMPLATE}
        onBack={vi.fn()}
      />,
    );
    pickMenu('File', 'Open…');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    pickMenu('File', 'Export');
    expect(svc.exportFile).toHaveBeenLastCalledWith({
      filename: 'receipt-us-templates.yml',
      text: opened,
    });
  });

  it('shows an error banner when the opened file is too large', async () => {
    const svc = services({ openFile: vi.fn(async () => file('big.yml', 10 * 1024 * 1024, 'x')) });
    renderEditor(
      <EditorScreen
        services={svc}
        docKey="p"
        engineLocale="en-US"
        files={FILES}
        prep={makePrep(clean, resolvingFonts(), [])}
        initialText={TEMPLATE}
        onBack={vi.fn()}
      />,
    );
    pickMenu('File', 'Open…');
    expect(await screen.findByText('Could not open that file.')).toBeTruthy();
  });

  it('does nothing when the open dialog is dismissed', async () => {
    const svc = services({ openFile: vi.fn(async () => null) });
    renderEditor(
      <EditorScreen
        services={svc}
        docKey="p"
        engineLocale="en-US"
        files={FILES}
        prep={makePrep(clean, resolvingFonts(), [])}
        initialText={TEMPLATE}
        onBack={vi.fn()}
      />,
    );
    pickMenu('File', 'Open…');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(svc.openFile).toHaveBeenCalled();
    expect(screen.queryByText('Could not open that file.')).toBeNull();
  });

  it('shows the loading indicator while fonts are fetching', () => {
    const pending = new Promise<string>(() => {});
    const fonts: FontSource = { manifest: () => pending, face: async () => new Uint8Array() };
    const prep = makePrep(clean, fonts, ['ipamj-mincho']);
    renderEditor(
      <EditorScreen
        services={services()}
        docKey="p"
        engineLocale="en-US"
        files={FILES}
        prep={prep}
        initialText={TEMPLATE}
        onBack={vi.fn()}
      />,
    );
    act(() => {
      void prep.loader.observe(withGlyph);
    });
    expect(screen.getByText('Loading fonts…')).toBeTruthy();
  });

  it('shows an error banner when a font fetch fails', async () => {
    const fonts: FontSource = {
      manifest: async () => {
        throw new Error('offline');
      },
      face: vi.fn(),
    };
    const prep = makePrep(clean, fonts, ['ipamj-mincho']);
    renderEditor(
      <EditorScreen
        services={services()}
        docKey="p"
        engineLocale="en-US"
        files={FILES}
        prep={prep}
        initialText={TEMPLATE}
        onBack={vi.fn()}
      />,
    );
    await act(async () => {
      await prep.loader.observe(withGlyph);
    });
    expect(screen.getByText(/Some fonts could not be loaded/)).toBeTruthy();
  });

  it('autosaves a draft on an edit and persists it on the embedded save', async () => {
    const drafts = new DraftStore(memoryStorage());
    const svc = services({ drafts });
    renderEditor(
      <EditorScreen
        services={svc}
        docKey="p"
        engineLocale="en-US"
        files={FILES}
        prep={makePrep(clean, resolvingFonts(), [])}
        initialText={TEMPLATE}
        onBack={vi.fn()}
      />,
    );
    // A page-setup size edit changes the template text -> onChange -> autosave
    // (the working copy now differs from the preset source).
    changePageSize('Legal');
    await waitFor(async () => expect((await drafts.load('p'))?.text).toContain('Legal'));
    // The embedded Save persists that (non-pristine) working copy.
    pickMenu('File', 'Save');
    await waitFor(async () => expect(await drafts.load('p')).not.toBeNull());
  });

  it('clears the draft when an edit is undone back to the preset source', async () => {
    const drafts = new DraftStore(memoryStorage());
    renderEditor(
      <EditorScreen
        services={services({ drafts })}
        docKey="p"
        engineLocale="en-US"
        files={FILES}
        prep={makePrep(clean, resolvingFonts(), [])}
        initialText={TEMPLATE}
        onBack={vi.fn()}
      />,
    );
    changePageSize('Legal');
    await waitFor(async () => expect(await drafts.load('p')).not.toBeNull());
    // Undo back to the source → the working copy is pristine → the draft clears,
    // so the next open shows no phantom restore prompt.
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(async () => expect(await drafts.load('p')).toBeNull());
  });

  it('keeps autosaving when the text is pristine but the sample was edited', async () => {
    const drafts = new DraftStore(memoryStorage());
    renderEditor(
      <EditorScreen
        services={services({ drafts })}
        docKey="p"
        engineLocale="en-US"
        files={{ ...FILES, params: '{"title":"Hi"}' }}
        prep={makePrep(clean, resolvingFonts(), [])}
        initialText={TEMPLATE}
        onBack={vi.fn()}
      />,
    );
    // Edit only the SAMPLE data (the template text stays the preset source).
    const input = openDataField('title') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Bye' } });
    fireEvent.blur(input);
    // Text-pristine but sample-edited → a draft is STILL written (data-loss guard).
    await waitFor(async () => {
      const draft = await drafts.load('p');
      expect(draft?.sample?.variants[0].text).toContain('Bye');
    });
  });

  it('a pristine explicit save clears a stale draft and still acknowledges', async () => {
    const drafts = new DraftStore(memoryStorage());
    // A stale draft lingers from an earlier session.
    await drafts.save('p', { text: 'stale', fonts: [] });
    renderEditor(
      <EditorScreen
        services={services({ drafts })}
        docKey="p"
        engineLocale="en-US"
        files={FILES}
        prep={makePrep(clean, resolvingFonts(), [])}
        initialText={TEMPLATE}
        onBack={vi.fn()}
      />,
    );
    pickMenu('File', 'Save');
    // The working copy equals the source → nothing to persist, but the save is
    // still acknowledged and the stale draft is removed.
    expect(await screen.findByText('Saved.')).toBeTruthy();
    await waitFor(async () => expect(await drafts.load('p')).toBeNull());
  });

  it('acknowledges a standalone explicit save, and the next edit clears the note', async () => {
    const drafts = new DraftStore(memoryStorage());
    renderEditor(
      <EditorScreen
        services={services({ drafts })}
        docKey="p"
        engineLocale="en-US"
        files={FILES}
        prep={makePrep(clean, resolvingFonts(), [])}
        initialText={TEMPLATE}
        onBack={vi.fn()}
      />,
    );
    pickMenu('File', 'Save');
    await waitFor(() => expect(screen.getByText('Saved.')).toBeTruthy());
    // The acknowledgement is about the SAVED text — an edit invalidates it.
    changePageSize('Legal');
    await waitFor(() => expect(screen.queryByText('Saved.')).toBeNull());
  });

  it('surfaces a standalone save failure (storage write refused) as an alert', async () => {
    const broken = memoryStorage();
    broken.setItem = () => {
      throw new Error('quota exceeded');
    };
    const drafts = new DraftStore(broken);
    renderEditor(
      <EditorScreen
        services={services({ drafts })}
        docKey="p"
        engineLocale="en-US"
        files={FILES}
        prep={makePrep(clean, resolvingFonts(), [])}
        initialText={TEMPLATE}
        // A restored, edited sample makes the session non-pristine, so the
        // explicit save actually writes (and hits the broken store).
        initialSample={{ active: 'default', variants: [{ id: 'default', text: '{"x":1}' }] }}
        onBack={vi.fn()}
      />,
    );
    pickMenu('File', 'Save');
    await waitFor(() => expect(screen.getByText(/Could not save in this browser/)).toBeTruthy());
  });

  it('treats a rejecting draft store as a standalone save failure', async () => {
    const drafts = new DraftStore(memoryStorage());
    vi.spyOn(drafts, 'save').mockRejectedValue(new Error('hostile store'));
    renderEditor(
      <EditorScreen
        services={services({ drafts })}
        docKey="p"
        engineLocale="en-US"
        files={FILES}
        prep={makePrep(clean, resolvingFonts(), [])}
        initialText={TEMPLATE}
        // Non-pristine (edited restored sample) → the save is actually attempted.
        initialSample={{ active: 'default', variants: [{ id: 'default', text: '{"x":1}' }] }}
        onBack={vi.fn()}
      />,
    );
    pickMenu('File', 'Save');
    await waitFor(() => expect(screen.getByText(/Could not save in this browser/)).toBeTruthy());
  });

  it('a standalone explicit save carries the picked fonts into the draft', async () => {
    const drafts = new DraftStore(memoryStorage());
    const saveSpy = vi.spyOn(drafts, 'save');
    renderEditor(
      <EditorScreen
        services={services({ drafts })}
        docKey="p"
        engineLocale="en-US"
        files={FILES}
        prep={prepWithFonts(fakeController())}
        initialText={TEMPLATE}
        initialFonts={[LATO_FONT]}
        onBack={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'File' })).toBeTruthy());
    pickMenu('File', 'Save');
    expect(await screen.findByText('Saved.')).toBeTruthy();
    expect(saveSpy).toHaveBeenCalledWith('p', {
      text: TEMPLATE,
      fonts: [LATO_FONT],
      rev: undefined,
      sample: { active: 'default', variants: [{ id: 'default', text: '{}' }] },
      definitions: undefined,
    });
  });

  it('autosaves sample-data edits into the draft', async () => {
    const drafts = new DraftStore(memoryStorage());
    const saveSpy = vi.spyOn(drafts, 'save');
    renderEditor(
      <EditorScreen
        services={services({ drafts })}
        docKey="p"
        engineLocale="en-US"
        files={FILES}
        prep={makePrep(clean, resolvingFonts(), [])}
        initialText={TEMPLATE}
        initialSample={{ active: 'default', variants: [{ id: 'default', text: '{"title":"Hi"}' }] }}
        onBack={vi.fn()}
      />,
    );
    const input = openDataField('title') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Bye' } });
    fireEvent.blur(input);
    await waitFor(() => {
      const saved = saveSpy.mock.calls.some((call) => {
        const sample = (call[1] as { sample?: { variants: { text: string }[] } }).sample;
        return sample !== undefined && JSON.parse(sample.variants[0].text).title === 'Bye';
      });
      expect(saved).toBe(true);
    });
  });

  it('exports the edited sample params as a kit, not the preset originals', () => {
    const svc = services();
    renderEditor(
      <EditorScreen
        services={svc}
        docKey="p"
        engineLocale="en-US"
        files={FILES}
        prep={makePrep(clean, resolvingFonts(), [])}
        initialText={TEMPLATE}
        initialSample={{ active: 'default', variants: [{ id: 'default', text: '{"title":"Hi"}' }] }}
        onBack={vi.fn()}
      />,
    );
    const input = openDataField('title') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Bye' } });
    fireEvent.blur(input);
    pickMenu('File', 'Export');
    // Edited sample data routes to a kit zip (unedited would stay a plain YAML).
    const artifact = (svc.exportFile as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0];
    expect(artifact.filename).toBe('p-kit.zip');
    expect(artifact.bytes).toBeInstanceOf(Uint8Array);
  });

  it('never sends sample params in a mounted save, and shows the panel read-only', async () => {
    const saveTarget = {
      load: vi.fn(async (_key: string) => null),
      save: vi.fn(async (_key: string, _doc: TemplateDoc) => ({ ok: true as const })),
    };
    renderEditor(
      <EditorScreen
        services={services()}
        docKey="p/t"
        engineLocale="en-US"
        files={{ ...FILES, params: '{"title":"Hi"}' }}
        prep={makePrep(clean, resolvingFonts(), [])}
        initialText={TEMPLATE}
        saveTarget={saveTarget}
        onBack={vi.fn()}
      />,
    );
    pickMenu('File', 'Save');
    await waitFor(() => expect(saveTarget.save).toHaveBeenCalled());
    const doc = saveTarget.save.mock.calls[0][1];
    expect('params' in doc).toBe(false);
    pickMenu('File', 'Edit data fields…');
    expect(screen.getByText('Sample data is managed by the engineer.')).toBeTruthy();
  });

  const MOUNT_DEFS = 'type: object\nproperties:\n  title:\n    type: string\n    title: Title\n';
  function mountedSaveTargets() {
    return {
      saveTarget: {
        load: vi.fn(async (_key: string) => null),
        save: vi.fn(async (_key: string, _doc: TemplateDoc) => ({ ok: true as const, rev: 'r2' })),
      },
      saveDefinitions: vi.fn<DefinitionsStore['saveDefinitions']>(async () => ({
        ok: true,
        rev: 'd2',
      })),
    };
  }
  function editDefinitionLabel(value: string) {
    pickMenu('File', 'Edit data fields…');
    const nav = screen.getByRole('navigation', { name: 'Data fields' });
    const row = within(nav)
      .getAllByRole('button')
      .find((b) => (b.textContent ?? '').includes('Title'));
    if (row === undefined) {
      throw new Error('no Title row');
    }
    fireEvent.click(row);
    const input = screen.getByLabelText('Display label') as HTMLInputElement;
    fireEvent.change(input, { target: { value } });
    fireEvent.blur(input);
  }
  function renderMounted(
    targets: ReturnType<typeof mountedSaveTargets>,
    saveDefinitions = targets.saveDefinitions,
  ) {
    return renderEditor(
      <EditorScreen
        services={services()}
        docKey="p/t"
        engineLocale="en-US"
        files={{ ...FILES, params: '{"title":"Hi"}', definitions: MOUNT_DEFS }}
        prep={makePrep(clean, resolvingFonts(), [])}
        initialText={TEMPLATE}
        saveTarget={targets.saveTarget}
        definitionsTarget={{ saveDefinitions }}
        projectId="p"
        initialDefinitionsRev="d1"
        onBack={vi.fn()}
      />,
    );
  }

  it('saves edited definitions through the definitions wire after the template save', async () => {
    const targets = mountedSaveTargets();
    renderMounted(targets);
    editDefinitionLabel('Heading');
    pickMenu('File', 'Save');
    await waitFor(() => expect(targets.saveDefinitions).toHaveBeenCalled());
    const [pid, doc] = targets.saveDefinitions.mock.calls[0];
    expect(pid).toBe('p');
    expect(doc.definitions).toContain('Heading');
    expect(doc.rev).toBe('d1');
    // The template save ran first.
    expect(targets.saveTarget.save).toHaveBeenCalled();
  });

  it('keeps the prior definitions rev when the save returns none', async () => {
    const targets = mountedSaveTargets();
    const saveDefinitions = vi.fn<DefinitionsStore['saveDefinitions']>(async () => ({ ok: true }));
    renderMounted(targets, saveDefinitions);
    editDefinitionLabel('Heading');
    pickMenu('File', 'Save');
    await waitFor(() => expect(saveDefinitions).toHaveBeenCalled());
    // A rev-less ok is fine — the working copy is cleared (Saved.).
    await waitFor(() => expect(screen.getByTestId('save-probe').textContent).toBe('Saved.'));
  });

  it('does not touch the definitions wire when nothing was edited', async () => {
    const targets = mountedSaveTargets();
    renderMounted(targets);
    pickMenu('File', 'Save');
    await waitFor(() => expect(targets.saveTarget.save).toHaveBeenCalled());
    expect(targets.saveDefinitions).not.toHaveBeenCalled();
  });

  it('does not re-PUT definitions on a second save with no new edits', async () => {
    const targets = mountedSaveTargets();
    renderMounted(targets);
    editDefinitionLabel('Heading');
    pickMenu('File', 'Save');
    await waitFor(() => expect(targets.saveDefinitions).toHaveBeenCalledTimes(1));
    // A second explicit save: the host already acknowledged this text.
    pickMenu('File', 'Save');
    await waitFor(() => expect(targets.saveTarget.save).toHaveBeenCalledTimes(2));
    expect(targets.saveDefinitions).toHaveBeenCalledTimes(1);
  });

  it('a rename save keeps the crash-recovery draft while definitions are host-unsaved', async () => {
    const targets = mountedSaveTargets();
    const drafts = new DraftStore(memoryStorage());
    const reports: (HeaderDoc | null)[] = [];
    render(
      <I18nProvider locale="en-US" catalog={APP_CATALOG}>
        <EditorScreen
          services={services({ drafts })}
          docKey="p/t"
          engineLocale="en-US"
          files={{ ...FILES, params: '{"title":"Hi"}', definitions: MOUNT_DEFS }}
          prep={makePrep(clean, resolvingFonts(), [])}
          initialText={TEMPLATE}
          saveTarget={targets.saveTarget}
          definitionsTarget={{ saveDefinitions: targets.saveDefinitions }}
          projectId="p"
          documentName="Invoice"
          onHeaderDocChange={(doc) => reports.push(doc)}
          onBack={vi.fn()}
        />
      </I18nProvider>,
    );
    editDefinitionLabel('Heading');
    await waitFor(async () => expect(await drafts.load('p/t')).not.toBeNull());
    // A rename persists to the host immediately — WITHOUT the definitions leg —
    // so the local draft must survive as the edits' only crash recovery.
    act(() => reportedRename(reports)('Renamed'));
    await waitFor(() => expect(targets.saveTarget.save).toHaveBeenCalled());
    expect(targets.saveDefinitions).not.toHaveBeenCalled();
    expect(await drafts.load('p/t')).not.toBeNull();
  });

  it('threads a definition edit into the draft as ops, and restores them into the Designer', async () => {
    const drafts = new DraftStore(memoryStorage());
    // Blank-start workshop: params only, no engineer definitions.
    renderEditor(
      <EditorScreen
        services={services({ drafts })}
        docKey="p"
        engineLocale="en-US"
        files={{ ...FILES, params: '{"title":"Hi"}' }}
        prep={makePrep(clean, resolvingFonts(), [])}
        initialText={TEMPLATE}
        onBack={vi.fn()}
      />,
    );
    const input = openDataField('title');
    void input;
    const label = screen.getByLabelText('Display label') as HTMLInputElement;
    fireEvent.change(label, { target: { value: 'Restored label' } });
    fireEvent.blur(label);
    let draft = await drafts.load('p');
    expect(draft?.definitionsEdits).toEqual([
      { op: 'setScalar', keys: ['properties', 'title', 'title'], value: 'Restored label' },
    ]);
    expect(draft?.definitions).toContain('Restored label');
    // The explicit standalone save persists the same ops (not just autosave).
    fireEvent.keyDown(document, { key: 'Escape' });
    pickMenu('File', 'Save');
    await waitFor(async () => {
      draft = await drafts.load('p');
      expect(draft?.definitionsEdits).toHaveLength(1);
    });
    cleanup();
    // Reopen from the draft: the ops re-apply over the re-inferred stub — the
    // edit shows in the editor AND 工房モード survives (create-field armed).
    renderEditor(
      <EditorScreen
        services={services({ drafts })}
        docKey="p"
        engineLocale="en-US"
        files={{ ...FILES, params: '{"title":"Hi"}' }}
        prep={makePrep(clean, resolvingFonts(), [])}
        initialText={TEMPLATE}
        initialDefinitions={draft?.definitions}
        initialDefinitionsEdits={draft?.definitionsEdits}
        onBack={vi.fn()}
      />,
    );
    openDataField('Restored label');
    expect((screen.getByLabelText('Display label') as HTMLInputElement).value).toBe(
      'Restored label',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    expect(screen.getByRole('menuitem', { name: 'Create data field…' })).toBeTruthy();
  });

  it('surfaces a definitions-save conflict, keeping the working copy', async () => {
    const targets = mountedSaveTargets();
    const saveDefinitions = vi.fn<DefinitionsStore['saveDefinitions']>(async () => ({
      ok: false,
      kind: 'conflict',
    }));
    renderMounted(targets, saveDefinitions);
    editDefinitionLabel('Heading');
    pickMenu('File', 'Save');
    await waitFor(() => expect(screen.getByText(/Someone else has saved/)).toBeTruthy());
  });

  it('surfaces a definitions-save network error', async () => {
    const targets = mountedSaveTargets();
    const saveDefinitions = vi.fn<DefinitionsStore['saveDefinitions']>(async () => {
      throw new Error('offline');
    });
    renderMounted(targets, saveDefinitions);
    editDefinitionLabel('Heading');
    pickMenu('File', 'Save');
    await waitFor(() => expect(screen.getByText(/Could not save/)).toBeTruthy());
  });

  it('uses the injected synth without error when it loads', async () => {
    const loadSynth = vi.fn(async () => (() => 'x') as never);
    renderEditor(
      <EditorScreen
        services={services({ loadSynth })}
        docKey="p"
        engineLocale="ja-JP"
        files={FILES}
        prep={makePrep(clean, resolvingFonts(), [])}
        initialText={TEMPLATE}
        onBack={vi.fn()}
      />,
    );
    await waitFor(() => expect(loadSynth).toHaveBeenCalledWith('ja-JP'));
    expect(screen.queryByText(/richer generator could not load/)).toBeNull();
  });

  it('falls back to the baseline synth and warns when the loader rejects', async () => {
    const loadSynth = vi.fn(async () => {
      throw new Error('no faker');
    });
    renderEditor(
      <EditorScreen
        services={services({ loadSynth })}
        docKey="p"
        engineLocale="en-US"
        files={FILES}
        prep={makePrep(clean, resolvingFonts(), [])}
        initialText={TEMPLATE}
        onBack={vi.fn()}
      />,
    );
    expect(await screen.findByText(/richer generator could not load/)).toBeTruthy();
  });

  it('upgrades the transport once the preview reports a missing glyph', async () => {
    const prep = makePrep(withGlyph, resolvingFonts(), ['ipamj-mincho']);
    renderEditor(
      <EditorScreen
        services={services()}
        docKey="p"
        engineLocale="en-US"
        files={FILES}
        prep={prep}
        initialText={TEMPLATE}
        onBack={vi.fn()}
      />,
    );
    await waitFor(() => expect(prep.loader.status).toBe('upgraded'), { timeout: 3000 });
  });
});

// --- explicit save to a mounted host's provider -----------------------------
