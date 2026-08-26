import type { Op, ReadFn } from '@shojiku/designer-core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { cascadeContext } from '../toolbar/cascade';
import { headerFillOf, readBandCascades } from './bandCascade';
import { TableBandFields } from './TableBandFields';
import { TABLE_HEADER_FILL } from './tableStyleModel';

const TABLE = 'sections.body.items[0]';
const FLOOR = { textAlign: 'left', color: '#000000', fontWeight: 'normal' };

/** A `read` over one document literal, resolving ANY structural path the way the
 * real `Editor.read` does. */
function reader(doc: Record<string, unknown>): ReadFn {
  return (path: string) => {
    let cursor: unknown = doc;
    for (const step of path.split(/[.[\]]/).filter((s) => s !== '')) {
      if (typeof cursor !== 'object' || cursor === null) {
        return undefined;
      }
      cursor = (cursor as Record<string, unknown>)[step];
    }
    return cursor;
  };
}

function docWith(table: unknown, rest: Record<string, unknown> = {}): Record<string, unknown> {
  return { sections: { body: { items: [table] } }, ...rest };
}

/** Mount the four controls over one band of one document, and return the ops
 * they dispatch. `owner` picks which of the three hosts is being reproduced. */
function band(
  doc: Record<string, unknown>,
  owner: 'header' | 'row' | 'column',
  options: { readonly headerFill?: boolean } = {},
) {
  const read = reader(doc);
  const onOp = vi.fn<(op: Op | null) => void>();
  const ctx =
    owner === 'column'
      ? cascadeContext(read, `${TABLE}.columns[0]`, FLOOR)
      : readBandCascades(read, TABLE, FLOOR)[owner];
  const path = owner === 'column' ? `${TABLE}.columns[0]` : TABLE;
  const keys = owner === 'column' ? ['style'] : [owner, 'style'];
  render(
    <I18nProvider locale="en">
      <TableBandFields
        ctx={ctx}
        path={path}
        keys={keys}
        headerFill={options.headerFill === true ? headerFillOf(ctx, TABLE_HEADER_FILL) : undefined}
        onOp={onOp}
      />
    </I18nProvider>,
  );
  return onOp;
}

function boldBox() {
  return screen.getByRole<HTMLInputElement>('checkbox', { name: 'Bold' });
}

/** The alignment options are a fieldset-based `Segmented`: the GROUP answers to
 * role `group`, its options to role `radio`. */
function alignment(name: string) {
  return screen.getByRole<HTMLInputElement>('radio', { name });
}

/** The origin LINES on screen, as text. Queried through the `Effective` label
 * the badge carries, because an engine-floor HINT renders the very same origin
 * string in an aria-hidden bubble — a bare `getByText` cannot tell a line from a
 * bubble, which is the whole distinction under test. */
function originLines(): string[] {
  return screen.queryAllByText('Effective').map((label) => label.closest('p')?.textContent ?? '');
}

/** The colour a swatch trigger PAINTS. The trigger carries no text — the value
 * reaches the DOM only as the chip's inline fill, which `isHexColor` gates, so
 * this is also the assertion that a hostile string never becomes CSS. */
function chipFill(name: string): string {
  const chip = screen.getByRole('button', { name }).querySelector('.sj-color-chip');
  return chip?.getAttribute('style') ?? '';
}

describe('TableBandFields — the control shows what the PAGE does', () => {
  // The item's headline defect: the body band is bold via the document defaults
  // and the box read unchecked, so the panel contradicted the document.
  it('checks Bold when the cascade supplies it and nothing is authored here', () => {
    band(docWith({ type: 'table' }, { defaults: { style: { fontWeight: 'bold' } } }), 'row');
    expect(boldBox().checked).toBe(true);
  });

  it('checks Bold on a COLUMN whose row band is bold', () => {
    band(
      docWith({
        type: 'table',
        row: { style: { fontWeight: 'bold' } },
        columns: [{ label: 'a' }],
      }),
      'column',
    );
    expect(boldBox().checked).toBe(true);
  });

  it('selects the alignment a right-aligned row band gives a column', () => {
    band(
      docWith({
        type: 'table',
        row: { style: { textAlign: 'right' } },
        columns: [{ label: 'a' }],
      }),
      'column',
    );
    expect(alignment('Right').checked).toBe(true);
    expect(alignment('Left').checked).toBe(false);
  });

  it('seeds the colour swatch from the cascade', () => {
    band(docWith({ type: 'table', style: { color: '#00aa00' } }), 'row');
    expect(chipFill('Color')).toContain('rgb(0, 170, 0)');
  });
});

