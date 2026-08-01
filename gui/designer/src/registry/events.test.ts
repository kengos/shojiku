import { describe, expect, it } from 'vitest';
import { HOOK_EVENTS } from './events';

describe('the hook-event table', () => {
  it('pins the shipped events literally — the table is append-only', () => {
    // Append-only tripwire (the capabilities-pin posture): a rename or removal
    // fails here; a new event extends this literal in the same change.
    expect(
      [...HOOK_EVENTS.entries()].map(([name, spec]) => [name, spec.kind, spec.status]),
    ).toEqual([
      ['init:fonts', 'notification', 'active'],
      ['init:presets', 'notification', 'active'],
      ['load:template', 'provider', 'active'],
      ['save:template', 'provider', 'active'],
      ['list:projects', 'provider', 'active'],
      ['load:project', 'provider', 'active'],
      ['save:definitions', 'provider', 'active'],
      ['suggest:ops', 'provider', 'active'],
    ]);
  });
});
