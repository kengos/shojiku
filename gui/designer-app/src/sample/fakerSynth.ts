// The faker-backed sample-data value synth (the app's implementation of the
// component's `ValueSynth` injection seam). The Designer ships only the
// deterministic `baselineSynth`; the app enriches generation with realistic,
// locale-aware values from `@faker-js/faker` — injected exactly like the engine
// transport or the font catalog, so the component stays dependency-free.
//
// Determinism is preserved: `faker.seed(hashKey(keyPath))` before each field
// means the same key path always yields the same value (a stable draft/export
// diff). The faker locale module is loaded through an INJECTED loader (a map of
// per-locale dynamic imports in main.tsx), so Vite code-splits one locale per
// chunk and the failure path is testable without a real import.

import { hashKey, type SynthSpec, type ValueSynth } from '@shojiku/designer';

/** The structural subset of a faker instance this synth uses — decoupled from
 * faker's own types so a test can inject a minimal fake. The real per-locale
 * `faker` instance satisfies it. */
export interface FakerLike {
  seed(value: number): void;
  datatype: { boolean(): boolean };
  number: {
    int(options: { min: number; max: number }): number;
    float(options: { min: number; max: number; fractionDigits: number }): number;
  };
  person: { fullName(): string };
  internet: { email(): string; url(): string };
  phone: { number(): string };
  location: { streetAddress(): string; city(): string };
  company: { name(): string };
  lorem: { words(count: number): string };
  date: { recent(): Date };
}

function isoDate(faker: FakerLike): string {
  return faker.date.recent().toISOString().slice(0, 10);
}

/** Map a known semantic `format` to a faker generator; unknown formats fall
 * back to a lorem phrase (the generator then clamps to length constraints).
 * A real `Map`: `format` is an attacker string (mounted definitions are
 * host-supplied), and a plain-object lookup would walk the prototype — a
 * `format: constructor` would return `Object.prototype.constructor` and CALL
 * it as a generator. */
const FORMAT_FNS: ReadonlyMap<string, (faker: FakerLike) => string> = new Map([
  ['person-name', (faker: FakerLike) => faker.person.fullName()],
  ['email', (faker: FakerLike) => faker.internet.email()],
  ['url', (faker: FakerLike) => faker.internet.url()],
  ['phone', (faker: FakerLike) => faker.phone.number()],
  ['address', (faker: FakerLike) => faker.location.streetAddress()],
  ['city', (faker: FakerLike) => faker.location.city()],
  ['company-name', (faker: FakerLike) => faker.company.name()],
  ['date', isoDate],
  ['date-time', isoDate],
]);

/** Build a `ValueSynth` over a faker instance. Numbers respect the schema
 * bounds (a contradictory min > max collapses to the lower bound, never a
 * throw); strings delegate to a format generator or a lorem phrase. */
export function makeFakerSynth(faker: FakerLike): ValueSynth {
  return (spec: SynthSpec) => {
    faker.seed(hashKey(spec.keyPath));
    const { type, format, constraints } = spec;
    if (type === 'boolean') {
      return faker.datatype.boolean();
    }
    if (type === 'number' || type === 'integer') {
      const min = constraints.minimum ?? 0;
      // Money-shaped fields synthesize WHOLE amounts: a fractional draw
      // (474.92) reads wrong in an invoice, and under a zero-fraction currency
      // (JPY) it also rounds oddly at display. Give money an invoice-shaped
      // range and no decimals; the display code/precision stays the field's.
      if (format === 'currency') {
        const cap =
          constraints.maximum !== undefined && constraints.maximum >= min
            ? constraints.maximum
            : min + 100_000;
        return faker.number.int({ min, max: cap });
      }
      const max =
        constraints.maximum !== undefined && constraints.maximum >= min
          ? constraints.maximum
          : min + 1000;
      return type === 'integer'
        ? faker.number.int({ min, max })
        : faker.number.float({ min, max, fractionDigits: 2 });
    }
    if (format !== undefined) {
      const fn = FORMAT_FNS.get(format);
      if (fn !== undefined) {
        return fn(faker);
      }
    }
    return faker.lorem.words(3);
  };
}

/** Engine locale → faker locale-module key (faker uses underscores). A real
 * `Map`: a mounted host supplies `engineLocale` (its id charset admits plain
 * identifiers like `constructor`), and a plain-object lookup would return the
 * inherited property instead of missing to the `en` fallback. */
export const FAKER_LOCALES: ReadonlyMap<string, string> = new Map([
  ['ja-JP', 'ja'],
  ['en-US', 'en'],
  ['en-GB', 'en_GB'],
  ['en-AU', 'en_AU'],
  ['en-CA', 'en_CA'],
  ['en-IN', 'en_IN'],
  ['zh-TW', 'zh_TW'],
  ['zh-CN', 'zh_CN'],
]);

/** Resolve an engine locale to a faker module key, defaulting to English. */
export function fakerLocaleKey(engineLocale: string): string {
  return FAKER_LOCALES.get(engineLocale) ?? 'en';
}

/** Loads a faker locale module (`@faker-js/faker/locale/<key>`). Injected so
 * the dynamic-import map lives in main.tsx and the failure path is testable. */
export type LoadFakerModule = (localeKey: string) => Promise<{ faker: FakerLike }>;

/** Build a locale-bound synth for an engine locale. Rejects if the loader
 * rejects — the caller (EditorScreen) falls back to the baseline synth. */
export async function loadFakerSynth(
  engineLocale: string,
  load: LoadFakerModule,
): Promise<ValueSynth> {
  const module = await load(fakerLocaleKey(engineLocale));
  return makeFakerSynth(module.faker);
}