describe('TableBandFields — the ops are cascade-aware', () => {
  it('authors an explicit override when unchecking an inherited Bold', () => {
    const onOp = band(
      docWith({ type: 'table' }, { defaults: { style: { fontWeight: 'bold' } } }),
      'row',
    );
    fireEvent.click(boldBox());
    expect(onOp).toHaveBeenCalledTimes(1);
    expect(onOp).toHaveBeenCalledWith({
      op: 'setScalar',
      path: TABLE,
      keys: ['row', 'style', 'fontWeight'],
      value: 'normal',
    });
  });

  it('drops the own key rather than restating the default', () => {
    const onOp = band(docWith({ type: 'table', row: { style: { fontWeight: 'bold' } } }), 'row');
    fireEvent.click(boldBox());
    expect(onOp).toHaveBeenCalledWith({
      op: 'removeKey',
      path: TABLE,
      keys: ['row', 'style', 'fontWeight'],
    });
  });

  // A native radio fires no change for the checked option, so the "re-pick the
  // active alignment" path never reaches the model — which is the same outcome
  // the model would produce. The requirement is that NOTHING is authored.
  it('authors nothing when the shown alignment is the cascade’s own', () => {
    const onOp = band(
      docWith({
        type: 'table',
        row: { style: { textAlign: 'right' } },
        columns: [{ label: 'a' }],
      }),
      'column',
    );
    fireEvent.click(alignment('Right'));
    expect(onOp).not.toHaveBeenCalled();
  });

  it('authors the column’s own alignment when it differs from the cascade', () => {
    const onOp = band(
      docWith({
        type: 'table',
        row: { style: { textAlign: 'right' } },
        columns: [{ label: 'a' }],
      }),
      'column',
    );
    fireEvent.click(alignment('Left'));
    expect(onOp).toHaveBeenCalledTimes(1);
    expect(onOp).toHaveBeenCalledWith({
      op: 'setScalar',
      path: `${TABLE}.columns[0]`,
      keys: ['style', 'textAlign'],
      value: 'left',
    });
  });

  it('reverts to the cascade when the pick matches what the band would inherit', () => {
    const onOp = band(
      docWith({
        type: 'table',
        row: { style: { textAlign: 'right' } },
        columns: [{ label: 'a', style: { textAlign: 'center' } }],
      }),
      'column',
    );
    fireEvent.click(alignment('Right'));
    expect(onOp).toHaveBeenCalledWith({
      op: 'removeKey',
      path: `${TABLE}.columns[0]`,
      keys: ['style', 'textAlign'],
    });
  });

  it('dispatches nothing on mount', () => {
    const onOp = band(docWith({ type: 'table', row: { style: { color: '#c00000' } } }), 'row');
    expect(onOp).not.toHaveBeenCalled();
  });
});

