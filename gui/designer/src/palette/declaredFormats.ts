// A field's declared display variants (`displayFormats: [{ id, label? }]`) as
// the PLACEMENT side reads them: the data-item editor writes the list
// (`data/displayFormatsModel.ts`), and the format picker of a placement bound to
// the field offers it. Read-only and tolerant, like the rest of the palette
// walk: the engine refuses a definitions file whose list is malformed
// (`deny_unknown_fields`), so an entry this cannot read is skipped rather than
// reported here.
//
// The `id` is kept VERBATIM, never clipped: a pick writes it back as
// `format: <id>`, and a clipped spelling would name a variant the field does
// not declare. Only the display layer clips. The list is count-bounded. An
// EMPTY id is kept too: the engine counts it, so `[ { id: "" } ]` restricts the
// field exactly as any other non-empty list does — the picker just offers no row
// for it.

import { MAX_DECLARED_FORMATS } from './caps';
import { record } from './fieldDisplay';

/** One declared variant. `label` is the author's words, empty when the entry
 * declares none (the picker then names the variant some other way). */
export interface DeclaredFormat {
  readonly id: string;
  readonly label: string;
}

function entry(raw: unknown): DeclaredFormat | undefined {
  const map = record(raw);
  if (map === undefined) {
    return undefined;
  }
  const id = Object.hasOwn(map, 'id') ? map.id : undefined;
  const label = Object.hasOwn(map, 'label') ? map.label : undefined;
  const known = Object.keys(map).every((key) => key === 'id' || key === 'label');
  if (!known || typeof id !== 'string') {
    return undefined;
  }
  if (label !== undefined && typeof label !== 'string') {
    return undefined;
  }
  return { id, label: label ?? '' };
}

/** The declared variants of one schema node's `displayFormats`, in the order
 * written: anything but a list reads as none, an unreadable entry is skipped, a
 * repeated id keeps its first entry, and at most `MAX_DECLARED_FORMATS` are
 * read. */
export function declaredFormats(raw: unknown): readonly DeclaredFormat[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: DeclaredFormat[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (out.length >= MAX_DECLARED_FORMATS) {
      break;
    }
    const parsed = entry(item);
    if (parsed !== undefined && !seen.has(parsed.id)) {
      seen.add(parsed.id);
      out.push(parsed);
    }
  }
  return out;
}
