// One item's OWN reference surfaces (its children are the walk's business):
// `data`, `visible`, a text mark, the interpolated text and link of the types
// the engine interpolates, every span, and the `bindings:` declarations. See
// `walk.ts` for the scope rules these frames implement.

import { ARRAY_SOURCE_TYPES, bindingKey, bindingScope } from '../../palette/bindingRefs';
import { narrowDeclarations } from '../../text/declModel';
import { record } from '../../tree/nodeFields';
import { recordInline, recordWhole, type Sink, type Site } from './collect';
import type { Carrier, RefOwner } from './types';

const TEXT_TYPES = new Set(['text', 'qr_code', 'char_grid']);
const LINK_TYPES = new Set(['text', 'image']);

/** The frame a binding resolves under. */
export function frameOf(binding: unknown, ambient: readonly string[]): readonly string[] {
  return bindingScope(binding, '') === null ? [] : ambient;
}

/** What an item's own `data:` does: an array source's rows, an ellipse's or a
 * checkbox's drawing condition (named as their panels name it), else a value. */
function dataCarrier(type: string, source: boolean): Carrier {
  if (source) {
    return 'source';
  }
  return type === 'ellipse' || type === 'checkbox' ? type : 'value';
}

/** The surfaces ONE item carries at its own level (not its children). Returns
 * the frame its rows open under (`null` = it is not an array source). */
export function itemSurfaces(
  sink: Sink,
  item: Record<string, unknown>,
  owner: RefOwner,
  ambient: readonly string[],
): readonly string[] | null {
  const { path, type } = owner;
  const decls = narrowDeclarations(item.bindings);
  const site: Site = { owner, detail: null, frame: ambient, shadow: new Set(decls.keys()) };
  const at = (binding: unknown): Site => ({ ...site, frame: frameOf(binding, ambient) });
  const source = ARRAY_SOURCE_TYPES.has(type);
  const key = bindingKey(item.data);
  // A `list` resolves in its enclosing rows; every other source is read from
  // the ROOT wherever it sits (the engine checks a repeat nested in a cell
  // against the top-level catalog, and layout reads it from root params).
  const absolute = source && type !== 'list';
  const dataSite = absolute ? { ...site, frame: [] } : at(item.data);
  recordWhole(sink, dataSite, path, ['data', 'key'], key, dataCarrier(type, source), source);
  recordWhole(
    sink,
    at(item.visible),
    path,
    ['visible', 'key'],
    bindingKey(item.visible),
    'visible',
  );
  const mark = record(item.mark);
  recordWhole(sink, at(mark?.data), path, ['mark', 'data', 'key'], bindingKey(mark?.data), 'mark');
  const rows = source && key !== undefined ? [...dataSite.frame, ...key.split('.')] : null;
  const entry = type === 'list' ? rows : null;
  if (TEXT_TYPES.has(type)) {
    recordInline(sink, site, path, ['text'], item.text, 'inline');
  }
  if (entry !== null) {
    recordInline(sink, { ...site, frame: entry }, path, ['text'], item.text, 'inline');
  }
  if (LINK_TYPES.has(type)) {
    recordInline(sink, site, path, ['link', 'url'], record(item.link)?.url, 'link');
  }
  if (Array.isArray(item.spans)) {
    item.spans.forEach((raw, index) => {
      const span = record(raw);
      const spanPath = `${path}.spans[${index}]`;
      recordWhole(sink, at(span?.data), spanPath, ['data', 'key'], bindingKey(span?.data), 'value');
      recordInline(sink, site, spanPath, ['text'], span?.text, 'inline');
      recordInline(sink, site, spanPath, ['link', 'url'], record(span?.link)?.url, 'link');
    });
  }
  for (const [name, decl] of decls) {
    const declFrame = decl.scope === 'document' ? [] : (entry ?? ambient);
    recordWhole(
      sink,
      { ...site, frame: declFrame },
      path,
      ['bindings', name, 'key'],
      decl.key,
      'declaration',
    );
  }
  return rows;
}
