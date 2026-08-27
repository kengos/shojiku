import { describe, expect, it } from 'vitest';
import {
  buildEditorNodes,
  CHIP_WIRE_ATTR,
  chipFormatOf,
  chipLabelOf,
  chipMetaMap,
  chipSpan,
  chipWire,
  chipWireWithFormat,
  serializeEditor,
} from './chipModel';
import { MAX_TEXT_EXPRS } from './interpolate';

const META = chipMetaMap([
  { key: 'customer.name', label: '顧客名', sample: '山田太郎' },
  { key: 'total', label: 'Total', sample: '' },
]);

function editorOf(text: string): HTMLDivElement {
  const root = document.createElement('div');
  for (const node of buildEditorNodes(document, text, META)) {
    root.appendChild(node);
  }
  return root;
}

describe('chipMetaMap', () => {
  it('indexes options by key, first appearance winning', () => {
    const map = chipMetaMap([
      { key: 'a', label: 'first', sample: '1' },
      { key: 'a', label: 'second', sample: '2' },
    ]);
    expect(map.get('a')).toEqual({ label: 'first', sample: '1' });
  });

  it('never resolves prototype names it was not given', () => {
    for (const hostile of ['__proto__', 'constructor', 'toString']) {
      expect(META.get(hostile)).toBeUndefined();
    }
  });
});

describe('chipWire', () => {
  it('round-trips a charset-safe key into its wire slice', () => {
    expect(chipWire('customer.name')).toBe('{customer.name}');
  });

  it('rejects keys that cannot spell a single expression', () => {
    expect(chipWire('a b')).toBeNull();
    expect(chipWire('')).toBeNull();
    expect(chipWire('a}b')).toBeNull();
    expect(chipWire('a:b')).toBeNull();
  });
});

describe('chipFormatOf', () => {
  it('reads the format out of a formatted expression', () => {
    expect(chipFormatOf('{total:currency}')).toBe('currency');
  });

  it('answers null for an expression carrying no format', () => {
    expect(chipFormatOf('{total}')).toBeNull();
  });

  it('answers null for a missing attribute', () => {
    expect(chipFormatOf(null)).toBeNull();
  });

  it('refuses a hand-crafted attribute that is not exactly one expression', () => {
    // The attribute is document-derived: it is read back through the ONE
    // parser rather than trusted, so a slice holding two expressions, an
    // unterminated one, or plain literal text yields no format to splice on.
    expect(chipFormatOf('{a:x}{b:y}')).toBeNull();
    expect(chipFormatOf('{a:x')).toBeNull();
    expect(chipFormatOf('literal')).toBeNull();
    expect(chipFormatOf('')).toBeNull();
  });
});

describe('chipWireWithFormat', () => {
  it('returns the bare slice unchanged when there is no format to carry', () => {
    expect(chipWireWithFormat('{total}', null)).toBe('{total}');
  });

  it('composes a slice that reads back as exactly that key and format', () => {
    const wire = chipWireWithFormat('{total}', 'currency');
    expect(wire).toBe('{total:currency}');
    expect(chipFormatOf(wire)).toBe('currency');
  });

  it('degrades to the bare slice when the format cannot round-trip', () => {
    // A format the grammar cannot carry must never be spliced in: `}` would
    // close the expression early and turn the author's following text into
    // wire they never wrote.
    expect(chipWireWithFormat('{total}', 'a}b')).toBe('{total}');
    expect(chipWireWithFormat('{total}', 'a b')).toBe('{total}');
    expect(chipWireWithFormat('{total}', '')).toBe('{total}');
  });
});

describe('chipLabelOf', () => {
  it('reads the bound field label a chip displays', () => {
    expect(chipLabelOf('{customer.name}', META)).toBe('顧客名');
  });

  it('falls back to the name itself for a key the metadata does not know', () => {
    expect(chipLabelOf('{missing.key}', META)).toBe('missing.key');
  });

  it('is empty for a slice that is not one expression', () => {
    expect(chipLabelOf(null, META)).toBe('');
    expect(chipLabelOf('literal', META)).toBe('');
  });

  it('never resolves a prototype name through the metadata map', () => {
    expect(chipLabelOf('{constructor}', META)).toBe('constructor');
  });
});

