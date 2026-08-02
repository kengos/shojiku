// The persistence provider seam — the interfaces a host's stores implement
// (localStorage drafts, the mounted host's HTTP contract, or an integrator's
// own provider registered through the hook registry). The interface operation
// names ARE the registry's provider-kind event names (`load:template` /
// `save:template` / `list:projects` / `load:project` / `save:definitions`):
// the seam registers into the registry rather than coexisting beside it. Save
// is fail-closed request-response: a typed outcome, never a throw into the UI.

import type { Op } from '@shojiku/designer-core';
import type { StoredSampleSet } from '../sample/variantsStore';
import type { InstalledFont } from './fonts';

/** The shared cap on a document display name (chars) — the header rename input,
 * the local draft envelope, and the mounted-host contract all clip to it. A
 * long name is a nuisance, not an attack, once it renders as an escaped text
 * node, so it is clipped rather than rejected. */
export const MAX_NAME_CHARS = 120;

/** One template document as the provider seam carries it. `rev` is the host's
 * opaque concurrency token (round-tripped verbatim); `params` is engineer-owned
 * sample data a remote doc may carry for preview — never part of a save. */
export interface TemplateDoc {
  readonly text: string;
  readonly fonts: readonly InstalledFont[];
  readonly rev?: string;
  readonly params?: string;
  /** The user-assigned document name (header rename). Standalone: persisted in
   * the local draft envelope. Mounted: sent in the save payload (the host may
   * ignore it); never returned on load — the project index entry name stays the
   * authoritative display source on reopen. */
  readonly name?: string;
  /** The full sample-variant set carried by a standalone local draft (filled
   * sample / blank / user-added …). Never part of a mounted save or a remote doc —
   * mounted sample data is engineer-owned and single. */
  readonly sample?: StoredSampleSet;
  /** The EFFECTIVE definitions text carried by a local draft — the workshop mode
   * stub or the engineer file with the data-item editor's edits folded in.
   * Never part of the mounted TEMPLATE save (definitions ride their own
   * `save:definitions` wire). */
  readonly definitions?: string;
  /** The definition-edit OPS behind `definitions` (the data-item editor's
   * coalesced layer). Restored into the Designer so a reopened session
   * re-applies the edits over the LIVE base — blank-start keeps workshop mode
   * (its stub re-inference) instead of freezing the stub as an engineer file.
   * Local-envelope only, never on any save wire. */
  readonly definitionsEdits?: readonly Op[];
}

/** The typed result of a save: success (optionally with the host's next
 * revision token), a concurrency conflict, or a failure. Never a throw. */
export type SaveOutcome =
  | { readonly ok: true; readonly rev?: string }
  | { readonly ok: false; readonly kind: 'conflict' | 'error' };

/** The template-document store (`load:template` / `save:template`): what the
 * editor saves through and the app loads from. Implementations: the app's
 * `DraftStore` (localStorage working copies) and `HttpStore` (the mounted
 * host contract). */
export interface TemplateStore {
  load(key: string): Promise<TemplateDoc | null>;
  save(key: string, doc: TemplateDoc): Promise<SaveOutcome>;
}

/** A project as listed (`list:projects`). */
export interface ProjectSummary {
  readonly id: string;
  readonly name: string;
}

/** A template as listed inside a project. `engineLocale` picks the engine boot
 * locale (fonts + locale pack) for editing it; absent = `en-US`. */
export interface TemplateEntry {
  readonly id: string;
  readonly name: string;
  readonly engineLocale?: string;
}

/** A loaded project (`load:project`): the engineer-registered definitions plus
 * the PM-edited templates' index. `definitionsRev` is the host's concurrency
 * token for the definitions doc (round-tripped verbatim through a save). */
export interface ProjectDetail {
  readonly id: string;
  readonly name: string;
  readonly definitions?: string;
  readonly definitionsRev?: string;
  readonly templates: readonly TemplateEntry[];
}

/** The project catalog of a mounted host (`list:projects` / `load:project`). */
export interface ProjectSource {
  listProjects(): Promise<readonly ProjectSummary[]>;
  loadProject(id: string): Promise<ProjectDetail>;
}

/** One project's definitions document as the save wire carries it. */
export interface DefinitionsDoc {
  readonly definitions: string;
  readonly rev?: string;
}

/** The definitions-write seam (`save:definitions`): a mounted host that lets the
 * Designer edit `definitions.yml` implements it (the standalone draft store does
 * not — definitions ride the local envelope there). Fail-closed like
 * `TemplateStore.save`: a typed outcome, never a throw. */
export interface DefinitionsStore {
  saveDefinitions(projectId: string, doc: DefinitionsDoc): Promise<SaveOutcome>;
}
