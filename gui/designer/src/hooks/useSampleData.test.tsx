// Designer-level tests for hooks/useSampleData.ts — sample-data ownership
// (editor owns after mount, commitSet as the one mutation path, 工房モード
// stub inference) and sample-variant switching.
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildSampleSet } from '../sample/variants';
import { outcome } from '../testkit/fixtures';
import {
  draw,
  makeTransport,
  openDataEditor,
  openSampleValue,
  pickMenu,
  saveViaReview,
  selectDataField,
} from '../testkit/harness';

describe('Designer sample data', () => {
  const withData = JSON.stringify({ title: 'Hi' });

  it('reports a sample-data edit and re-renders the preview with it', async () => {
    const onParamsChange = vi.fn();
    const renderRaw = vi.fn(async (_t: string, _p: string, _d: string | undefined, _o: unknown) =>
      outcome({ items: [] }),
    );
    const transport = makeTransport({ renderRaw });
    draw(transport, { params: withData, onParamsChange });
    const input = openSampleValue() as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Bye' } });
    fireEvent.blur(input);
    expect(JSON.parse(onParamsChange.mock.calls[0][0]).title).toBe('Bye');
    await waitFor(() => {
      const last = renderRaw.mock.calls[renderRaw.mock.calls.length - 1];
      expect(JSON.parse(last[1] as string).title).toBe('Bye');
    });
  });

  it('validates against the CURRENT params at save time', async () => {
    const validate = vi.fn(async (_t: string, _p?: string, _d?: string) => ({ items: [] }));
    const transport = makeTransport({ validate });
    draw(transport, { params: withData });
    const input = openSampleValue() as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Edited' } });
    fireEvent.blur(input);
    saveViaReview();
    await waitFor(() => {
      const call = validate.mock.calls[validate.mock.calls.length - 1];
      expect(JSON.parse(call[1] as string).title).toBe('Edited');
    });
  });

  it('opens the data palette from the inferred stub when no definitions (工房モード)', () => {
    draw(makeTransport(), { params: withData });
    // The data tab appears even without engineer definitions…
    fireEvent.click(screen.getByRole('tab', { name: 'Data fields' }));
    // …and the palette is FED by the stub: the sample-data key surfaces as a
    // field row (label + key both spell it) with its current value as the
    // sample, typed from the data.
    expect(screen.getAllByText('title').length).toBeGreaterThan(0);
    expect(screen.getByText('Hi')).not.toBeNull();
  });

  it('reports the inferred definitions stub, and only in 工房モード', () => {
    const onDefinitionsChange = vi.fn();
    draw(makeTransport(), { params: withData, onDefinitionsChange });
    expect(onDefinitionsChange).toHaveBeenCalled();
    expect(onDefinitionsChange.mock.calls[0][0]).toContain('properties');
  });

  it('keeps the stub machinery inert when definitions are supplied', () => {
    const onDefinitionsChange = vi.fn();
    draw(makeTransport(), {
      params: withData,
      definitions: 'type: object\nproperties: {}\n',
      onDefinitionsChange,
    });
    expect(onDefinitionsChange).not.toHaveBeenCalled();
  });

  it('threads read-only mode to the data editor (no sample inputs)', () => {
    // Read-only sample data (a mounted host) — but the engineer definitions are
    // still supplied, so the field list is populated.
    const defs = 'type: object\nproperties:\n  title:\n    type: string\n    title: Title\n';
    draw(makeTransport(), { params: withData, definitions: defs, sampleDataReadOnly: true });
    openDataEditor();
    // Read-only: the editor shows the engineer-owned hint.
    expect(screen.getByText('Sample data is managed by the engineer.')).not.toBeNull();
    selectDataField('Title');
    // No sample-value INPUT; the value is shown as read-only text instead.
    expect(screen.queryByLabelText('Title')).toBeNull();
    expect(screen.getByText('Hi')).not.toBeNull();
  });

  it('undoes a sample-data edit via the panel-local undo, restoring the previous params', () => {
    const onParamsChange = vi.fn();
    draw(makeTransport(), { params: withData, onParamsChange });
    const input = openSampleValue() as HTMLTextAreaElement;
    // Nothing to undo before any edit.
    expect((screen.getByText('Undo edit') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: 'Bye' } });
    fireEvent.blur(input);
    // The edit enabled the panel-local undo; clicking it restores the original.
    const undo = screen.getByText('Undo edit') as HTMLButtonElement;
    expect(undo.disabled).toBe(false);
    fireEvent.click(undo);
    expect(JSON.parse(onParamsChange.mock.calls.at(-1)?.[0]).title).toBe('Hi');
    // The ring is empty again → the undo disables.
    expect((screen.getByText('Undo edit') as HTMLButtonElement).disabled).toBe(true);
  });

  it('a repeated no-op blur adds nothing to the sample-undo ring', () => {
    draw(makeTransport(), { params: withData });
    const input = openSampleValue() as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Bye' } });
    fireEvent.blur(input);
    // A blur without an edit recommits the same text — no new undo entry.
    // (Re-query: the value-keyed input remounts on its own commit.)
    fireEvent.blur(screen.getByLabelText('title'));
    fireEvent.click(screen.getByText('Undo edit'));
    expect((screen.getByText('Undo edit') as HTMLButtonElement).disabled).toBe(true);
  });

  it('edits a definition through the data editor, folding it into the reported defs', () => {
    const onDefinitionsChange = vi.fn();
    draw(makeTransport(), { params: withData, onDefinitionsChange });
    openDataEditor();
    selectDataField('title');
    const input = screen.getByLabelText('Display label') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Heading' } });
    fireEvent.blur(input);
    // The definition edit is applied over the base and reported to the host.
    expect(onDefinitionsChange.mock.calls.at(-1)?.[0]).toContain('Heading');
  });

  it('undoes a definition edit via the panel-local definition undo', () => {
    const onDefinitionsChange = vi.fn();
    draw(makeTransport(), { params: withData, onDefinitionsChange });
    openDataEditor();
    // Nothing to undo before any definition edit.
    expect((screen.getByText('Undo definition edit') as HTMLButtonElement).disabled).toBe(true);
    selectDataField('title');
    const input = screen.getByLabelText('Display label') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Heading' } });
    fireEvent.blur(input);
    expect(onDefinitionsChange.mock.calls.at(-1)?.[0]).toContain('Heading');
    // The edit enabled the definition undo; clicking it reverts the label.
    const undo = screen.getByText('Undo definition edit') as HTMLButtonElement;
    expect(undo.disabled).toBe(false);
    fireEvent.click(undo);
    expect(onDefinitionsChange.mock.calls.at(-1)?.[0]).not.toContain('Heading');
    // The ring is empty again → the undo disables.
    expect((screen.getByText('Undo definition edit') as HTMLButtonElement).disabled).toBe(true);
  });

  it('steps back through multiple definition edits in reverse order', () => {
    const onDefinitionsChange = vi.fn();
    draw(makeTransport(), { params: withData, onDefinitionsChange });
    openDataEditor();
    selectDataField('title');
    const label = () => screen.getByLabelText('Display label') as HTMLInputElement;
    fireEvent.change(label(), { target: { value: 'Alpha' } });
    fireEvent.blur(label());
    fireEvent.change(label(), { target: { value: 'Beta' } });
    fireEvent.blur(label());
    expect(onDefinitionsChange.mock.calls.at(-1)?.[0]).toContain('Beta');
    const undo = () => screen.getByText('Undo definition edit') as HTMLButtonElement;
    // First undo restores the earlier label; second removes it entirely.
    fireEvent.click(undo());
    const afterFirst = onDefinitionsChange.mock.calls.at(-1)?.[0] as string;
    expect(afterFirst).toContain('Alpha');
    expect(afterFirst).not.toContain('Beta');
    fireEvent.click(undo());
    expect(onDefinitionsChange.mock.calls.at(-1)?.[0]).not.toContain('Alpha');
    expect(undo().disabled).toBe(true);
  });

  it('keeps the definition undo working when the sample data is read-only', () => {
    // A mounted host: sample data is engineer-owned (read-only) but definitions
    // stay editable — the definition undo lives in the left rail so it survives.
    const defs = 'type: object\nproperties:\n  title:\n    type: string\n    title: Title\n';
    const onDefinitionsChange = vi.fn();
    draw(makeTransport(), {
      params: withData,
      definitions: defs,
      sampleDataReadOnly: true,
      onDefinitionsChange,
    });
    openDataEditor();
    selectDataField('Title');
    const input = screen.getByLabelText('Display label') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Heading' } });
    fireEvent.blur(input);
    expect((screen.getByLabelText('Display label') as HTMLInputElement).value).toBe('Heading');
    expect(onDefinitionsChange.mock.calls.at(-1)?.[0]).toContain('Heading');
    fireEvent.click(screen.getByText('Undo definition edit'));
    // The reverted label reseeds the value-keyed input to the engineer original…
    expect((screen.getByLabelText('Display label') as HTMLInputElement).value).toBe('Title');
    // …AND the revert reaches the host (engineer base, no edit) so a later save
    // does not persist the undone edit.
    expect(onDefinitionsChange.mock.calls.at(-1)?.[0]).not.toContain('Heading');
    expect(onDefinitionsChange.mock.calls.at(-1)?.[1]).toEqual([]);
  });

  it('closes the data editor on Escape', () => {
    draw(makeTransport(), { params: withData });
    openDataEditor();
    expect(screen.queryByRole('navigation', { name: 'Data fields' })).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('navigation', { name: 'Data fields' })).toBeNull();
  });

  it('closes the data editor via its header button', () => {
    draw(makeTransport(), { params: withData });
    openDataEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Back to canvas' }));
    expect(screen.queryByRole('navigation', { name: 'Data fields' })).toBeNull();
  });

  it('adds a definition field blank-start (no stub) through the data editor', () => {
    const onDefinitionsChange = vi.fn();
    // Empty params → no inferred stub and no data tab; the editor opens from the
    // File menu, and an add-field applies over the empty-properties base.
    draw(makeTransport(), { params: '{}', onDefinitionsChange });
    openDataEditor();
    fireEvent.change(screen.getByLabelText('Field name'), { target: { value: 'memo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add data field' }));
    expect(onDefinitionsChange.mock.calls.at(-1)?.[0]).toContain('memo');
  });

  it('opens the data editor from the palette gear', () => {
    draw(makeTransport(), { params: withData });
    fireEvent.click(screen.getByRole('tab', { name: 'Data fields' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit data fields' }));
    expect(screen.queryByRole('navigation', { name: 'Data fields' })).not.toBeNull();
  });

  it('keeps the data editor and document settings mutually exclusive', () => {
    draw(makeTransport(), { params: withData });
    openDataEditor();
    expect(screen.queryByRole('navigation', { name: 'Data fields' })).not.toBeNull();
    // Opening 文書設定 closes the data editor (one fullscreen view at a time)…
    pickMenu('File', 'Document settings…');
    expect(screen.queryByRole('navigation', { name: 'Data fields' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Settings sections' })).not.toBeNull();
    // …and opening the data editor closes 文書設定.
    openDataEditor();
    expect(screen.queryByRole('navigation', { name: 'Settings sections' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Data fields' })).not.toBeNull();
  });

  it('composes exactly two sidebar tabs — the sample tab is retired', () => {
    draw(makeTransport(), { params: withData });
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.queryByRole('tab', { name: 'Sample data' })).toBeNull();
  });

  it('keeps an in-progress sibling entry across a definition commit (value-keyed inputs)', () => {
    draw(makeTransport(), { params: withData });
    openDataEditor();
    selectDataField('title');
    // Type into the description WITHOUT committing (no blur)…
    const description = screen.getByRole('textbox', { name: 'Description' }) as HTMLTextAreaElement;
    fireEvent.change(description, { target: { value: 'half-typed note' } });
    // …then commit a SIBLING field (the label).
    const label = screen.getByLabelText('Display label') as HTMLInputElement;
    fireEvent.change(label, { target: { value: 'Heading' } });
    fireEvent.blur(label);
    // The in-progress description text survives the sibling's commit.
    expect(
      (screen.getByRole('textbox', { name: 'Description' }) as HTMLTextAreaElement).value,
    ).toBe('half-typed note');
  });

  it('merges a definition edit with a later re-inferred stub (a new sample value never desyncs)', () => {
    const onDefinitionsChange = vi.fn();
    draw(makeTransport(), {
      params: JSON.stringify({ title: 'Hi', other: 'x' }),
      onDefinitionsChange,
    });
    openDataEditor();
    selectDataField('title');
    const label = screen.getByLabelText('Display label') as HTMLInputElement;
    fireEvent.change(label, { target: { value: 'Heading' } });
    fireEvent.blur(label);
    // Now edit ANOTHER field's sample value — the workshop stub re-infers from
    // the new params, and the definition edit re-applies on top.
    selectDataField('other');
    const value = screen.getByLabelText('other') as HTMLTextAreaElement;
    fireEvent.change(value, { target: { value: 'fresh' } });
    fireEvent.blur(value);
    const reported = onDefinitionsChange.mock.calls.at(-1)?.[0] as string;
    expect(reported).toContain('Heading');
    expect(reported).toContain('fresh');
  });

  it('re-applies restored definition-edit ops over the live base, keeping 工房モード', () => {
    const onDefinitionsChange = vi.fn();
    // A reopened blank-start draft hands its edits back as OPS; the base stays
    // the re-inferred stub, so the create-field flow must STILL be armed (the
    // restored-text-as-base shape flipped the session out of 工房モード).
    draw(makeTransport(), {
      params: withData,
      onDefinitionsChange,
      initialDefinitionsEdits: [
        { op: 'setScalar', keys: ['properties', 'title', 'title'], value: 'Restored label' },
      ],
    });
    // The edit is folded into the first report…
    expect(onDefinitionsChange.mock.calls.at(-1)?.[0]).toContain('Restored label');
    // …and 工房モード survives: the insert menu still offers create-field.
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    expect(screen.getByRole('menuitem', { name: 'Create data field…' })).toBeTruthy();
  });

  it('sanitizes hostile restored definition edits (garbage entries are inert)', () => {
    const onDefinitionsChange = vi.fn();
    draw(makeTransport(), {
      params: withData,
      onDefinitionsChange,
      // Hostile storage: scalars, null, an op-less record, and one refused-at-
      // apply op — none may crash or corrupt the report.
      initialDefinitionsEdits: [
        7,
        null,
        { keys: ['x'] },
        { op: 'removeKey', keys: ['properties', 'nope', 'title'] },
      ] as never,
    });
    const reported = onDefinitionsChange.mock.calls.at(-1)?.[0] as string;
    expect(reported).toContain('title');
  });

  it('reports the edit ops alongside the text (the host persists both)', () => {
    const onDefinitionsChange = vi.fn();
    draw(makeTransport(), { params: withData, onDefinitionsChange });
    openDataEditor();
    selectDataField('title');
    const label = screen.getByLabelText('Display label') as HTMLInputElement;
    fireEvent.change(label, { target: { value: 'Heading' } });
    fireEvent.blur(label);
    const [text, edits] = onDefinitionsChange.mock.calls.at(-1) as [string, unknown];
    expect(text).toContain('Heading');
    expect(edits).toEqual([
      { op: 'setScalar', keys: ['properties', 'title', 'title'], value: 'Heading' },
    ]);
  });

  it('a create-field dialog after a definition edit keeps both (the re-infer merge)', () => {
    const onDefinitionsChange = vi.fn();
    draw(makeTransport(), { params: withData, onDefinitionsChange });
    // Edit a definition first…
    openDataEditor();
    selectDataField('title');
    const label = screen.getByLabelText('Display label') as HTMLInputElement;
    fireEvent.change(label, { target: { value: 'Heading' } });
    fireEvent.blur(label);
    fireEvent.keyDown(document, { key: 'Escape' });
    // …then create a fresh field through the insert-menu dialog (工房モード).
    pickMenu('Insert', 'Create data field…');
    fireEvent.change(screen.getByLabelText('Field name'), { target: { value: 'memo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    const reported = onDefinitionsChange.mock.calls.at(-1)?.[0] as string;
    expect(reported).toContain('memo');
    expect(reported).toContain('Heading');
  });

  it('⌘Z inside the data editor’s sample textarea never fires the template undo', () => {
    const onChange = vi.fn();
    draw(makeTransport(), { params: withData, onChange });
    // Make a template edit so an undo would be observable.
    pickMenu('Insert', 'Text');
    const afterInsert = onChange.mock.calls.at(-1)?.[0] as string;
    expect(afterInsert).toContain('type: text');
    // Undo from inside the editor's textarea targets the FIELD, not the doc.
    const textarea = openSampleValue();
    fireEvent.keyDown(textarea, { key: 'z', metaKey: true });
    expect(onChange.mock.calls.at(-1)?.[0]).toBe(afterInsert);
  });

  it('feeds edited workshop definitions to the save-time validate', async () => {
    const validate = vi.fn(async (_t: string, _p?: string, _d?: string) => ({ items: [] }));
    draw(makeTransport({ validate }), { params: withData });
    // Pre-edit blank-start: validate sees NO definitions (the pristine stub
    // never reaches the engine).
    saveViaReview();
    await waitFor(() => expect(validate).toHaveBeenCalled());
    expect(validate.mock.calls.at(-1)?.[2]).toBeUndefined();
    // After a definition edit the merged workshop doc DOES feed validate.
    openDataEditor();
    selectDataField('title');
    const label = screen.getByLabelText('Display label') as HTMLInputElement;
    fireEvent.change(label, { target: { value: 'Heading' } });
    fireEvent.blur(label);
    saveViaReview();
    await waitFor(() => expect(validate.mock.calls.at(-1)?.[2]).toContain('Heading'));
  });
});

describe('Designer sample-variant switching', () => {
  const TWO = buildSampleSet(JSON.stringify({ title: 'A' }), [
    { id: 'blank', name: { en: 'Blank' }, text: JSON.stringify({ title: 'B' }) },
  ]);
  const topbarVariant = (container: HTMLElement) =>
    container.querySelector(
      '.sj-slim-toolbar .sj-variant-select select',
    ) as HTMLSelectElement | null;

  it('hides the topbar switcher for a single-variant document', () => {
    const { container } = draw(makeTransport(), { params: '{}' });
    expect(topbarVariant(container)).toBeNull();
  });

  it('shows the topbar switcher when the set has more than one variant', () => {
    const { container } = draw(makeTransport(), { sampleSet: TWO });
    const select = topbarVariant(container);
    expect(select).not.toBeNull();
    expect(select?.value).toBe('default');
  });

  it('switches variant from the topbar: re-renders with the chosen text and reports the set', async () => {
    const onSampleSetChange = vi.fn();
    const onParamsChange = vi.fn();
    const renderRaw = vi.fn(async (_t: string, _p: string, _d: string | undefined, _o: unknown) =>
      outcome({ items: [] }),
    );
    const { container } = draw(makeTransport({ renderRaw }), {
      sampleSet: TWO,
      onSampleSetChange,
      onParamsChange,
    });
    const select = topbarVariant(container);
    if (select === null) {
      throw new Error('missing switcher');
    }
    fireEvent.change(select, { target: { value: 'blank' } });
    await waitFor(() => {
      const last = renderRaw.mock.calls[renderRaw.mock.calls.length - 1];
      expect(JSON.parse(last[1] as string).title).toBe('B');
    });
    // The whole-set host and the simple params host are both notified.
    const set = onSampleSetChange.mock.calls[onSampleSetChange.mock.calls.length - 1][0];
    expect(set.active).toBe('blank');
    expect(JSON.parse(onParamsChange.mock.calls.at(-1)?.[0]).title).toBe('B');
  });

  it('reseeds the panel inputs to the switched variant', () => {
    const { container } = draw(makeTransport(), { sampleSet: TWO });
    openDataEditor();
    selectDataField('title');
    expect((screen.getByLabelText('title') as HTMLTextAreaElement).value).toBe('A');
    const select = topbarVariant(container);
    if (select === null) {
      throw new Error('missing switcher');
    }
    fireEvent.change(select, { target: { value: 'blank' } });
    expect((screen.getByLabelText('title') as HTMLTextAreaElement).value).toBe('B');
  });

  it('edits the active variant only and fires both sample callbacks', () => {
    const onSampleSetChange = vi.fn();
    const onParamsChange = vi.fn();
    draw(makeTransport(), { sampleSet: TWO, onSampleSetChange, onParamsChange });
    openDataEditor();
    selectDataField('title');
    const input = screen.getByLabelText('title') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'X' } });
    fireEvent.blur(input);
    expect(JSON.parse(onParamsChange.mock.calls[0][0]).title).toBe('X');
    const set = onSampleSetChange.mock.calls[0][0];
    // The active (default) variant changed; the other (blank) did not.
    expect(JSON.parse(set.variants[0].text).title).toBe('X');
    expect(JSON.parse(set.variants[1].text).title).toBe('B');
  });

  it('clears the sample-undo history when switching variants', () => {
    const { container } = draw(makeTransport(), { sampleSet: TWO });
    openDataEditor();
    selectDataField('title');
    const input = screen.getByLabelText('title') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'X' } });
    fireEvent.blur(input);
    // The edit armed the panel-local undo.
    expect((screen.getByText('Undo edit') as HTMLButtonElement).disabled).toBe(false);
    const select = topbarVariant(container);
    if (select === null) {
      throw new Error('missing switcher');
    }
    fireEvent.change(select, { target: { value: 'blank' } });
    // A different variant is a fresh undo context — the ring is cleared.
    expect((screen.getByText('Undo edit') as HTMLButtonElement).disabled).toBe(true);
  });

  it('clears the sample-undo history when adding a variant', () => {
    draw(makeTransport(), { sampleSet: TWO });
    openDataEditor();
    selectDataField('title');
    const input = screen.getByLabelText('title') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'X' } });
    fireEvent.blur(input);
    expect((screen.getByText('Undo edit') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('Variant name'), { target: { value: 'Copy' } });
    fireEvent.click(screen.getByText('Add variant'));
    // Adding a variant resets the undo context.
    expect((screen.getByText('Undo edit') as HTMLButtonElement).disabled).toBe(true);
  });

  it('adds a variant from the panel without firing onParamsChange (same active text)', () => {
    const onSampleSetChange = vi.fn();
    const onParamsChange = vi.fn();
    draw(makeTransport(), { sampleSet: TWO, onSampleSetChange, onParamsChange });
    openDataEditor();
    fireEvent.change(screen.getByLabelText('Variant name'), { target: { value: 'Copy' } });
    fireEvent.click(screen.getByText('Add variant'));
    const set = onSampleSetChange.mock.calls.at(-1)?.[0];
    expect(set.variants).toHaveLength(3);
    expect(set.active).toBe('user-1');
    // The new variant duplicates the active text, so the simple params host
    // sees no change.
    expect(onParamsChange).not.toHaveBeenCalled();
  });

  it('ignores a switch to the already-active variant (no callback, no reseed)', () => {
    const onSampleSetChange = vi.fn();
    const { container } = draw(makeTransport(), { sampleSet: TWO, onSampleSetChange });
    const select = topbarVariant(container);
    if (select === null) {
      throw new Error('missing switcher');
    }
    // Re-selecting the current value is a no-op mutation (same set reference).
    fireEvent.change(select, { target: { value: 'default' } });
    expect(onSampleSetChange).not.toHaveBeenCalled();
  });

  it('follows the active variant when inferring the 工房モード stub', () => {
    const onDefinitionsChange = vi.fn();
    const set = buildSampleSet(JSON.stringify({ alpha: 1 }), [
      { id: 'other', name: { en: 'Other' }, text: JSON.stringify({ beta: 2 }) },
    ]);
    const { container } = draw(makeTransport(), { sampleSet: set, onDefinitionsChange });
    // The initial stub is inferred from the active (default) variant.
    expect(onDefinitionsChange.mock.calls.at(-1)?.[0]).toContain('alpha');
    const select = topbarVariant(container);
    if (select === null) {
      throw new Error('missing switcher');
    }
    fireEvent.change(select, { target: { value: 'other' } });
    // Switching re-infers the stub from the newly active variant's data.
    expect(onDefinitionsChange.mock.calls.at(-1)?.[0]).toContain('beta');
  });
});
