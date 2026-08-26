// A format catalog shaped like the engine's real answer for a ja-JP document
// that declares one `formats:` registry entry. Test substrate only — excluded
// from coverage.
//
// The samples are deliberately DISCRIMINATING (the engine's own exemplar
// values): the currency and number rows differ, `wareki` differs from the
// pack default, and `quantity` carries both plural arms. A fixture whose
// samples all read alike would let a lookup bug pass.
import type { FormatCatalog, ProbeRefusal, ProbeResult } from '../engine/types';

export const FORMAT_CATALOG: FormatCatalog = {
  types: [
    {
      fieldType: 'date',
      fixed: false,
      variants: [
        { spelling: 'stamp', origin: 'registry', samples: ['2026.11.03'] },
        { spelling: 'default', origin: 'pack', samples: ['2026年11月3日'] },
        { spelling: 'wareki', origin: 'pack', samples: ['令和8年11月3日'] },
      ],
    },
    {
      fieldType: 'datetime',
      fixed: false,
      variants: [{ spelling: 'default', origin: 'pack', samples: ['2026-11-03 14:05'] }],
    },
    {
      fieldType: 'currency',
      fixed: false,
      variants: [
        { spelling: 'default', origin: 'builtin', samples: ['1,234,568'] },
        { spelling: 'symbol', origin: 'builtin', samples: ['¥1,234,568'] },
        { spelling: 'name', origin: 'builtin', samples: ['1,234,568 JPY'] },
      ],
    },
    {
      fieldType: 'number',
      fixed: true,
      variants: [{ spelling: 'default', origin: 'builtin', samples: ['12,345,678.9'] }],
    },
    {
      fieldType: 'percentage',
      fixed: true,
      variants: [{ spelling: 'default', origin: 'builtin', samples: ['12.34%'] }],
    },
    {
      fieldType: 'quantity',
      fixed: true,
      variants: [{ spelling: 'default', origin: 'builtin', samples: ['1点', '12,345点'] }],
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