describe('TableBandFields — where the value came from', () => {
  it('narrates an INHERITED value with the origin line', () => {
    band(docWith({ type: 'table', style: { color: '#00aa00' } }), 'row');
    expect(screen.getByText('Inherited from the level above')).not.toBeNull();
    expect(screen.getByText('#00aa00')).not.toBeNull();
  });

  it('narrates a NAMED-STYLE value, and renders a hostile name as inert text', () => {
    const hostile = '<img src=x onerror=alert(1)>';
    band(
      docWith(
        { type: 'table', row: { styleNames: [hostile] } },
        { styles: { [hostile]: { color: '#c00000' } } },
      ),
      'row',
    );
    const line = screen.getByText(`From style "${hostile}"`);
    expect(line).not.toBeNull();
    expect(line.querySelector('img')).toBeNull();
  });

  it('narrates a `defaults.style` value', () => {
    band(docWith({ type: 'table' }, { defaults: { style: { color: '#00aa00' } } }), 'row');
    expect(originLines()).toEqual(['Effective #00aa00·From document defaults']);
  });

  // The density rule: `textAlign`, `color` and `fontWeight` ALWAYS resolve, so a
  // line apiece would be permanent chrome on every band saying nothing. The
  // origin still rides along, as the decorative hover bubble.
  it('renders NO line for an engine-floor value, only the hover hint', () => {
    band(docWith({ type: 'table' }), 'row');
    expect(originLines()).toEqual([]);
    // One bubble per always-resolving property: alignment, colour, bold. They
    // are what a LINE apiece would have cost the panel.
    const hints = screen.getAllByText('From document defaults');
    expect(hints).toHaveLength(3);
    // SPEC CHANGE: these used to be `aria-hidden`, which made the origin
    // mouse-only. Each is now the DESCRIPTION of the control it explains, so it
    // has to stay readable — and each therefore carries an id.
    for (const hint of hints) {
      expect(hint.getAttribute('aria-hidden')).toBeNull();
      expect(hint.id).not.toBe('');
    }
  });

  // GUI-2. The bubble said where a value came from and said it only to a mouse,
  // and for two of the three it did not even do that: the hover group sat on the
  // LABEL, so pointing at the control showed nothing.
  describe('the origin reaches a keyboard, and the CONTROL shows it', () => {
    /** The element the given control points at with `aria-describedby`. */
    function description(control: Element) {
      const id = control.getAttribute('aria-describedby');
      return id === null ? null : document.getElementById(id);
    }

    it('describes all three floor-valued controls with their own origin', () => {
      band(docWith({ type: 'table' }), 'row');
      const controls = [
        screen.getByRole('group', { name: 'Text alignment' }),
        screen.getByRole('button', { name: 'Color' }),
        boldBox(),
      ];
      for (const control of controls) {
        expect(description(control)?.textContent).toBe('From document defaults');
      }
    });

    it('keeps the control NAMES clean — the origin is a description, not a name', () => {
      // A name is re-read on every visit, and these three values always
      // resolve, so folding the origin into the name would rebuild in audio
      // exactly the permanent chrome the visible-line rule rejects.
      band(docWith({ type: 'table' }), 'row');
      expect(screen.getByRole('group', { name: 'Text alignment' })).not.toBeNull();
      expect(screen.getByRole('button', { name: 'Color' })).not.toBeNull();
      expect(boldBox()).not.toBeNull();
    });

    it('describes nothing when the value was authored HERE', () => {
      band(
        docWith({
          type: 'table',
          row: { style: { color: '#c00000', textAlign: 'right', fontWeight: 'bold' } },
        }),
        'row',
      );
      for (const control of [
        screen.getByRole('group', { name: 'Text alignment' }),
        screen.getByRole('button', { name: 'Color' }),
        boldBox(),
      ]) {
        expect(control.getAttribute('aria-describedby')).toBeNull();
      }
    });

    it('puts the hover group on the FIELD, so the control shows the bubble too', () => {
      // The defect: two of the three groups wrapped only the label, so hovering
      // the thing whose value you are asking about produced nothing.
      band(docWith({ type: 'table' }), 'row');
      for (const control of [
        screen.getByRole('group', { name: 'Text alignment' }),
        screen.getByRole('button', { name: 'Color' }),
        boldBox(),
      ]) {
        const bubble = document.getElementById(
          control.getAttribute('aria-describedby') as string,
        ) as HTMLElement;
        const group = bubble.closest('.group\\/tip');
        expect(group).not.toBeNull();
        expect(group?.contains(control)).toBe(true);
      }
    });

    it('reveals the bubble on keyboard FOCUS as well as hover', () => {
      // Without this the description reaches a screen reader and nothing
      // reaches a sighted keyboard user, who has no way to summon a
      // hover-only bubble at all.
      band(docWith({ type: 'table' }), 'row');
      const bubble = screen.getAllByText('From document defaults')[0];
      expect(bubble.className).toContain('group-hover/tip:opacity-100');
      expect(bubble.className).toContain('group-focus-within/tip:opacity-100');
    });

    it('describes the control in EVERY host the band editors have', () => {
      // One component, four render sites: the header band, the body band, a
      // column's cells, and a row-condition rule (covered beside the rule
      // card's own tests). The header band is the one that differs — it passes
      // a `headerFill` — so a per-host check is not merely the same assertion
      // three times.
      for (const owner of ['header', 'row', 'column'] as const) {
        band(docWith({ type: 'table' }), owner, owner === 'header' ? { headerFill: true } : {});
        for (const control of [screen.getByRole('group', { name: 'Text alignment' }), boldBox()]) {
          const id = control.getAttribute('aria-describedby');
          expect(id, `${owner}: no description`).not.toBeNull();
          expect(document.getElementById(id as string)?.textContent).toBe('From document defaults');
        }
        cleanup();
      }
    });

    it('authors nothing by describing anything', () => {
      // GUI-2 is chrome: no wire moved, so a render must still emit no op.
      const onOp = band(docWith({ type: 'table' }), 'row');
      expect(onOp).not.toHaveBeenCalled();
    });
  });

  it('renders no line and no hint for values authored HERE', () => {
    band(
      docWith({
        type: 'table',
        row: { style: { color: '#c00000', textAlign: 'right', fontWeight: 'bold' } },
      }),
      'row',
    );
    expect(originLines()).toEqual([]);
    expect(screen.queryByText('From document defaults')).toBeNull();
    expect(screen.queryByText('Inherited from the level above')).toBeNull();
  });

  // The one place a floor value is worth a line: `#ededed` is a grey nobody
  // authored and nobody expects, unlike `left` or `#000000`.
  it('keeps the header band’s engine-floor FILL line', () => {
    band(docWith({ type: 'table' }), 'header', { headerFill: true });
    expect(screen.getByText('Effective')).not.toBeNull();
  });

  // `backgroundColor` reaches no ANCESTOR layer, but a named style is not an
  // ancestor — `namedValue` runs ahead of the inherited gate, so a band whose
  // `styleNames` carry a fill really does render one, and it needs saying.
  it('narrates a background a NAMED STYLE supplies', () => {
    band(
      docWith(
        { type: 'table', row: { styleNames: ['tint'] } },
        { styles: { tint: { backgroundColor: '#eef2ff' } } },
      ),
      'row',
    );
    expect(originLines()).toContain('Effective #eef2ff·From style "tint"');
  });

  // Paint order is not a cascade: the row band draws beneath a cell, but
  // `backgroundColor` does not flow, so the panel must claim nothing.
  it('claims no cascade for a background the table or row band carries', () => {
    band(
      docWith({
        type: 'table',
        style: { backgroundColor: '#eeeeee' },
        row: { style: { backgroundColor: '#dddddd' } },
        columns: [{ label: 'a' }],
      }),
      'column',
    );
    // jsdom's CSSOM normalizes an inline colour to `rgb(...)`, so asserting the
    // absence of a HEX string here would pass whatever the component did. The
    // swatch must paint nothing at all.
    expect(chipFill('Background')).not.toContain('rgb(221, 221, 221)');
    expect(chipFill('Background')).not.toContain('rgb(238, 238, 238)');
    expect(chipFill('Background')).not.toMatch(/background-color:\s*\S/);
    // …and no origin line claiming one either. The fixture authors nothing that
    // inherits, so a line here could only be a background pretending to.
    expect(originLines()).toEqual([]);
  });
});

describe('TableBandFields — a hostile document degrades', () => {
  it('renders unset controls over a band that is not a map, and authors nothing', () => {
    const onOp = band(docWith({ type: 'table', row: 'nope' }), 'row');
    expect(boldBox().checked).toBe(false);
    expect(alignment('Left').checked).toBe(true);
    expect(onOp).not.toHaveBeenCalled();
  });

  it('never lets a hostile colour become CSS, and keeps the control clearable', () => {
    const hostile = `javascript:alert(1)${'x'.repeat(200)}`;
    const onOp = band(docWith({ type: 'table', row: { style: { color: hostile } } }), 'row');
    expect(chipFill('Color')).not.toContain('javascript:');
    fireEvent.click(screen.getByRole('button', { name: 'Color' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear' }));
    expect(onOp).toHaveBeenCalledWith({
      op: 'removeKey',
      path: TABLE,
      keys: ['row', 'style', 'color'],
    });
  });
});
