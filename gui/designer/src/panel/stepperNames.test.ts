// @vitest-environment node
//
// The accessible name of a stepper's ▲▼ is built from the field's LABEL
// (`stepper.increment` takes a `{field}` arg). That makes the label part of an
// a11y surface rather than only a visual one, and the rule the surface needs is
// that the arg is always a CATALOG string: a document value routed into it
// would read the author's data aloud on a button that does not contain it, and
// would drift per document.
//
// A component test cannot pin this — it can only pin the call sites it happens
// to render. This walks the package source, the way the chrome- and
// action-convention gates do, so the NEXT stepper cannot quietly introduce one.

import { describe, expect, it } from 'vitest';
import { codeLines, DESIGNER_SRC, GUI_ROOT, sourceFiles } from '../testkit/sourceWalk';

/** Every `label={…}` line belonging to a `<StepperField` element, as
 * `path:line` → the expression. The element spans lines, so the scan runs
 * forward from each opening tag to its `/>`. */
function stepperLabels(): { where: string; expression: string }[] {
  const found: { where: string; expression: string }[] = [];
  for (const file of sourceFiles(DESIGNER_SRC)) {
    const lines = codeLines(file);
    lines.forEach((line, index) => {
      if (!line.includes('<StepperField')) {
        return;
      }
      for (let i = index; i < lines.length && !/^\s*\/>/.test(lines[i] ?? ''); i += 1) {
        const match = /^\s*label=\{(.+)\}$/.exec(lines[i] ?? '');
        if (match?.[1] !== undefined) {
          found.push({ where: `${file.slice(GUI_ROOT.length)}:${i + 1}`, expression: match[1] });
        }
      }
    });
  }
  return found;
}

describe('a stepper call-site sweep', () => {
  it('finds every stepper call site (the guard is never silently empty)', () => {
    // The count is a floor, not an assertion about the exact set: a new stepper
    // must be CHECKED by the rule below, not counted here.
    expect(stepperLabels().length).toBeGreaterThanOrEqual(10);
  });
});

/** Two shapes are catalog text: a `t(…)` lookup, and a bare parameter the
 * component was HANDED — `BoxAxisField`'s `label` and `CustomSizeFields`'
 * `dimension(field, label)`, both of which their own call sites fill with
 * `t(…)`. Anything else — a property read, a template literal, a concatenation
 * — is reaching for a value the component did not get from the catalog. */
const CATALOG_TEXT = /^(t\(.*\)|[a-z][A-Za-z0-9]*)$/;

describe('a stepper label is catalog text', () => {
  it('builds every stepper label from the message catalog, never from the document', () => {
    // A `label={view.text}` or `` label={`${item.id} width`} `` would route
    // document content into an accessible name; nothing else in the panel does
    // that, and a name that changes with the data is a name AT sees change
    // under it.
    const offenders = stepperLabels().filter(
      ({ expression }) => !CATALOG_TEXT.test(expression.trim()),
    );
    expect(offenders).toEqual([]);
  });

  it('rejects a document-sourced label (the positive control for the matcher)', () => {
    // The sweep asserts an EMPTY list, so a matcher that accepted everything
    // would pass. Pin that it rejects the shapes it polices, and accepts the
    // three that are live in the tree.
    expect(CATALOG_TEXT.test('view.box.w')).toBe(false);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the placeholder is the SHAPE under test — this is a label expression quoted as data, not a string that meant to interpolate.
    expect(CATALOG_TEXT.test('`${item.id} width`')).toBe(false);
    expect(CATALOG_TEXT.test("item.label ?? 'Width'")).toBe(false);
    expect(CATALOG_TEXT.test("t('panel.box.w')")).toBe(true);
    expect(CATALOG_TEXT.test('t(spec.labelKey)')).toBe(true);
    expect(CATALOG_TEXT.test('label')).toBe(true);
  });
});