describe('buildEditorNodes / chipSpan', () => {
  it('builds text nodes for literals and labeled chip spans for expressions', () => {
    const root = editorOf('宛先: {customer.name} 様');
    expect(root.childNodes).toHaveLength(3);
    expect(root.childNodes[0].nodeValue).toBe('宛先: ');
    const chip = root.childNodes[1] as HTMLElement;
    expect(chip.getAttribute('contenteditable')).toBe('false');
    expect(chip.getAttribute(CHIP_WIRE_ATTR)).toBe('{customer.name}');
    expect(chip.textContent).toBe('顧客名');
    expect(chip.title).toBe('{customer.name} = 山田太郎');
  });

  it('labels an unknown key with the key itself and omits the sample', () => {
    const root = editorOf('{missing.key}');
    const chip = root.childNodes[0] as HTMLElement;
    expect(chip.textContent).toBe('missing.key');
    expect(chip.title).toBe('{missing.key}');
  });

  it('omits the sample for a known key whose sample is empty', () => {
    const root = editorOf('{total}');
    const chip = root.childNodes[0] as HTMLElement;
    expect(chip.textContent).toBe('Total');
    expect(chip.title).toBe('{total}');
  });

  it('shows the format name as a badge on a formatted chip', () => {
    const root = editorOf('{total:currency}');
    const chip = root.childNodes[0] as HTMLElement;
    expect(chip.querySelector('.sj-chip-format')?.textContent).toBe('currency');
    expect(chip.getAttribute(CHIP_WIRE_ATTR)).toBe('{total:currency}');
  });

  it('keeps literal escapes visible as wire spelling (the expert path)', () => {
    const root = editorOf('a {{ b');
    expect(root.childNodes).toHaveLength(1);
    expect(root.childNodes[0].nodeValue).toBe('a {{ b');
  });

  it('renders a hostile label or sample as literal text, never as markup', () => {
    const hostile = chipMetaMap([
      { key: 'k', label: '<img onerror=alert(1) src=x>', sample: '<script>x</script>' },
    ]);
    const span = chipSpan(document, '{k}', 'k', null, hostile);
    expect(span.querySelector('img')).toBeNull();
    expect(span.querySelector('script')).toBeNull();
    expect(span.textContent).toBe('<img onerror=alert(1) src=x>');
    expect(span.title).toBe('{k} = <script>x</script>');
  });

  it('caps chips at the parser bound; further expressions stay literal text', () => {
    const text = Array.from({ length: MAX_TEXT_EXPRS + 2 }, (_, i) => `{k${i}}`).join('');
    const root = editorOf(text);
    expect(root.querySelectorAll(`[${CHIP_WIRE_ATTR}]`)).toHaveLength(MAX_TEXT_EXPRS);
    expect(root.lastChild?.nodeValue).toBe(`{k${MAX_TEXT_EXPRS}}{k${MAX_TEXT_EXPRS + 1}}`);
  });
});

