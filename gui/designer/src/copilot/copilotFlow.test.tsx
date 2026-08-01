// Designer-level tests of the AI-copilot flow: the host-injected provider prop
// gates the toolbar entry; a reply's ops go through the fail-closed pipeline
// (sanitize → scratch dry-run → diff review → explicit confirm → ONE applyAll)
// and every refusal path leaves the document byte-identical.

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Designer, type DesignerProps } from '../Designer';
import type { EngineTransport, RenderOutcome } from '../engine/transport';
import { I18nProvider } from '../i18n/context';
import { EngineProvider } from '../preview/context';
import {
  COPILOT_INSTRUCTIONS,
  type CopilotRequest,
  MAX_COPILOT_NOTE_CHARS,
} from '../registry/copilot';

const SOURCE = [
  'version: 0.1.0',
  'sections:',
  '  body:',
  '    items:',
  '      - type: text',
  '        text: hello',
  '',
].join('\n');

const BOX = { x: 0, y: 0, w: 8, h: 8 };

function outcome(): RenderOutcome {
  return {
    ok: true,
    pages: [{ width: 8, height: 8, rgba: new Uint8Array(8 * 8 * 4) }],
    inspect: {
      engine: { version: '0', capabilities: [], builtinLocales: [] },
      document: {},
      boxes: {
        pages: [[{ path: 'sections.body.items[0]', border: BOX, content: BOX }]],
      },
      margin: [0, 0, 0, 0],
    },
    diagnostics: { items: [] },
  };
}

function makeTransport(): EngineTransport {
  return {
    validate: vi.fn(async () => ({ items: [] })),
    renderRaw: vi.fn(async () => outcome()),
  };
}

function draw(props: Partial<DesignerProps> = {}) {
  return render(
    <I18nProvider locale="en">
      <EngineProvider transport={makeTransport()}>
        <Designer source={SOURCE} params="{}" {...props} />
      </EngineProvider>
    </I18nProvider>,
  );
}

/** Open the prompt dialog, type the ask, and fire the run. */
function ask(prompt: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Ask AI' }));
  fireEvent.change(screen.getByLabelText('What should change?'), { target: { value: prompt } });
  fireEvent.click(screen.getByRole('button', { name: 'Propose edits' }));
}

const RENAME_OPS = [
  { op: 'setScalar', path: 'sections.body.items[0]', keys: ['text'], value: 'world' },
];

