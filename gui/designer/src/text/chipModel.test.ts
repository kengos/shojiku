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

  it('degrades a foreign element to its serialized children (no wire injection)', () => {
    const root = editorOf('a');
    const foreign = document.createElement('span');
    foreign.textContent = 'visible';
    root.appendChild(foreign);
    expect(serializeEditor(root)).toBe('avisible');
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
