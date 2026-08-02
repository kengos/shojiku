// The mounted host's persistence provider: `TemplateStore` + `ProjectSource`
// over the documented JSON contract, speaking to the host's own server through
// its reverse proxy. Auth is entirely the host's business — requests ride the
// host session (same-origin cookies/headers through the proxy); this client
// never sees or composes a credential. This module is the CLIENT: which route
// each call takes and what each outcome is (fail-closed — a network throw or a
// non-2xx status is a typed failure, 409 a conflict). The guards it depends on
// live below it: the id charset in `httpIds.ts`, the response readers in
// `httpReaders.ts`.

import type {
  DefinitionsDoc,
  DefinitionsStore,
  ProjectDetail,
  ProjectSource,
  ProjectSummary,
  SaveOutcome,
  TemplateDoc,
  TemplateStore,
} from '@shojiku/designer';
import { isSafeId, splitKey } from './httpIds';
import { parseBody, readDoc, readProject, readSavedRev, readSummaries } from './httpReaders';

/** The slice of `fetch` this store consumes — injected, so tests fake it and
 * no browser global is hardwired. */
export interface HttpResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}
export type HttpFetch = (url: string, init?: RequestInit) => Promise<HttpResponse>;

export class HttpStoreError extends Error {}

/** The HTTP provider. `base` is the contract's validated, same-origin base URL
 * (trailing slash); see `app/config.ts` for how it is admitted. */
export class HttpStore implements TemplateStore, ProjectSource, DefinitionsStore {
  private readonly fetchFn: HttpFetch;
  private readonly base: string;

  constructor(deps: { readonly fetch: HttpFetch; readonly base: string }) {
    this.fetchFn = deps.fetch;
    this.base = deps.base;
  }

  private async get(path: string): Promise<unknown | null> {
    const res = await this.fetchFn(`${this.base}${path}`, { credentials: 'same-origin' });
    if (!res.ok) {
      return null;
    }
    return parseBody(await res.text());
  }

  /** PUT one JSON body and read the fail-closed outcome back. */
  private async put(path: string, body: string): Promise<SaveOutcome> {
    try {
      const res = await this.fetchFn(`${this.base}${path}`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body,
      });
      if (res.status === 409) {
        return { ok: false, kind: 'conflict' };
      }
      if (!res.ok) {
        return { ok: false, kind: 'error' };
      }
      const raw = await res.text();
      return { ok: true, rev: raw === '' ? undefined : readSavedRev(parseBody(raw)) };
    } catch {
      return { ok: false, kind: 'error' };
    }
  }

  async listProjects(): Promise<readonly ProjectSummary[]> {
    const projects = readSummaries(await this.get('projects'));
    if (projects === null) {
      throw new HttpStoreError('projects list unavailable');
    }
    return projects;
  }

  async loadProject(id: string): Promise<ProjectDetail> {
    if (!isSafeId(id)) {
      throw new HttpStoreError('invalid project id');
    }
    const project = readProject(await this.get(`projects/${id}`));
    if (project === null) {
      throw new HttpStoreError('project unavailable');
    }
    return project;
  }

  /** Load one template document; `null` when the key is malformed or the host
   * answers with anything but a valid document. */
  async load(key: string): Promise<TemplateDoc | null> {
    const ids = splitKey(key);
    if (ids === null) {
      return null;
    }
    return readDoc(await this.get(`projects/${ids.projectId}/templates/${ids.templateId}`));
  }

  /** Save one template document. Fail-closed: any network throw, non-2xx
   * status, or malformed key is a typed failure; 409 is a conflict. */
  async save(key: string, doc: TemplateDoc): Promise<SaveOutcome> {
    const ids = splitKey(key);
    if (ids === null) {
      return { ok: false, kind: 'error' };
    }
    const body = JSON.stringify({
      source: doc.text,
      fonts: doc.fonts,
      ...(doc.rev !== undefined ? { rev: doc.rev } : {}),
      // A rename rides the save payload; the host may ignore it (last-write-wins
      // on the display name, documented in docs/designer-mount.md). Absent when
      // the user never renamed, so a plain save is byte-identical to before.
      ...(doc.name !== undefined ? { name: doc.name } : {}),
    });
    return this.put(`projects/${ids.projectId}/templates/${ids.templateId}`, body);
  }

  /** Save one project's definitions document. Fail-closed like `save`: a
   * hostile/malformed project id, a network throw, or a non-2xx status is a
   * typed failure; 409 is a conflict. The id is charset-checked BEFORE it
   * composes a URL. */
  async saveDefinitions(projectId: string, doc: DefinitionsDoc): Promise<SaveOutcome> {
    if (!isSafeId(projectId)) {
      return { ok: false, kind: 'error' };
    }
    const body = JSON.stringify({
      definitions: doc.definitions,
      ...(doc.rev !== undefined ? { rev: doc.rev } : {}),
    });
    return this.put(`projects/${projectId}/definitions`, body);
  }
}
