// Inline rich text on the content tab, driven through `PropertyPanel` over a
// REAL `useEditor` — which is the point of the file. An op-builder suite
// asserts the op LIST and a component suite asserts the DISPATCH; neither runs
// `applyOp`, so a batch the document would refuse (a `removeKey` for a key that
// is not there makes `applyAll` restore the pre-batch snapshot) passes both
// while the edit silently does nothing. The `doc` readout below is the only
// assertion that can see it.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useEditor } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { PropertyPanel } from './PropertyPanel';

const P = 'sections.body.items[0]';

afterEach(cleanup);

const DEFS = [
  'version: "0.2.0"',
  'type: object',
  'properties:',
  '  order:',
  '    type: object',
  '    properties:',
  '      code:',
  '        type: string',
  '        title: Order code',
  '        example: A-1',
].join('\n');

/** A key outside the interpolation charset, so a pick must MINT a declaration
 * rather than write a bare `{key}`. */
const DECL_DEFS = [
  'version: "0.2.0"',
  'type: object',
  'properties:',
  '  品名:',
  '    type: string',
  '    title: Product name',
  '    example: mikan',
].join('\n');

const SPANS = `sections:
  body:
    type: flow
    items:
      - type: text
        spans:
          - text: Shojiku
          - text: links
            link: { url: https://example.com }
          - data: { key: order.code }
`;

function Harness({
  source = SPANS,
  definitions = DEFS,
  capabilities,
}: {
  readonly source?: string;
  readonly definitions?: string;
  readonly capabilities?: readonly string[];
}) {
  const editor = useEditor(source);
  return (
    <I18nProvider locale="en">
      <PropertyPanel
        controller={editor}
        path={P}
        capabilities={capabilities}
        definitions={definitions}
        params="{}"
        gridStep={0}
      />
      <pre data-testid="doc">{editor.text}</pre>
      {/* `applyAll([])` reports ok and BUMPS THE REVISION, so "the document text
          did not move" cannot see an empty batch being dispatched — and a bumped
          revision is a dirty flag for an edit nobody made. */}
      <span data-testid="rev">{editor.revision}</span>
      <button type="button" data-testid="undo" onClick={editor.undo}>
        undo
      </button>
    </I18nProvider>
  );
}

const doc = () => screen.getByTestId('doc').textContent ?? '';
const rev = () => screen.getByTestId('rev').textContent ?? '';
const fragmentUrl = (n: number) =>
  screen.getByLabelText(`Link for fragment ${n}`) as HTMLInputElement;

/** Commit the fragment field the way leaving it does: `focusout` on the WRAPPER
 * with focus landing outside the field. */
function leave(input: HTMLInputElement, value: string) {
  fireEvent.input(input, { target: { value } });
  fireEvent.blur(input, { relatedTarget: document.body });
}

describe('routing', () => {
  it('replaces the content-mode pair for an item carrying spans', () => {
    render(<Harness />);
    screen.getByRole('heading', { name: 'Text fragments' });
    // The pair edits `text:`, which the engine ignores whenever `spans` is
    // non-empty — so for this item it must not be on screen at all.
    expect(screen.queryByLabelText('Fixed text or data')).toBeNull();
    expect(screen.queryAllByRole('combobox', { name: 'Fixed text or data' })).toHaveLength(0);
  });

  it('keeps the pair for a text item with no spans', () => {
    render(
      <Harness
        source={
          'sections:\n  body:\n    type: flow\n    items:\n      - type: text\n        text: hi\n'
        }
      />,
    );
    expect(screen.queryByRole('heading', { name: 'Text fragments' })).toBeNull();
    screen.getByLabelText('Text');
  });

  it('lists one row per fragment, labelled by what the fragment holds', () => {
    render(<Harness />);
    screen.getByRole('button', { name: 'Fragment 1: Shojiku' });
    screen.getByRole('button', { name: 'Fragment 3: Data: order.code' });
  });
});

