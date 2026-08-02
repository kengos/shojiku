// The `ShojikuGui` singleton — the instance integrator packages register into
// at import time (`ShojikuGui.hook('init:presets', …)` in the integrator's own
// build; npm-standard trust, no auto-discovery). Hosts pass this instance into
// their boot composition; tests construct their own `HookRegistry` instances
// instead, so nothing in the test suite mutates the shared one.

import { HOOK_EVENTS, type HookNotificationMap, type HookProviderMap } from './events';
import { HookRegistry } from './registry';

export const ShojikuGui = new HookRegistry<HookNotificationMap, HookProviderMap>(HOOK_EVENTS);
