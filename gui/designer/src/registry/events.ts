// The v1 hook-event table — the append-only registry of hookable events, the
// same governance posture as the engine's diagnostics code registry: event
// names and payload keys are only ever ADDED (a retirement goes through the
// deprecation metadata, actual removal only across a major version), and an
// event exists only once a real consumer does — never speculatively. Naming
// scheme (decided once, here): `<stage-or-verb>[:<topic>]` — the first
// segment is a lifecycle stage (`init`) or an operation verb (`load` / `save`
// / `list`), the second the topic, singular for a one-document operation and
// plural for a collection one.

import type { CopilotProvider } from './copilot';
import type { FontsInitContext } from './fonts';
import type {
  DefinitionsDoc,
  ProjectDetail,
  ProjectSummary,
  SaveOutcome,
  TemplateDoc,
} from './persistence';
import type { PresetsInitContext } from './presets';
import type { EventSpec, EventTable } from './registry';

/** Notification events → their typed context payloads. */
export interface HookNotificationMap {
  /** Host boot: contribute boot-scoped font sources (consulted in
   * contribution order, before the session's picked-font library). */
  'init:fonts': FontsInitContext;
  /** Host boot: contribute catalog presets (the app's own assembled catalog
   * registers first; contributions follow in registration order). */
  'init:presets': PresetsInitContext;
}

/** Provider events → their call signatures (the persistence seam's operation
 * names ARE these events; the interfaces live in persistence.ts). */
export interface HookProviderMap {
  'load:template': (key: string) => Promise<TemplateDoc | null>;
  'save:template': (key: string, doc: TemplateDoc) => Promise<SaveOutcome>;
  'list:projects': () => Promise<readonly ProjectSummary[]>;
  'load:project': (id: string) => Promise<ProjectDetail>;
  'save:definitions': (projectId: string, doc: DefinitionsDoc) => Promise<SaveOutcome>;
  /** The AI copilot's transport: forward the request to the host's own LLM and
   * resolve with its proposed patch-op list (validated GUI-side, fail-closed).
   * Registered → the Designer's copilot UI appears; absent → hidden. */
  'suggest:ops': CopilotProvider;
}

export type HookEventName = keyof HookNotificationMap | keyof HookProviderMap;

const NOTIFICATION: EventSpec = { kind: 'notification', status: 'active' };
const PROVIDER: EventSpec = { kind: 'provider', status: 'active' };

/** The shipped event table (a real Map — hostile names never resolve through
 * a prototype chain). Append-only. */
export const HOOK_EVENTS: EventTable = new Map<string, EventSpec>([
  ['init:fonts', NOTIFICATION],
  ['init:presets', NOTIFICATION],
  ['load:template', PROVIDER],
  ['save:template', PROVIDER],
  ['list:projects', PROVIDER],
  ['load:project', PROVIDER],
  ['save:definitions', PROVIDER],
  ['suggest:ops', PROVIDER],
]);
