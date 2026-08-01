// UNTRUSTED host-supplied menu entries: what a host declares, what a validated
// entry is, and the bounds every field is checked against. A mounted host can be
// multi-tenant, so the count, the string sizes and the id charset are all capped
// and a bad entry is DROPPED rather than thrown — one malformed entry cannot take
// out the whole menu. A validated entry carries the host's OWN callback, so the
// component never looks an id up in a table (no prototype-walk surface).

/** The shape a host supplies for an extra menu entry (the DX-facing type; still
 * runtime-validated — the host is JS). */
export interface RawHostMenuEntry {
  readonly id: string;
  readonly label: string;
  readonly onSelect: () => void;
}

/** A validated host-extension entry: an identifier-safe id, a bounded plain-text
 * label, and the host's own callback. */
export interface HostMenuEntry {
  readonly id: string;
  readonly label: string;
  readonly run: () => void;
}

/** Bounds on host-supplied menu entries — untrusted host input (a mounted host
 * can be multi-tenant), so cap the count and the string sizes and restrict the
 * id charset. Labels render as React text (auto-escaped); these caps stop a
 * layout-breaking or control-character label, never HTML injection. */
export const MAX_HOST_MENU_ENTRIES = 12;
export const MAX_MENU_LABEL_LEN = 40;
export const MAX_MENU_ID_LEN = 64;
const MENU_ID_RE = /^[A-Za-z0-9_-]+$/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters in an untrusted host label is the intent.
const CONTROL_RE = /[\u0000-\u001f\u007f]/;
// Prototype-chain names are rejected outright: the id feeds React keys + a
// dedupe Set only (never a plain-object index), so pollution is already
// impossible, but refusing them keeps the surface trivially safe to reason
// about.
const RESERVED_IDS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

/** Validate an untrusted host-supplied entry list into safe menu entries.
 * Every field is runtime-checked (the host is JS — a TS type is compile-time
 * only): a bad entry is DROPPED, never thrown, so one malformed entry cannot
 * take out the whole menu. Non-array input yields no entries. */
export function validateHostEntries(raw: unknown): HostMenuEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: HostMenuEntry[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (out.length >= MAX_HOST_MENU_ENTRIES) {
      break;
    }
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const rec = item as Record<string, unknown>;
    const { id, label, onSelect } = rec;
    if (
      typeof id !== 'string' ||
      id.length === 0 ||
      id.length > MAX_MENU_ID_LEN ||
      !MENU_ID_RE.test(id) ||
      RESERVED_IDS.has(id)
    ) {
      continue;
    }
    if (typeof onSelect !== 'function') {
      continue;
    }
    if (typeof label !== 'string') {
      continue;
    }
    const trimmed = label.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_MENU_LABEL_LEN || CONTROL_RE.test(trimmed)) {
      continue;
    }
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push({ id, label: trimmed, run: onSelect as () => void });
  }
  return out;
}
