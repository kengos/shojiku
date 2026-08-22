import { MAX_TEMPLATE_BYTES } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { draftTemplate } from './draftTemplate';

const SOURCE = [
  'version: "0.1.0"',
  'sections:',
  '  body:',
  '    type: flow',
  '    items:',
  '      - type: text',
  '        text: テキスト',
  '',
].join('\n');

const AT = 'sections.body.items[0]';

describe('draftTemplate', () => {
  it('renders the pending text without touching the committed source', () => {
    const draft = draftTemplate(
      SOURCE,
      [{ op: 'setScalar', path: AT, keys: ['text'], value: '領収書' }],
      MAX_TEMPLATE_BYTES,
    );
    expect(draft).not.toBeNull();
    expect(draft).toContain('領収書');
    // The whole point of the throwaway document: the caller's own string is a
    // value, but the SESSION's document is what must not have moved — proven
    // here by the source still reading as it did.
    expect(SOURCE).toContain('テキスト');
    expect(SOURCE).not.toContain('領収書');
  });

  it('refuses a batch the document cannot take, so the canvas keeps the committed render', () => {
    expect(
      draftTemplate(
        SOURCE,
        [{ op: 'setScalar', path: 'sections.body.items[9]', keys: ['text'], value: 'x' }],
        MAX_TEMPLATE_BYTES,
      ),
    ).toBeNull();
  });

  it('refuses an unparseable source instead of throwing', () => {
    expect(
      draftTemplate(
        'sections: [unclosed',
        [{ op: 'setScalar', path: AT, keys: ['text'], value: 'x' }],
        MAX_TEMPLATE_BYTES,
      ),
    ).toBeNull();
  });

  it('refuses a result over the byte cap — applyAll enforces no bound of its own', () => {
    // The source parses (it is well under any cap) and only the DRAFT breaks
    // the bound, which is the one shape that reaches this check: a successful
    // batch never re-parses, so nothing else bounds the string handed to the
    // engine. Reachable in the app by PASTE, not by typing — the editor's
    // ingress is plain text, so one oversized clipboard lands in the pending
    // value whole.
    const cap = new TextEncoder().encode(SOURCE).length + 8;
    expect(
      draftTemplate(SOURCE, [{ op: 'setScalar', path: AT, keys: ['text'], value: 'x' }], cap),
    ).not.toBeNull();
    expect(
      draftTemplate(
        SOURCE,
        [{ op: 'setScalar', path: AT, keys: ['text'], value: 'y'.repeat(64) }],
        cap,
      ),
    ).toBeNull();
  });

  it('honours a cap the session RAISED, not the default floor', () => {
    // An image-bearing document raises the session cap; a draft must be
    // derivable up to it, or editing text stops previewing on exactly the
    // documents that needed the headroom.
    const value = 'y'.repeat(64);
    const tight = new TextEncoder().encode(SOURCE).length + 8;
    const ops = [{ op: 'setScalar', path: AT, keys: ['text'], value }] as const;
    expect(draftTemplate(SOURCE, ops, tight)).toBeNull();
    expect(draftTemplate(SOURCE, ops, tight + 128)).not.toBeNull();
  });

  it('has nothing to draw for an empty batch', () => {
    expect(draftTemplate(SOURCE, [], MAX_TEMPLATE_BYTES)).toBeNull();
  });
});
