import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useEditor } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { fakeProbe } from '../testkit/formatCatalog';
import { FormatForm } from './FormatForm';

const BARE = 'sections:\n  body: { type: absolute }\n';
const REGISTERED = `formats:\n  stamp: { type: date, pattern: "yyyy.MM.dd" }\n${BARE}`;
const doc = () => screen.getByTestId('doc').textContent ?? '';

function Create({
  source = BARE,
  existingNames = [],
  onClose = vi.fn(),
}: {
  readonly source?: string;
  readonly existingNames?: readonly string[];
  readonly onClose?: () => void;
}) {
  const editor = useEditor(source);
  return (
    <I18nProvider locale="en">
      <FormatForm
        open
        mode="create"
        controller={editor}
        existingNames={existingNames}
        probe={fakeProbe()}
        onClose={onClose}
      />
      <pre data-testid="doc">{editor.text}</pre>
    </I18nProvider>
  );
}

function Update({ onClose = vi.fn() }: { readonly onClose?: () => void }) {
  const editor = useEditor(REGISTERED);
  return (
    <I18nProvider locale="en">
      <FormatForm
        open
        mode="update"
        controller={editor}
        existingNames={['stamp']}
        probe={fakeProbe()}
        onClose={onClose}
        name="stamp"
        current={{ kind: 'date', pattern: 'yyyy.MM.dd' }}
      />
      <pre data-testid="doc">{editor.text}</pre>
    </I18nProvider>
  );
}

describe('FormatForm', () => {
  it('submits a create on Enter in the name field', async () => {
    render(<Create />);
    fireEvent.change(screen.getByLabelText('Pattern'), { target: { value: 'y' } });
    const name = screen.getByLabelText('Format name');
    fireEvent.change(name, { target: { value: 'closing' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    await waitFor(() => expect(doc()).toContain('closing'));
  });

  it('does NOT submit mid-IME-composition', () => {
    // A Japanese author presses Enter to confirm a conversion; committing then
    // would author the half-converted name.
    render(<Create />);
    fireEvent.change(screen.getByLabelText('Pattern'), { target: { value: 'y' } });
    const name = screen.getByLabelText('Format name');
    fireEvent.change(name, { target: { value: 'しめび' } });
    fireEvent.keyDown(name, { key: 'Enter', isComposing: true });
    expect(doc()).not.toContain('しめび');
  });

  it('ignores other keys', () => {
    render(<Create />);
    const name = screen.getByLabelText('Format name');
    fireEvent.change(name, { target: { value: 'closing' } });
    fireEvent.keyDown(name, { key: 'a' });
    expect(doc()).not.toContain('closing');
  });

  it('authors the picked kind', async () => {
    render(<Create />);
    fireEvent.change(screen.getByLabelText('Format name'), { target: { value: 'received' } });
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'datetime' } });
    fireEvent.change(screen.getByLabelText('Pattern'), { target: { value: 'MM/dd HH:mm' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(doc()).toContain('type: datetime'));
  });

  it('closes on cancel without writing', () => {
    const onClose = vi.fn();
    render(<Create onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('Format name'), { target: { value: 'closing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(doc()).not.toContain('closing');
  });

  it('reports a refusal in place and writes nothing', () => {
    render(<Create existingNames={['closing']} />);
    fireEvent.change(screen.getByLabelText('Format name'), { target: { value: 'closing' } });
    fireEvent.change(screen.getByLabelText('Pattern'), { target: { value: 'y' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('That name is already in use.')).toBeTruthy();
    expect(doc()).not.toContain('formats:');
  });

  it('makes the name READ-ONLY on an edit, and Enter there does not submit', () => {
    render(<Update />);
    // The label carries the rename hint, so the accessible name is the pair.
    const name = screen.getByLabelText(/^Format name/) as HTMLInputElement;
    expect(name.readOnly).toBe(true);
    expect(screen.getByText('Rename from the row menu')).toBeTruthy();
    // Renaming rewrites every reference and is the row menu's transactional
    // operation, so this form must not be a second way in.
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(doc()).toBe(REGISTERED);
  });

  it('seeds an edit from the entry and previews as the author types', async () => {
    render(<Update />);
    expect((screen.getByLabelText('Pattern') as HTMLInputElement).value).toBe('yyyy.MM.dd');
    expect(await screen.findByText('[yyyy.MM.dd]')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Pattern'), { target: { value: 'yyyy' } });
    expect(await screen.findByText('[yyyy]')).toBeTruthy();
  });
});

// The RENDERED counterpart to `ui/actionConvention.test.ts`: that gate reads the
// SOURCE and proves each footer names exactly one primary, which is a claim
// about the JSX. This proves the prop actually reaches the DOM on THIS dialog's
// confirming action — Material 3's emphasis hierarchy is only real once the
// element carries it. `data-variant` is the documented hook; never assert the
// utility classes.
describe('FormatForm — emphasis (Material 3: one primary per screen)', () => {
  it('paints its confirming action as the primary, and its dismissal as a peer', () => {
    render(<Create />);
    expect(screen.getByRole('button', { name: 'Save' }).dataset.variant).toBe('primary');
    expect(screen.getByRole('button', { name: 'Cancel' }).dataset.variant).toBe('default');
  });
});
