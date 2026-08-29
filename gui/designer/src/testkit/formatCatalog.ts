// A format catalog shaped like the engine's real answer for a ja-JP document
// that declares one `formats:` registry entry. Test substrate only — excluded
// from coverage.
//
// The samples are deliberately DISCRIMINATING (the engine's own exemplar
// values): the currency and number rows differ, `wareki` differs from the
// pack default, and `quantity` carries both plural arms. A fixture whose
// samples all read alike would let a lookup bug pass.
//
// The `datetime` entry mirrors what the real ja-JP pack produces, including
// the three variants the engine reports as `dropsTime`: a datetime slot
// resolves the pack's DATE table after its own, so `compact` and
// `wareki-compact` are offered there and render date-only — as does `date`,
// whose own `datetimeFormats` pattern carries no time. It used to hold
// `default` alone, which was too thin to prove either the picker's merge of
// the catalog's variants or the date-only note beside them.
import type { FormatCatalog, ProbeRefusal, ProbeResult } from '../engine/types';

export const FORMAT_CATALOG: FormatCatalog = {
  types: [
    {
      fieldType: 'date',
      fixed: false,
      variants: [
        { spelling: 'stamp', origin: 'registry', samples: ['2026.11.03'], dropsTime: false },
        { spelling: 'default', origin: 'pack', samples: ['2026年11月3日'], dropsTime: false },
        { spelling: 'wareki', origin: 'pack', samples: ['令和8年11月3日'], dropsTime: false },
      ],
    },
    {
      fieldType: 'datetime',
      fixed: false,
      variants: [
        { spelling: 'date', origin: 'pack', samples: ['2026年11月3日(火)'], dropsTime: true },
        {
          spelling: 'default',
          origin: 'pack',
          samples: ['2026/11/03(火) 14:05'],
          dropsTime: false,
        },
        {
          spelling: 'wareki',
          origin: 'pack',
          samples: ['令和8年11月3日 14:05'],
          dropsTime: false,
        },
        { spelling: 'compact', origin: 'pack', samples: ['2026/11/03'], dropsTime: true },
        { spelling: 'wareki-compact', origin: 'pack', samples: ['R8.11.3'], dropsTime: true },
      ],
    },
    {
      fieldType: 'currency',
      fixed: false,
      variants: [
        { spelling: 'default', origin: 'builtin', samples: ['1,234,568'], dropsTime: false },
        { spelling: 'symbol', origin: 'builtin', samples: ['¥1,234,568'], dropsTime: false },
        { spelling: 'name', origin: 'builtin', samples: ['1,234,568 JPY'], dropsTime: false },
      ],
    },
    {
      fieldType: 'number',
      fixed: true,
      variants: [
        { spelling: 'default', origin: 'builtin', samples: ['12,345,678.9'], dropsTime: false },
      ],
    },
    {
      fieldType: 'percentage',
      fixed: true,
      variants: [{ spelling: 'default', origin: 'builtin', samples: ['12.34%'], dropsTime: false }],
    },
    {
      fieldType: 'quantity',
      fixed: true,
      variants: [
        { spelling: 'default', origin: 'builtin', samples: ['1点', '12,345点'], dropsTime: false },
      ],
    },
  ],
  probes: [],
};

/** A probe that answers like the engine: the pattern first, then one result per
 * token, each echoing what it was asked so a test can tell them apart. */
export function fakeProbe(
  render: (pattern: string) => string = (pattern) => `[${pattern}]`,
  warning: string | null = null,
) {
  return async (probes: readonly { readonly pattern: string }[]): Promise<readonly ProbeResult[]> =>
    probes.map((probe) => ({ sample: render(probe.pattern), warning, refused: null }));
}

/** A probe that answers like the engine when the PATTERN is refused: the
 * pattern's own slot carries the refusal and nothing else — an empty sample and
 * no warning, exactly what `formats/probe.rs` mints — while the token chips
 * still answer, because each token is its own short probe well under the cap.
 * Refusing every slot instead would let a surface pass that reads the refusal
 * off a CHIP. */
export function refusingProbe(refused: ProbeRefusal = 'patternTooLong') {
  return async (probes: readonly { readonly pattern: string }[]): Promise<readonly ProbeResult[]> =>
    probes.map((probe, index) =>
      index === 0
        ? { sample: '', warning: null, refused }
        : { sample: `[${probe.pattern}]`, warning: null, refused: null },
    );
}

/** A probe that cannot ANSWER — the shape `useFormatCatalog` produces over a
 * transport with no `formatCatalog` at all, which is what the standalone app
 * ran on until the lazy-font wrapper started forwarding the query. An empty
 * list is shorter than the probe list, so nothing can be read out of it: the
 * surface has no chips and no preview, and must say so rather than fall into
 * the prompt asking for a pattern. */
export function deadProbe() {
  return async (): Promise<readonly ProbeResult[]> => [];
}
