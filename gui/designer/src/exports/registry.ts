// Public surface of the INTEGRATOR seams: the subscriber-style hook registry
// (the mechanism, the append-only v1 event table, the collecting contexts, and
// the persistence provider seam types whose operation names ARE the provider
// events) plus the tutorial course data a host can drive.
// Host-composition surface only — the Designer component itself never reads the
// registry. Re-exported wholesale by the package index.

export {
  COPILOT_INSTRUCTIONS,
  type CopilotProvider,
  type CopilotReply,
  type CopilotRequest,
} from '../registry/copilot';
export {
  HOOK_EVENTS,
  type HookEventName,
  type HookNotificationMap,
  type HookProviderMap,
} from '../registry/events';
export {
  chainFontSources,
  collectFontSources,
  type FontSource,
  type FontsCollector,
  type FontsInitContext,
  type InstalledFont,
} from '../registry/fonts';
export {
  type DefinitionsDoc,
  type DefinitionsStore,
  MAX_NAME_CHARS,
  type ProjectDetail,
  type ProjectSource,
  type ProjectSummary,
  type SaveOutcome,
  type TemplateDoc,
  type TemplateEntry,
  type TemplateStore,
} from '../registry/persistence';
export {
  collectPresets,
  type PresetAsset,
  type PresetContribution,
  type PresetFiles,
  type PresetsCollector,
  type PresetsInitContext,
} from '../registry/presets';
export {
  type AnyProviderFn,
  type DeprecatedStatus,
  type Dispose,
  type EventSpec,
  type EventStatus,
  type EventTable,
  type HookKind,
  HookRegistry,
  type RegistryReporters,
} from '../registry/registry';
export { ShojikuGui } from '../registry/singleton';
export { CoachOverlay, type CoachOverlayProps } from '../tutorial/CoachOverlay';
export { COURSE } from '../tutorial/course';
export { CHAPTER_SEEDS, PRACTICE_PARAMS, TOPIC_SEEDS } from '../tutorial/seeds';
export { TutorialDialog, type TutorialDialogProps } from '../tutorial/TutorialDialog';
export { TOPICS } from '../tutorial/topics';
export type {
  TutorialCourse,
  TutorialProgress,
  TutorialStep,
  TutorialStore,
  TutorialTopic,
} from '../tutorial/types';
