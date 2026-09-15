// @vitest-environment node
//
// The panel's type→surface table, walked over the ENGINE's own item types: the
// one claim here that no per-type case can make is that exactly one wire type
// reaches the tab-less branch, which is what lets `ItemPanel` render that
// branch's note unconditionally. The variants are derived from `template.rs`
// (the `noBoxWire.test.ts` shape), so a sixteenth type cannot slip past it.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readItemView } from './itemView';
import { applicableTabs, placementBody, tabLessNoteKey } from './panelTabs';

function wireItemTypes(): string[] {
  const src = readFileSync(
    fileURLToPath(new URL('../../../../engine/core/src/template.rs', import.meta.url)),
    'utf8',
  );
  const body = /pub enum Item \{\n([\s\S]*?)\n\}/.exec(src);
  if (body === null) {
    throw new Error('could not find `pub enum Item` in template.rs');
  }
  return [...body[1].matchAll(/^ {4}(\w+)\(/gm)].map((m) =>
    m[1].replace(/(?<!^)([A-Z])/g, '_$1').toLowerCase(),
  );
}

function tabsOf(type: string): readonly string[] {
  const view = readItemView({ type });
  if (view === null) {
    throw new Error('fixture must be a readable item view');
  }
  return applicableTabs(view);
}

describe('the panel type table over the wire', () => {
  it('leaves exactly one wire item type with no tab: the page break', () => {
    const types = wireItemTypes();
    // The population control: a regex that stopped matching would pass below.
    expect(types.length).toBe(15);
    expect(types).toContain('repeat');
    expect(types.filter((type) => tabsOf(type).length === 0)).toEqual(['page_break']);
  });

  it('routes a placement tab to the box fields unless the type has its own editor', () => {
    expect(placementBody('line')).toBe('points');
    expect(placementBody('repeat')).toBe('repeatGrid');
    expect(placementBody('text')).toBe('box');
    // A document string never walks a prototype.
    expect(placementBody('__proto__')).toBe('box');
  });

  it('opens a tab-less panel with the page break note, the first-slot one at index 0', () => {
    expect(tabLessNoteKey('sections.body.items[0]')).toBe('panel.pageBreak.noteFirst');
    expect(tabLessNoteKey('sections.body.items[3]')).toBe('panel.pageBreak.note');
  });
});
