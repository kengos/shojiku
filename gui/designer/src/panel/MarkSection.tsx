// The content tab for a form mark (`ellipse` / `checkbox`): what decides
// whether it DRAWS. The engine calls that content in so many words — "a mark's
// *presence* is content, while its geometry stays template-fixed" — which is
// also the whole point of the type: an unmatched mark still occupies its box,
// so one template serves the blank form and the filled one without a point of
// layout shift.
//
// A checkbox has three states and an ellipse two, and they are one control
// rather than two: the difference is only that a checkbox's static form can be
// ticked, where an ellipse's can only be "always". The bound arm is
// `MarkBindingFields`, shared with a text item's circle (`TextMarkSection`):
// both are one `MarkBinding` on the wire.

import { useI18n } from '../i18n/context';
import type { ChipContext } from '../text/chipContext';
import { INPUT } from '../ui/chrome';
import { Field } from './fields';
import type { ItemPanelProps } from './itemPanelProps';
import { MarkBindingFields } from './MarkBindingFields';
import { readMark } from './markModel';
import { bindMarkOps, setCheckedOps, unbindMarkOps } from './markOps';
import { HelpfulHeading, scopePickerProps } from './panelHelpers';

/** The three presence states, as one closed vocabulary. `off` is an
 * ellipse's impossible state (it has no `checked:`), so the ellipse simply
 * offers two rows out of the same set. */
type Presence = 'off' | 'on' | 'bound';

export interface MarkSectionProps {
  readonly props: ItemPanelProps;
  readonly chips: ChipContext;
}

export function MarkSection({ props, chips }: MarkSectionProps) {
  const { t } = useI18n();
  const { controller, path, view, onOpenGlossary } = props;
  const options = chips.options;
  // The same scope wiring the item's own `data.key` picker takes: at document
  // scope there is no second section (element and document resolve identically
  // there), and inside a row scope the top-level rows appear only when the
  // engine can carry the `scope:` that makes one of them resolve.
  const { documentOptions } = scopePickerProps(props, chips);
  const row = readMark(controller.read, path);
  const isCheckbox = view.type === 'checkbox';
  // `checked` is read only for the type that HAS it. An `ellipse` offers two
  // rows, so a stray `checked: true` on one (a parse error the engine rejects,
  // but the panel is where you come to fix one) would otherwise drive the
  // select to a value it has no option for and show nothing selected — the
  // char_grid rule, which refuses to echo back an unknown value as selected.
  const ticked = isCheckbox && row.checked;
  const presence: Presence = row.mode === 'bound' ? 'bound' : ticked ? 'on' : 'off';

  // Every switch is ONE `applyAll` — one undo step — and an unchanged pick
  // produces an EMPTY list, so re-picking the current state authors nothing.
  const setPresence = (next: Presence) => {
    if (next === presence) {
      return;
    }
    if (next === 'bound') {
      controller.applyAll(bindMarkOps(path, row.hasChecked));
      return;
    }
    controller.applyAll(
      row.mode === 'bound'
        ? unbindMarkOps(path, next === 'on', row.hasChecked)
        : setCheckedOps(path, next === 'on', row.hasChecked),
    );
  };

  return (
    <section>
      <HelpfulHeading
        title={t('panel.section.content')}
        topic="content"
        onOpenGlossary={onOpenGlossary}
      />
      <Field label={t(isCheckbox ? 'panel.mark.checkboxState' : 'panel.mark.ellipseState')}>
        <select
          className={INPUT}
          value={presence}
          onChange={(event) => setPresence(event.currentTarget.value as Presence)}
        >
          <option value="off">
            {t(isCheckbox ? 'panel.mark.state.blank' : 'panel.mark.state.always')}
          </option>
          {/* An ellipse has no `checked:`, so its static form has one state. */}
          {isCheckbox ? <option value="on">{t('panel.mark.state.ticked')}</option> : null}
          <option value="bound">{t('panel.mark.state.bound')}</option>
        </select>
      </Field>
      {row.conflict && isCheckbox ? (
        // The wire calls these mutually exclusive and the engine warns with
        // `data:` winning. Saying so beats showing one of them and letting the
        // other sit in the file invisibly.
        <p className="m-0 mb-2 text-muted text-xs">{t('panel.mark.conflict')}</p>
      ) : null}
      {row.mode === 'bound' ? (
        <MarkBindingFields
          controller={controller}
          markPath={path}
          row={row}
          options={options}
          documentOptions={documentOptions}
          // The checkbox's frame ALWAYS draws — the engine calls it chrome —
          // so what a binding decides there is the TICK, not the drawing.
          // One string for both types said "draws when…" over a control that
          // does nothing of the sort.
          valueLabel={t(isCheckbox ? 'panel.mark.tickValue' : 'panel.mark.value')}
        />
      ) : null}
    </section>
  );
}
