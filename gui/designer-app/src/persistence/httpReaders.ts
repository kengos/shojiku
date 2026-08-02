// What a mounted host's RESPONSE means. Every response is untrusted input, so
// each reader is field-level: a hostile or malformed payload becomes `null` —
// which the client turns into a typed failure or a clean miss — never a crash
// and never a value that escapes into a URL (ids are re-checked here through
// `httpIds.ts`). Body size and list lengths are capped before anything is
// walked. The client that fetches is `http.ts`.

import {
  MAX_NAME_CHARS,
  type ProjectDetail,
  type ProjectSummary,
  type TemplateDoc,
  type TemplateEntry,
} from '@shojiku/designer';
import { isSafeId } from './httpIds';
import { isInstalledFont, isString } from './storedDoc';

/** Cap on any single response body (chars). Covers the largest legitimate
 * payload (a template source with definitions) with generous headroom. */
export const MAX_RESPONSE_CHARS = 4 * 1024 * 1024;
/** Cap on list lengths (projects, templates per project, fonts per doc). */
export const MAX_LIST_ENTRIES = 256;

function clipName(value: unknown): string | null {
  return isString(value) ? value.slice(0, MAX_NAME_CHARS) : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Parse a bounded response body as JSON; null on oversize/malformed. */
export function parseBody(raw: string): unknown | null {
  if (raw.length > MAX_RESPONSE_CHARS) {
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function readSummaries(parsed: unknown): readonly ProjectSummary[] | null {
  const body = asRecord(parsed);
  if (body === null || !Array.isArray(body.projects) || body.projects.length > MAX_LIST_ENTRIES) {
    return null;
  }
  const projects: ProjectSummary[] = [];
  for (const entry of body.projects) {
    const record = asRecord(entry);
    const name = record === null ? null : clipName(record.name);
    if (record === null || !isSafeId(record.id) || name === null) {
      return null;
    }
    projects.push({ id: record.id, name });
  }
  return projects;
}

function readTemplateEntry(value: unknown): TemplateEntry | null {
  const record = asRecord(value);
  const name = record === null ? null : clipName(record.name);
  if (record === null || !isSafeId(record.id) || name === null) {
    return null;
  }
  if (record.engineLocale !== undefined && !isSafeId(record.engineLocale)) {
    return null;
  }
  return { id: record.id, name, engineLocale: record.engineLocale as string | undefined };
}

export function readProject(parsed: unknown): ProjectDetail | null {
  const body = asRecord(parsed);
  const name = body === null ? null : clipName(body.name);
  if (body === null || !isSafeId(body.id) || name === null) {
    return null;
  }
  if (body.definitions !== undefined && !isString(body.definitions)) {
    return null;
  }
  if (body.definitionsRev !== undefined && !isString(body.definitionsRev)) {
    return null;
  }
  if (!Array.isArray(body.templates) || body.templates.length > MAX_LIST_ENTRIES) {
    return null;
  }
  const templates: TemplateEntry[] = [];
  for (const entry of body.templates) {
    const template = readTemplateEntry(entry);
    if (template === null) {
      return null;
    }
    templates.push(template);
  }
  return {
    id: body.id,
    name,
    definitions: body.definitions as string | undefined,
    definitionsRev: body.definitionsRev as string | undefined,
    templates,
  };
}

export function readDoc(parsed: unknown): TemplateDoc | null {
  const body = asRecord(parsed);
  if (body === null || !isString(body.source)) {
    return null;
  }
  if (body.params !== undefined && !isString(body.params)) {
    return null;
  }
  if (body.rev !== undefined && !isString(body.rev)) {
    return null;
  }
  const fonts = body.fonts === undefined ? [] : body.fonts;
  if (!Array.isArray(fonts) || fonts.length > MAX_LIST_ENTRIES || !fonts.every(isInstalledFont)) {
    return null;
  }
  return {
    text: body.source,
    fonts,
    rev: body.rev as string | undefined,
    params: body.params as string | undefined,
  };
}

export function readSavedRev(parsed: unknown): string | undefined {
  const body = asRecord(parsed);
  return body !== null && isString(body.rev) ? body.rev : undefined;
}