describe('fragments the engine itself would complain about', () => {
  it('labels a fragment that holds neither text nor data', () => {
    // The engine's `empty_span`. The row still has to say SOMETHING: a blank
    // one is a control with no label, and this is the panel's only view of it.
    render(
      <Harness
        source={
          'sections:\n  body:\n    type: flow\n    items:\n      - type: text\n        spans:\n          - {}\n'
        }
      />,
    );
    screen.getByRole('button', { name: 'Fragment 1: (empty fragment)' });
  });

  it('names the DATA half of a fragment that carries both', () => {
    // `resolve_content` asks the binding before it looks at `text`, and
    // `validate/spans.rs` reports the conflict with `winner: data` — so a row
    // showing the text would point at content the page does not draw.
    render(
      <Harness
        source={
          'sections:\n  body:\n    type: flow\n    items:\n      - type: text\n        spans:\n          - { text: A, data: { key: order.code } }\n'
        }
      />,
    );
    screen.getByRole('button', { name: 'Fragment 1: Data: order.code' });
  });

  it('shows an empty list, and no link field, when every entry is unreadable', () => {
    // `hasSpans` is true (the key is a non-empty array) while `narrowSpans`
    // keeps nothing — the one state where the section renders with no rows.
    render(
      <Harness
        source={
          'sections:\n  body:\n    type: flow\n    items:\n      - type: text\n        spans:\n          - 3\n'
        }
      />,
    );
    screen.getByRole('heading', { name: 'Text fragments' });
    expect(screen.queryAllByRole('textbox', { name: /^Link for fragment/ })).toHaveLength(0);
  });
});

describe('selection', () => {
  it('opens on the first fragment and shows exactly ONE link field', () => {
    render(<Harness />);
    fragmentUrl(1);
    expect(screen.queryAllByRole('textbox', { name: /^Link for fragment/ })).toHaveLength(1);
  });

  it('moves the field to the fragment that was picked', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Fragment 2: links, has a link' }));
    expect(fragmentUrl(2).value).toBe('https://example.com');
    expect(screen.queryAllByRole('textbox', { name: /^Link for fragment/ })).toHaveLength(1);
  });

  it('marks the fragment that carries a link, for the eye AND the reader', () => {
    render(<Harness />);
    // The icon is aria-hidden, so the fact reaches a screen reader through the
    // row's own name — asserted by COUNT, since exactly one fragment has one.
    expect(screen.getAllByRole('button', { name: /has a link$/ })).toHaveLength(1);
  });
});

