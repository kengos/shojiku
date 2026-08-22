import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import type { Mock } from 'vitest';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { SelectField } from './choiceFields';
import { showsUnitHint, TextField } from './fields';
import { SeededField } from './SeededField';
import { StepperField } from './StepperField';

function draw(props: {
  value: string;
  canStep: boolean;
  onCommit?: Mock<(value: string) => void>;
  onStep?: Mock<(dir: -1 | 1) => void>;
}) {
  const onCommit = props.onCommit ?? vi.fn<(value: string) => void>();
  const onStep = props.onStep ?? vi.fn<(dir: -1 | 1) => void>();
  render(
    <I18nProvider locale="en">
      <StepperField
        label="X"
        value={props.value}
        canStep={props.canStep}
        onCommit={onCommit}
        onStep={onStep}
      />
    </I18nProvider>,
  );
  return { onCommit, onStep };
}

describe('StepperField', () => {
  it('seeds the input with the current value and renders ▲▼ buttons', () => {
    draw({ value: '12', canStep: true });
    expect((screen.getByLabelText('X') as HTMLInputElement).value).toBe('12');
    expect(screen.getByRole('button', { name: 'Increase' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Decrease' })).toBeTruthy();
  });

  it('commits a changed value on blur', () => {
    const { onCommit } = draw({ value: '12', canStep: true });
    fireEvent.blur(screen.getByLabelText('X'), { target: { value: '20' } });
    expect(onCommit).toHaveBeenCalledWith('20');
  });

  it('does not commit an unchanged value on blur', () => {
    const { onCommit } = draw({ value: '12', canStep: true });
    fireEvent.blur(screen.getByLabelText('X'), { target: { value: '12' } });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('steps up and down through onStep', () => {
    const { onStep } = draw({ value: '12', canStep: true });
    fireEvent.click(screen.getByRole('button', { name: 'Increase' }));
    fireEvent.click(screen.getByRole('button', { name: 'Decrease' }));
    expect(onStep.mock.calls).toEqual([[1], [-1]]);
  });

  it('disables the ▲▼ buttons when the value is not steppable', () => {
    const { onStep } = draw({ value: '50%', canStep: false });
    const up = screen.getByRole('button', { name: 'Increase' }) as HTMLButtonElement;
    expect(up.disabled).toBe(true);
    fireEvent.click(up);
    expect(onStep).not.toHaveBeenCalled();
  });
});

// The value-keyed uncontrolled input is the property-panel remount fix (#6): an
// input reseeds only when ITS OWN value changes, so an external change still
// reseeds it, but a sibling's commit no longer discards its in-progress entry.
describe('value-keyed reseed', () => {
  it('reseeds an uncontrolled input when its own value prop changes (undo/selection)', () => {
    const { rerender } = render(
      <I18nProvider locale="en">
        <TextField label="F" value="x" onCommit={vi.fn()} />
      </I18nProvider>,
    );
    const input = () => screen.getByLabelText('F') as HTMLInputElement;
    expect(input().value).toBe('x');
    fireEvent.change(input(), { target: { value: 'dirty' } });
    rerender(
      <I18nProvider locale="en">
        <TextField label="F" value="y" onCommit={vi.fn()} />
      </I18nProvider>,
    );
    expect(input().value).toBe('y');
  });

  it('keeps an in-progress sibling input when another field commits', () => {
    function TwoFields() {
      const [a, setA] = useState('a0');
      return (
        <>
          <TextField label="A" value={a} onCommit={setA} />
          <TextField label="B" value="b0" onCommit={vi.fn()} />
        </>
      );
    }
    render(
      <I18nProvider locale="en">
        <TwoFields />
      </I18nProvider>,
    );
    // Type into B without committing, then commit A (which re-renders the parent).
    fireEvent.change(screen.getByLabelText('B'), { target: { value: 'typed-into-B' } });
    fireEvent.blur(screen.getByLabelText('A'), { target: { value: 'a1' } });
    // B's own value prop ("b0") did not change, so it was not remounted.
    expect((screen.getByLabelText('B') as HTMLInputElement).value).toBe('typed-into-B');
  });
});

function drawSeeded(props: {
  authored: string;
  seed?: string;
  placeholder?: string;
  options?: readonly string[];
  listId?: string;
  unit?: string;
  onCommit?: Mock<(value: string) => void>;
}) {
  const onCommit = props.onCommit ?? vi.fn<(value: string) => void>();
  render(
    <I18nProvider locale="en">
      <SeededField
        label="Size"
        authored={props.authored}
        seed={props.seed}
        unit={props.unit}
        placeholder={props.placeholder}
        options={props.options}
        listId={props.listId}
        onCommit={onCommit}
      />
    </I18nProvider>,
  );
  return { onCommit };
}

describe('SeededField', () => {
  it('stays EMPTY when unset, with the engine fallback only as its placeholder', () => {
    drawSeeded({ authored: '', seed: '10' });
    const input = screen.getByLabelText('Size') as HTMLInputElement;
    // The whole point of the placeholder form: an unauthored key must not look
    // like a value the document set.
    expect(input.value).toBe('');
    expect(input.getAttribute('placeholder')).toBe('10');
  });

  it('shows the authored value when set', () => {
    drawSeeded({ authored: '13', seed: '10' });
    expect((screen.getByLabelText('Size') as HTMLInputElement).value).toBe('13');
  });

  it('writes nothing when an unset field is blurred having typed the fallback back out', () => {
    const { onCommit } = drawSeeded({ authored: '', seed: '10' });
    fireEvent.blur(screen.getByLabelText('Size'), { target: { value: '' } });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('writes nothing when an authored field is blurred unchanged', () => {
    const { onCommit } = drawSeeded({ authored: '13', seed: '10' });
    fireEvent.blur(screen.getByLabelText('Size'), { target: { value: '13' } });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('commits a changed value from an unset field', () => {
    const { onCommit } = drawSeeded({ authored: '', seed: '10' });
    fireEvent.blur(screen.getByLabelText('Size'), { target: { value: '18' } });
    expect(onCommit).toHaveBeenCalledWith('18');
  });

  it('commits empty when an authored value is cleared (clears the key)', () => {
    const { onCommit } = drawSeeded({ authored: '13', seed: '10' });
    fireEvent.blur(screen.getByLabelText('Size'), { target: { value: '' } });
    expect(onCommit).toHaveBeenCalledWith('');
  });

  it('falls back to the given placeholder when there is no seed (host default absent)', () => {
    drawSeeded({ authored: '', placeholder: '(locale default)' });
    const input = screen.getByLabelText('Size') as HTMLInputElement;
    expect(input.value).toBe('');
    expect(input.getAttribute('placeholder')).toBe('(locale default)');
  });

  it('treats an empty seed as no seed (the placeholder still shows)', () => {
    drawSeeded({ authored: '', seed: '', placeholder: '(locale default)' });
    expect((screen.getByLabelText('Size') as HTMLInputElement).getAttribute('placeholder')).toBe(
      '(locale default)',
    );
  });

  it('renders a datalist when options + listId are given (fontFamily combo)', () => {
    drawSeeded({
      authored: '',
      seed: 'biz-udp-gothic',
      options: ['a', 'b'],
      listId: 'sj-seed-list',
    });
    const input = screen.getByLabelText('Size') as HTMLInputElement;
    expect(input.getAttribute('list')).toBe('sj-seed-list');
    const options = Array.from(document.querySelectorAll('#sj-seed-list option'), (o) =>
      o.getAttribute('value'),
    );
    expect(options).toEqual(['a', 'b']);
  });
});

/** A stepper rendered with whatever unit/tag/placeholder the badge test needs. */
function drawStepper(props: { value: string; unit?: string; tag?: string; placeholder?: string }) {
  render(
    <I18nProvider locale="en">
      <StepperField
        label="Size"
        value={props.value}
        canStep
        unit={props.unit}
        tag={props.tag}
        placeholder={props.placeholder}
        onCommit={vi.fn()}
        onStep={vi.fn()}
      />
    </I18nProvider>,
  );
}

describe('the implicit-unit badge', () => {
  it('labels a bare value with the unit the engine reads it as', () => {
    drawStepper({ value: '10', unit: 'pt' });
    expect(screen.getByText('pt')).toBeTruthy();
  });

  it('stays silent when the value states its own unit', () => {
    // `12mm` is not pt, and the unit is already on screen — a `pt` badge here
    // would be a lie, not a hint.
    drawStepper({ value: '12mm', unit: 'pt' });
    expect(screen.queryByText('pt')).toBeNull();
  });

  it('stays silent on a relative unit', () => {
    drawStepper({ value: '50%', unit: 'pt' });
    expect(screen.queryByText('pt')).toBeNull();
  });

  it('stays silent on a unitless field (a ratio)', () => {
    drawStepper({ value: '1.4' });
    expect(screen.queryByText('pt')).toBeNull();
  });

  it('labels the PLACEHOLDER of an empty field, whose value is the unset one', () => {
    drawStepper({ value: '', unit: 'pt', placeholder: '0' });
    expect(screen.getByText('pt')).toBeTruthy();
  });

  it('says nothing about an empty field with no placeholder', () => {
    drawStepper({ value: '', unit: 'pt' });
    expect(screen.queryByText('pt')).toBeNull();
  });

  it('keeps the caller tag and adds the unit beside it', () => {
    drawStepper({ value: '40', unit: 'pt', tag: 'Auto' });
    expect(screen.getByText('pt · Auto')).toBeTruthy();
  });

  it('never joins the control\u2019s accessible name', () => {
    // The badge is decoration over a value the field already holds; folding it
    // into the name would make 「幅」 read 「幅pt」.
    drawStepper({ value: '10', unit: 'pt' });
    expect((screen.getByLabelText('Size') as HTMLInputElement).value).toBe('10');
  });

  it('labels a bare SeededField placeholder too', () => {
    drawSeeded({ authored: '', seed: '10', unit: 'pt' });
    expect(screen.getByText('pt')).toBeTruthy();
  });

  it('says nothing on a SeededField with neither a value nor a hint', () => {
    // Nothing on screen to attach a unit to — the badge would be labelling a
    // blank box.
    drawSeeded({ authored: '', unit: 'pt' });
    expect(screen.queryByText('pt')).toBeNull();
  });

  it('labels a bare TextField value and skips a unit-bearing one', () => {
    const onCommit = vi.fn<(value: string) => void>();
    const { unmount } = render(
      <I18nProvider locale="en">
        <TextField label="Top" value="25" unit="pt" onCommit={onCommit} />
      </I18nProvider>,
    );
    expect(screen.getByText('pt')).toBeTruthy();
    expect((screen.getByLabelText('Top') as HTMLInputElement).value).toBe('25');
    unmount();
    render(
      <I18nProvider locale="en">
        <TextField label="Top" value="1cm" unit="pt" onCommit={onCommit} />
      </I18nProvider>,
    );
    expect(screen.queryByText('pt')).toBeNull();
  });
});

describe('SelectField', () => {
  function drawSelect(value: string, optionLabel?: (option: string) => string) {
    const onCommit = vi.fn<(value: string) => void>();
    render(
      <I18nProvider locale="en">
        <SelectField
          label="Weight"
          value={value}
          options={['normal', 'bold']}
          noneLabel="(none)"
          optionLabel={optionLabel}
          onCommit={onCommit}
        />
      </I18nProvider>,
    );
    return { onCommit };
  }

  it('always offers the none option, so an authored key can be handed back', () => {
    drawSelect('');
    const values = Array.from(
      (screen.getByLabelText('Weight') as HTMLSelectElement).options,
      (o) => o.value,
    );
    expect(values).toEqual(['', 'normal', 'bold']);
  });

  it('shows the wire spelling when no optionLabel is given', () => {
    drawSelect('normal');
    const labels = Array.from(
      (screen.getByLabelText('Weight') as HTMLSelectElement).options,
      (o) => o.textContent,
    );
    expect(labels).toEqual(['(none)', 'normal', 'bold']);
  });

  it('displays localized option labels but commits the WIRE spelling', () => {
    const { onCommit } = drawSelect('normal', (option) => `<${option}>`);
    const labels = Array.from(
      (screen.getByLabelText('Weight') as HTMLSelectElement).options,
      (o) => o.textContent,
    );
    expect(labels).toEqual(['(none)', '<normal>', '<bold>']);
    fireEvent.change(screen.getByLabelText('Weight'), { target: { value: 'bold' } });
    expect(onCommit).toHaveBeenCalledWith('bold');
  });
});

describe('showsUnitHint', () => {
  const HINT = 'Type mm, cm, in, em or rem.';

  it('shows the hint on a bare value in a unit-bearing field', () => {
    expect(showsUnitHint('pt', '12', HINT)).toBe(true);
  });

  // Each of the three conditions rules out a REAL field in this panel, so
  // each gets its own case rather than one "returns false" catch-all.
  it('withholds it where the caller passed none — the border pen, whose key is a plain number', () => {
    expect(showsUnitHint('pt', '12', undefined)).toBe(false);
  });

  it('withholds it on a unitless field — a ratio like line height', () => {
    expect(showsUnitHint(undefined, '1.5', HINT)).toBe(false);
  });

  it.each([
    ['a value that spells its own unit', '12mm'],
    ['a percentage', '50%'],
    ['an em value', '0.4em'],
    ['an empty field with no placeholder', ''],
    ['garbage', 'auto'],
  ])('withholds it for %s — there is no invisible pt to explain', (_case, shown) => {
    expect(showsUnitHint('pt', shown, HINT)).toBe(false);
  });
});

describe('the unit hint in a rendered field', () => {
  function drawHinted(value: string, unitHint?: string) {
    return render(
      <I18nProvider locale="en">
        <StepperField
          label="X"
          value={value}
          canStep
          unit="pt"
          unitHint={unitHint}
          onCommit={vi.fn()}
          onStep={vi.fn()}
        />
      </I18nProvider>,
    );
  }

  it('rides the field, not the badge — the badge is pointer-events-none and cannot be hovered', () => {
    const { container } = drawHinted('12', 'Type mm, cm, in, em or rem.');
    const bubble = container.querySelector('[data-sj-tip]');
    expect(bubble?.textContent).toBe('Type mm, cm, in, em or rem.');
    // The hover target is the input's own wrapper.
    expect(container.querySelector('.group\\/tip')).not.toBeNull();
  });

  it('renders no bubble without a hint', () => {
    const { container } = drawHinted('12');
    expect(container.querySelector('[data-sj-tip]')).toBeNull();
  });

  it('renders no bubble on a value that states its own unit', () => {
    const { container } = drawHinted('12mm', 'Type mm, cm, in, em or rem.');
    expect(container.querySelector('[data-sj-tip]')).toBeNull();
  });

  it('carries it on a plain TextField too (the column width)', () => {
    const { container } = render(
      <I18nProvider locale="en">
        <TextField
          label="Column width"
          value="120"
          unit="pt"
          unitHint="Type mm, cm, in, em or rem."
          onCommit={vi.fn()}
        />
      </I18nProvider>,
    );
    expect(container.querySelector('[data-sj-tip]')?.textContent).toBe(
      'Type mm, cm, in, em or rem.',
    );
  });

  it('carries it on a SeededField too (the document default font size)', () => {
    const { container } = render(
      <I18nProvider locale="en">
        <SeededField
          label="Font size"
          authored=""
          seed="10"
          unit="pt"
          unitHint="Type mm, cm, in, em or rem."
          onCommit={vi.fn()}
        />
      </I18nProvider>,
    );
    // The seed sits in the PLACEHOLDER, so the unit belongs to that text.
    expect(container.querySelector('[data-sj-tip]')?.textContent).toBe(
      'Type mm, cm, in, em or rem.',
    );
  });
});