describe('Designer copilot gating', () => {
  it('shows no copilot entry without the provider prop', () => {
    draw();
    expect(screen.queryByRole('button', { name: 'Ask AI' })).toBeNull();
  });

  it('shows the toolbar entry when the provider is injected', () => {
    draw({ copilot: vi.fn(async () => ({ ops: RENAME_OPS })) });
    expect(screen.getByRole('button', { name: 'Ask AI' })).toBeDefined();
  });

  it('closing the prompt dialog without running dismisses it', () => {
    const copilot = vi.fn(async () => ({ ops: RENAME_OPS }));
    draw({ copilot });
    fireEvent.click(screen.getByRole('button', { name: 'Ask AI' }));
    const dialog = screen.getByRole('dialog', { name: 'Ask AI to edit' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(copilot).not.toHaveBeenCalled();
  });
});

describe('Designer copilot flow', () => {
  it('packages prompt, instructions, template, params and selection into the request', async () => {
    const seen: CopilotRequest[] = [];
    const copilot = vi.fn(async (request: CopilotRequest) => {
      seen.push(request);
      return { ops: RENAME_OPS };
    });
    draw({ copilot });
    ask('make it world');
    await waitFor(() => expect(seen.length).toBe(1));
    expect(seen[0].prompt).toBe('make it world');
    expect(seen[0].instructions).toBe(COPILOT_INSTRUCTIONS);
    expect(seen[0].template).toBe(SOURCE);
    expect(seen[0].params).toBe('{}');
    expect(seen[0].selectionPath).toBeUndefined();
    expect(seen[0].definitions).toBeUndefined();
    // Close the review the successful run opened.
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));

    // With a selection and an engineer definitions file, both ride the request.
    const canvasBox = await screen.findByRole('button', { name: 'sections.body.items[0]' });
    fireEvent.click(canvasBox);
    ask('again');
    await waitFor(() => expect(seen.length).toBe(2));
    expect(seen[1].selectionPath).toBe('sections.body.items[0]');
  });

  it('sends the engineer definitions when present', async () => {
    const seen: CopilotRequest[] = [];
    const copilot = vi.fn(async (request: CopilotRequest) => {
      seen.push(request);
      return { ops: RENAME_OPS };
    });
    draw({ copilot, definitions: 'type: object\nproperties: {}\n' });
    ask('x');
    await waitFor(() => expect(seen.length).toBe(1));
    expect(seen[0].definitions).toContain('properties');
  });

  it('applies a confirmed proposal as ONE undo step and reviews it first', async () => {
    const onChange = vi.fn();
    draw({
      copilot: vi.fn(async () => ({ ops: RENAME_OPS, note: 'Renamed the text.' })),
      onChange,
    });
    ask('rename');
    // The review pane shows the proposal diff + the assistant note; nothing is
    // applied yet.
    const dialog = await screen.findByRole('dialog', { name: 'Review AI proposal' });
    expect(within(dialog).getByText('Review AI proposal')).toBeDefined();
    expect(within(dialog).getByText('Renamed the text.')).toBeDefined();
    expect(within(dialog).getByText(/world/)).toBeDefined();
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange.mock.calls[0][0]).toContain('text: world');

    // ONE undo step: a single undo restores the pre-proposal text exactly and
    // empties the stack; redo re-applies.
    const undoButton = screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement;
    expect(undoButton.disabled).toBe(false);
    fireEvent.click(undoButton);
    expect(onChange.mock.lastCall?.[0]).toBe(SOURCE);
    expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(onChange.mock.lastCall?.[0]).toContain('text: world');
  });

  it('cancelling the review applies nothing', async () => {
    const onChange = vi.fn();
    draw({ copilot: vi.fn(async () => ({ ops: RENAME_OPS })), onChange });
    ask('rename');
    const dialog = await screen.findByRole('dialog', { name: 'Review AI proposal' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByText('Review AI proposal')).toBeNull();
  });

  it('a no-change proposal confirms without minting an undo step', async () => {
    const onChange = vi.fn();
    draw({
      copilot: vi.fn(async () => ({
        ops: [{ op: 'setScalar', path: 'sections.body.items[0]', keys: ['text'], value: 'hello' }],
      })),
      onChange,
    });
    ask('keep it');
    const dialog = await screen.findByRole('dialog', { name: 'Review AI proposal' });
    expect(within(dialog).getByText('No changes')).toBeDefined();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
    expect(onChange).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('refuses a reply whose ops fail the dry-run, leaving the text untouched', async () => {
    const onChange = vi.fn();
    draw({
      copilot: vi.fn(async () => ({
        ops: [{ op: 'removeItem', path: 'sections.body.items', index: 5 }],
      })),
      onChange,
    });
    ask('remove something');
    await screen.findByText('The proposed edits do not fit this document. Try rephrasing.');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByText('Review AI proposal')).toBeNull();
  });

  it('refuses a malformed reply and a throwing provider without applying', async () => {
    const onChange = vi.fn();
    const copilot = vi
      .fn<(request: CopilotRequest) => Promise<{ ops: unknown }>>()
      .mockResolvedValueOnce(null as unknown as { ops: unknown })
      .mockRejectedValueOnce(new Error('secret internals'));
    draw({ copilot, onChange });
    ask('anything');
    await screen.findByText('The AI reply was not a valid edit list. Try rephrasing.');
    fireEvent.click(screen.getByRole('button', { name: 'Propose edits' }));
    await screen.findByText('The AI request failed. Try again.');
    // The provider's own message never renders (no internals leak).
    expect(screen.queryByText(/secret internals/)).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('discards a proposal when the document changed behind the review', async () => {
    const onChange = vi.fn();
    const copilot = vi
      .fn<(request: CopilotRequest) => Promise<{ ops: unknown }>>()
      .mockResolvedValueOnce({ ops: RENAME_OPS })
      .mockResolvedValueOnce({
        ops: [{ op: 'setScalar', path: 'sections.body.items[0]', keys: ['text'], value: 'again' }],
      });
    draw({ copilot, onChange });
    // Round 1: apply an edit so the window ⌘Z has something to undo.
    ask('rename');
    let dialog = await screen.findByRole('dialog', { name: 'Review AI proposal' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());

    // Round 2: while the review is open, undo round 1 behind the modal.
    ask('again');
    dialog = await screen.findByRole('dialog', { name: 'Review AI proposal' });
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(onChange.mock.lastCall?.[0]).toBe(SOURCE);
    const before = onChange.mock.calls.length;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
    await screen.findByText(
      'The document changed during review; the proposal was discarded. Ask again.',
    );
    expect(onChange.mock.calls.length).toBe(before);
    // Reopening the prompt clears the notice.
    fireEvent.click(screen.getByRole('button', { name: 'Ask AI' }));
    expect(
      screen.queryByText(
        'The document changed during review; the proposal was discarded. Ask again.',
      ),
    ).toBeNull();
  });

  it('refuses a proposal that would balloon the document past the size cap', async () => {
    const onChange = vi.fn();
    const huge = 'x'.repeat(3 * 1024 * 1024);
    draw({
      copilot: vi.fn(async () => ({
        ops: [{ op: 'setScalar', path: 'sections.body.items[0]', keys: ['text'], value: huge }],
      })),
      onChange,
    });
    ask('balloon');
    await screen.findByText('The proposed edits do not fit this document. Try rephrasing.');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a run resolving after the prompt dialog was closed opens no review', async () => {
    let release: (reply: { ops: unknown }) => void = () => {};
    const copilot = vi.fn(
      (_request: CopilotRequest) =>
        new Promise<{ ops: unknown }>((resolve) => {
          release = resolve;
        }),
    );
    const onChange = vi.fn();
    draw({ copilot, onChange });
    ask('slow');
    // Cancel the ask while the request is in flight.
    const prompt = screen.getByRole('dialog', { name: 'Ask AI to edit' });
    fireEvent.click(within(prompt).getByRole('button', { name: 'Cancel' }));
    release({ ops: RENAME_OPS });
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The abandoned result is dropped — no review modal, nothing applied.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps a hostile note and a prototype-key value inert', async () => {
    const longNote = `${'n'.repeat(MAX_COPILOT_NOTE_CHARS + 100)}`;
    const onChange = vi.fn();
    const copilot = vi
      .fn<(request: CopilotRequest) => Promise<{ ops: unknown; note?: string }>>()
      .mockResolvedValueOnce({
        ops: [
          {
            op: 'putValue',
            keys: ['styles', 'evil'],
            // A LITERAL JSON string: an object literal `{ __proto__: … }` in
            // source would set the prototype and serialize to {}.
            value: JSON.parse('{"__proto__":{"polluted":1}}'),
          },
        ],
        note: '<img src=x onerror=alert(1)>',
      })
      .mockResolvedValueOnce({ ops: RENAME_OPS, note: longNote });
    draw({ copilot, onChange });
    ask('style');
    let dialog = await screen.findByRole('dialog', { name: 'Review AI proposal' });
    // The note renders as TEXT — no element was minted from it.
    expect(within(dialog).getByText('<img src=x onerror=alert(1)>')).toBeDefined();
    expect(document.querySelector('img')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    // The hostile key landed as inert YAML data; Object.prototype is untouched.
    expect(onChange.mock.lastCall?.[0]).toContain('__proto__');
    expect('polluted' in {}).toBe(false);

    // An oversized note renders display-capped.
    ask('rename');
    dialog = await screen.findByRole('dialog', { name: 'Review AI proposal' });
    expect(within(dialog).getByText('n'.repeat(MAX_COPILOT_NOTE_CHARS))).toBeDefined();
  });
});