describe('the write, over a real Editor', () => {
  it('authors the URL under the fragment and leaves its siblings byte-exact', () => {
    render(<Harness />);
    leave(fragmentUrl(1), 'https://one.example');
    const text = doc();
    expect(text).toContain(
      '- text: Shojiku\n            link:\n              url: https://one.example',
    );
    // Fragment 2 keeps its own flow-style link and fragment 3 its binding.
    expect(text).toContain('link: { url: https://example.com }');
    expect(text).toContain('data: { key: order.code }');
  });

  it('removes the key when the URL is emptied, keeping the fragment', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Fragment 2: links, has a link' }));
    leave(fragmentUrl(2), '');
    expect(doc()).not.toContain('https://example.com');
    expect(doc()).toContain('- text: links');
  });

  it('authors nothing for an unchanged value', () => {
    render(<Harness />);
    const before = doc();
    fireEvent.click(screen.getByRole('button', { name: 'Fragment 2: links, has a link' }));
    leave(fragmentUrl(2), 'https://example.com');
    expect(doc()).toBe(before);
  });

  it('authors nothing when a fragment with NO link is left empty', () => {
    // The arm an unguarded clear would fail the batch on: `removeKey` for an
    // absent key returns `key_not_found`, and `applyAll` then restores the
    // pre-batch snapshot — so the guard has to run before the removal, not
    // beside it. Fragment 1 carries no link.
    render(<Harness />);
    const before = doc();
    leave(fragmentUrl(1), '   ');
    expect(doc()).toBe(before);
  });

  it('refuses a URL past the 2048-BYTE cap, and authors nothing', () => {
    render(<Harness />);
    const before = doc();
    leave(fragmentUrl(1), `https://x.test/${'a'.repeat(2100)}`);
    screen.getByText(/longer than 2048 bytes/);
    expect(doc()).toBe(before);
  });

  it('mints no undo step for an unchanged value', () => {
    // The second clause of the requirement, and the one the text comparison
    // structurally cannot see. Removing the `ops.length > 0` guard in
    // `SpansSection` leaves every other case in this file green.
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Fragment 2: links, has a link' }));
    const before = rev();
    leave(fragmentUrl(2), 'https://example.com');
    expect(rev()).toBe(before);
  });

  it('refuses a URL the engine would refuse, and authors nothing', () => {
    // The gate is asserted AT this entry point, not inferred from the item
    // field's test: nothing stops a later edit routing this one around it.
    render(<Harness />);
    const before = doc();
    leave(fragmentUrl(1), 'javascript:alert(1)');
    screen.getByText(/Start it with http:\/\//);
    expect(doc()).toBe(before);
  });

  it('does not carry a refusal across to the NEXT fragment', () => {
    // The shared field is reused rather than remounted when another fragment is
    // picked, so its refusal state would otherwise sit under the next
    // fragment's EMPTY box — a valid value under a message saying it is wrong.
    render(<Harness />);
    leave(fragmentUrl(1), 'javascript:alert(1)');
    screen.getByText(/Start it with http:\/\//);
    fireEvent.click(screen.getByRole('button', { name: 'Fragment 3: Data: order.code' }));
    expect(fragmentUrl(3).value).toBe('');
    expect(screen.queryAllByText(/Start it with http:\/\//)).toHaveLength(0);
  });

  it('refuses a control character smuggled into the scheme', () => {
    render(<Harness />);
    const before = doc();
    leave(fragmentUrl(1), 'java\tscript:alert(1)');
    expect(doc()).toBe(before);
  });
});

/** `SPANS` plus the ignored content key, and identical in every other respect —
 * so a button-population comparison between the two isolates the clear button
 * instead of also counting a different number of fragment rows. */
const CONFLICT = SPANS.replace(
  '      - type: text\n',
  '      - type: text\n        text: not drawn\n',
);

describe('the ignored content key', () => {
  it('says the text is not drawn and clears it in ONE undo step', () => {
    render(<Harness source={CONFLICT} />);
    screen.getByText(/also carries content that is not drawn/);
    fireEvent.click(screen.getByRole('button', { name: 'Remove the content that is not drawn' }));
    expect(doc()).not.toContain('text: not drawn');
    fireEvent.click(screen.getByTestId('undo'));
    expect(doc()).toContain('text: not drawn');
  });

  it('is absent when the item carries spans alone', () => {
    render(<Harness />);
    // Asserted by the section's button POPULATION, not by "no element called
    // X": a name borrowed from a sibling fixture is unfailable.
    // Compared against the SAME fixture WITH the conflict, so the assertion
    // depends on the population and not on a string borrowed from the other
    // fixture — a filter keyed on the button's own wording goes green the day
    // that wording changes, which is the failure this shape exists to avoid.
    const withoutConflict = screen.getAllByRole('button').length;
    cleanup();
    render(<Harness source={CONFLICT} />);
    // Exactly ONE more button, and the fixtures are otherwise the same
    // document — so this fails if the row disappears AND if it appears when it
    // should not, neither of which a filter on the button's own wording can see.
    expect(screen.getAllByRole('button').length).toBe(withoutConflict + 1);
  });
});

describe('the insert menu on a fragment link', () => {
  it('names itself apart from the item’s own link menu', () => {
    render(<Harness />);
    screen.getByRole('button', { name: 'Insert a data field into the link' });
    screen.getByRole('button', { name: 'Insert a data field into the link for fragment 1' });
    // …and the two URL fields likewise: two controls answering to one name is a
    // by-name query with two matches and a screen reader saying it twice.
    screen.getByLabelText('Link');
    screen.getByLabelText('Link for fragment 1');
  });

  it('mints a name that does not redirect a NEIGHBOUR fragment', () => {
    // One `bindings:` map serves every surface an item has, so a mint taken
    // from a set that cannot see the neighbours silently repoints one.
    const occupied = `sections:
  body:
    type: flow
    items:
      - type: text
        bindings:
          f1: { key: order.code }
        spans:
          - text: see {f1}
          - text: linked
`;
    render(<Harness source={occupied} definitions={DECL_DEFS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fragment 2: linked' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Insert a data field into the link for fragment 2' }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: /Product name/ }));
    const input = fragmentUrl(2);
    expect(input.value).not.toContain('{f1}');
    fireEvent.blur(input, { relatedTarget: document.body });
    // The neighbour's declaration is untouched and still points where it did.
    expect(doc()).toContain('f1: { key: order.code }');
  });
});

describe('leaving the field', () => {
  it('does NOT commit when focus moves into the field’s own insert menu', () => {
    render(<Harness />);
    const input = fragmentUrl(1);
    const trigger = screen.getByRole('button', {
      name: 'Insert a data field into the link for fragment 1',
    });
    const before = doc();
    fireEvent.input(input, { target: { value: 'https://typed.example' } });
    fireEvent.blur(input, { relatedTarget: trigger });
    expect(doc()).toBe(before);
  });

  it('DOES commit when focus then leaves the menu', () => {
    // The leg nobody writes: after the blur above the input never blurs again,
    // so a handler on the input alone would strand the typed value forever.
    render(<Harness />);
    const input = fragmentUrl(1);
    const trigger = screen.getByRole('button', {
      name: 'Insert a data field into the link for fragment 1',
    });
    fireEvent.input(input, { target: { value: 'https://typed.example' } });
    fireEvent.blur(input, { relatedTarget: trigger });
    fireEvent.blur(trigger, { relatedTarget: document.body });
    expect(doc()).toContain('https://typed.example');
  });
});

describe('the capability gate', () => {
  it('lists the fragments but offers no link field against an older engine', () => {
    render(<Harness capabilities={['text.spans']} />);
    screen.getByRole('heading', { name: 'Text fragments' });
    expect(screen.queryAllByRole('textbox', { name: /^Link for fragment/ })).toHaveLength(0);
  });
});

describe('hostile documents', () => {
  it('leaves Object.prototype alone when the bindings map is a proto name', () => {
    // A LITERAL JSON string: an object literal `{ __proto__: {} }` in the test
    // SOURCE sets the prototype and serializes to `{}`, exercising nothing.
    const hostile = `sections:
  body:
    type: flow
    items:
      - type: text
        bindings: ${JSON.stringify(JSON.parse('{"__proto__":{"polluted":1}}'))}
        spans:
          - text: a
`;
    render(<Harness source={hostile} />);
    leave(fragmentUrl(1), 'https://ok.example');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(doc()).toContain('https://ok.example');
  });

  it('keeps a declaration held only past the DISPLAY cap', () => {
    // The list renders MAX_SPANS rows; the taken/other-surface set is uncapped,
    // so a name a fragment past the cap still uses must survive a link edit.
    const rows = Array.from({ length: 300 }, (_, i) =>
      i === 299 ? '          - text: tail {f1}' : `          - text: f${i}`,
    ).join('\n');
    const source = `sections:
  body:
    type: flow
    items:
      - type: text
        bindings:
          f1: { key: order.code }
        spans:
${rows}
`;
    render(<Harness source={source} />);
    leave(fragmentUrl(1), 'https://ok.example');
    expect(doc()).toContain('f1: { key: order.code }');
  });
});
