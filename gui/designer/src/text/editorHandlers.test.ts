import { describe, expect, it } from 'vitest';
import { buildEditorNodes, CHIP_WIRE_ATTR, chipMetaMap, serializeEditor } from './chipModel';
import type { ChipInsert } from './declMint';
import { replaceChipAt } from './editorHandlers';

const META = chipMetaMap([
  { key: 'customer.name', label: '顧客名', sample: '山田太郎' },
  { key: 'total', label: 'Total', sample: '5000' },
  { key: 'tax', label: 'Tax', sample: '500' },
]);

function editorOf(text: string): HTMLDivElement {
  const root = document.createElement('div');
  document.body.appendChild(root);
  for (const node of buildEditorNodes(document, text, META)) {
    root.appendChild(node);
  }
  return root;
}

function chipsIn(root: HTMLElement): Element[] {
  return [...root.querySelectorAll(`[${CHIP_WIRE_ATTR}]`)];
}

const TAX: ChipInsert = { wire: '{tax}', name: 'tax', decl: null };
const PICKED = { label: 'Tax', sample: '500' };

describe('replaceChipAt', () => {
  it('swaps only the target chip and leaves the rest of the wire byte-identical', () => {
    const root = editorOf('A{customer.name}B{total}C');
    replaceChipAt(root, chipsIn(root)[0], TAX, PICKED, META);
    expect(serializeEditor(root)).toBe('A{tax}B{total}C');
  });

  it('keeps the surrounding text exactly, punctuation and CJK included', () => {
    const root = editorOf('宛先: {customer.name} 様（重要）');
    replaceChipAt(root, chipsIn(root)[0], TAX, PICKED, META);
    expect(serializeEditor(root)).toBe('宛先: {tax} 様（重要）');
  });

  it('carries the replaced expression’s format onto the new binding', () => {
    // A chip's `:format` has no other author in the Designer, so a replace
    // that dropped it would destroy hand-authored wire irrecoverably.
    const root = editorOf('{total:currency}');
    replaceChipAt(root, chipsIn(root)[0], TAX, PICKED, META);
    expect(serializeEditor(root)).toBe('{tax:currency}');
    expect(chipsIn(root)[0].querySelector('.sj-chip-format')?.textContent).toBe('currency');
  });

  it('drops a format the grammar cannot carry rather than splicing it in', () => {
    const root = editorOf('{total}');
    // A hand-crafted attribute, the shape a hostile document could carry.
    chipsIn(root)[0].setAttribute(CHIP_WIRE_ATTR, '{total:a}b}');
    replaceChipAt(root, chipsIn(root)[0], TAX, PICKED, META);
    expect(serializeEditor(root)).toBe('{tax}');
    expect(chipsIn(root)[0].querySelector('.sj-chip-format')).toBeNull();
  });

  it('labels the new chip from the row JUST picked, not from stale metadata', () => {
    // A staged declaration reaches the component's `meta` only on the next
    // render, so the insertion has to carry its own entry — same reason
    // `insertChipAt` takes the picked row.
    const root = editorOf('{total}');
    const plan: ChipInsert = {
      wire: '{f1}',
      name: 'f1',
      decl: { name: 'f1', key: '住所', scope: null },
    };
    replaceChipAt(root, chipsIn(root)[0], plan, { label: '住所', sample: '東京都' }, META);
    expect(chipsIn(root)[0].textContent).toBe('住所');
    expect(serializeEditor(root)).toBe('{f1}');
  });

  it('refuses a chip that is not inside this editor, mutating nothing', () => {
    // The node was selected renders ago; paste, drop and atomic erosion all
    // restructure the content in between, and mutating a detached node would
    // swallow the pick in silence.
    const root = editorOf('{total}');
    const other = editorOf('{customer.name}');
    const orphan = chipsIn(root)[0];
    orphan.remove();
    replaceChipAt(root, orphan, TAX, PICKED, META);
    replaceChipAt(root, chipsIn(other)[0], TAX, PICKED, META);
    expect(serializeEditor(root)).toBe('');
    expect(serializeEditor(other)).toBe('{customer.name}');
  });

  it('leaves the caret after the new chip so typing continues past it', () => {
    const root = editorOf('{total}X');
    replaceChipAt(root, chipsIn(root)[0], TAX, PICKED, META);
    const range = document.getSelection()?.getRangeAt(0);
    expect(range?.collapsed).toBe(true);
    expect(range?.startContainer).toBe(root);
    expect(range?.startOffset).toBe(1);
  });
});