describe('serializeEditor', () => {
  it('is the identity over built content, for every wire shape', () => {
    const corpus = [
      '',
      'plain text',
      'escaped {{ brace and {{key}}',
      'unclosed {order.code',
      'empty {} and {:fmt} and {key:}',
      'invalid {a b} chars',
      '宛先: {customer.name} 様 — {total:currency}\n二行目 {missing.key}',
      'multi\nline\ntext',
    ];
    for (const text of corpus) {
      expect(serializeEditor(editorOf(text))).toBe(text);
    }
  });

  it('reads a <br> as a newline', () => {
    const root = editorOf('a');
    root.appendChild(document.createElement('br'));
    root.appendChild(document.createTextNode('b'));
    expect(serializeEditor(root)).toBe('a\nb');
  });

  it('degrades a DECORATIVE foreign element to its children, joined (no wire injection)', () => {
    // A <span> shows inline, so it ends no line and adds no break.
    const root = editorOf('a');
    const foreign = document.createElement('span');
    foreign.textContent = 'visible';
    root.appendChild(foreign);
    expect(serializeEditor(root)).toBe('avisible');
  });

  it('reads a browser-minted <div> per line as the lines it displays', () => {
    // The shape a native undo or a composition end leaves behind in Chrome and
    // Safari. It USED to serialize as 'onetwothree' — the field showed three
    // lines and the file was saved with one, which no gate could see.
    const root = editorOf('one');
    for (const line of ['two', 'three']) {
      const div = document.createElement('div');
      div.textContent = line;
      root.appendChild(div);
    }
    expect(serializeEditor(root)).toBe('one\ntwo\nthree');
  });

  it('reads a <p> the same way', () => {
    const root = editorOf('one');
    const p = document.createElement('p');
    p.textContent = 'two';
    root.append(p);
    expect(serializeEditor(root)).toBe('one\ntwo');
  });

  it('reads list items through the list that holds them', () => {
    // An <li> only ever arrives inside a <ul>/<ol>, which is NOT itself a line
    // container — so a fixture that appends the <li> straight to the root
    // proves nothing about the shape a browser can actually produce.
    const root = editorOf('one');
    const list = document.createElement('ul');
    for (const line of ['a', 'b']) {
      const li = document.createElement('li');
      li.textContent = line;
      list.appendChild(li);
    }
    root.appendChild(list);
    expect(serializeEditor(root)).toBe('one\na\nb');
  });

  it('keeps a leading EMPTY line', () => {
    // An empty line container writes nothing, so asking "has anything been
    // written yet?" answered NO at the second container too and swallowed its
    // break: a value opening with a blank line lost that line on every commit,
    // silently, which is the defect class this file exists to close.
    const root = document.createElement('div');
    const blank = document.createElement('div');
    blank.appendChild(document.createElement('br'));
    root.appendChild(blank);
    for (const line of ['two', 'three']) {
      const div = document.createElement('div');
      div.textContent = line;
      root.appendChild(div);
    }
    expect(serializeEditor(root)).toBe('\ntwo\nthree');
  });

  it('keeps SEVERAL leading empty lines', () => {
    const root = document.createElement('div');
    for (let i = 0; i < 2; i++) {
      const blank = document.createElement('div');
      blank.appendChild(document.createElement('br'));
      root.appendChild(blank);
    }
    const div = document.createElement('div');
    div.textContent = 'b';
    root.appendChild(div);
    expect(serializeEditor(root)).toBe('\n\nb');
  });

  it("reads a <div><br></div> as ONE break — the browser's empty-line placeholder", () => {
    // What Chromium leaves after Enter at the end of a value the reader has not
    // typed into yet. The <div> already ends the line; counting its lone <br>
    // as a second break would add a blank line on every such Enter.
    const root = editorOf('one');
    const div = document.createElement('div');
    div.appendChild(document.createElement('br'));
    root.appendChild(div);
    expect(serializeEditor(root)).toBe('one\n');
  });

  it('still reads a <br> that shares its container as a real break', () => {
    const root = editorOf('one');
    const div = document.createElement('div');
    div.appendChild(document.createTextNode('two'));
    div.appendChild(document.createElement('br'));
    div.appendChild(document.createTextNode('three'));
    root.appendChild(div);
    expect(serializeEditor(root)).toBe('one\ntwo\nthree');
  });

  it('does not GROW a value that already ends in a break', () => {
    // The browser appends a placeholder <br> so the empty last line can hold a
    // caret. Reading it as a break made every seed → commit → reseed turn add
    // one more: the value grew without bound and re-rendered the document each
    // time, which showed as the app pinning a core rather than as a wrong
    // string. This is the regression that costs the most to rediscover.
    let value = 'a\n';
    for (let turn = 0; turn < 3; turn++) {
      const root = document.createElement('div');
      for (const node of buildEditorNodes(document, value, META)) {
        root.appendChild(node);
      }
      root.appendChild(document.createElement('br'));
      value = serializeEditor(root);
      expect(value).toBe('a\n');
    }
  });

  it('keeps a break the reader authored before the placeholder', () => {
    // `a<br><br>` is how a browser spells "a, then an empty line": the first
    // <br> is the reader's break, the second is the placeholder.
    const root = editorOf('a');
    root.appendChild(document.createElement('br'));
    root.appendChild(document.createElement('br'));
    expect(serializeEditor(root)).toBe('a\n');
  });

  it('adds no LEADING break when the content opens with a line container', () => {
    // Chrome wraps every line including the first once the reader has typed a
    // break; a break before the first line would prepend a blank one on every
    // reopen, growing the value each time.
    const root = document.createElement('div');
    for (const line of ['one', 'two']) {
      const div = document.createElement('div');
      div.textContent = line;
      root.appendChild(div);
    }
    expect(serializeEditor(root)).toBe('one\ntwo');
  });

  it('keeps a chip whole inside a line container', () => {
    const root = editorOf('one');
    const div = document.createElement('div');
    div.appendChild(chipSpan(document, '{k}', 'k', null, META));
    div.appendChild(document.createTextNode(' 様'));
    root.appendChild(div);
    expect(serializeEditor(root)).toBe('one\n{k} 様');
  });

  it('reads the wire attribute from a chip nested inside a foreign element', () => {
    const root = document.createElement('div');
    const wrapper = document.createElement('div');
    const chip = chipSpan(document, '{k}', 'k', null, META);
    wrapper.appendChild(chip);
    root.appendChild(wrapper);
    expect(serializeEditor(root)).toBe('{k}');
  });

  it('ignores non-text non-element nodes', () => {
    const root = editorOf('a');
    root.appendChild(document.createComment('noise'));
    expect(serializeEditor(root)).toBe('a');
  });
});
