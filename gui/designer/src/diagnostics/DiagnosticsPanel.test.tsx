import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Diagnostic } from '../engine/types';
import { I18nProvider } from '../i18n/context';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import type { ReadNode } from './fixModel';

function draw(node: ReactElement, locale: 'en' | 'ja' = 'ja') {
  return render(<I18nProvider locale={locale}>{node}</I18nProvider>);
}

/** A read that finds nothing, so no diagnostic yields a fix (the existing rows). */
const noFix: ReadNode = () => undefined;

const withPath: Diagnostic = {
  severity: 'warning',
  code: 'undefined_style_name',
  category: 'style',
  message: 'styleName `heading` is not defined in the `styles` registry',
  args: { name: 'heading' },
  path: 'sections.body.items[0]',
  origin: 'core/src/validate.rs:42',
};

const pathless: Diagnostic = {
  severity: 'error',
  code: 'image_source_missing',
  category: 'data',
  message: 'image items need `src` or `data`',
  args: {},
};

describe('DiagnosticsPanel', () => {
  it('shows the empty state when there are no diagnostics', () => {
    draw(
      <DiagnosticsPanel diagnostics={[]} onSelect={vi.fn()} read={noFix} onApplyFix={vi.fn()} />,
    );
    expect(screen.getByText('問題はありません。')).toBeDefined();
  });

  it('renders localized message + severity from code and args', () => {
    draw(
      <DiagnosticsPanel
        diagnostics={[withPath]}
        onSelect={vi.fn()}
        read={noFix}
        onApplyFix={vi.fn()}
      />,
    );
    expect(
      screen.getByText('styleName `heading` は `styles` レジストリに定義されていません'),
    ).toBeDefined();
    expect(screen.getByText('警告')).toBeDefined();
  });

  it('never renders the engine origin', () => {
    const { container } = draw(
      <DiagnosticsPanel
        diagnostics={[withPath]}
        onSelect={vi.fn()}
        read={noFix}
        onApplyFix={vi.fn()}
      />,
    );
    expect(container.textContent).not.toContain('validate.rs');
  });

  it('selects the diagnostic path when a path-carrying row is clicked', () => {
    const onSelect = vi.fn();
    draw(
      <DiagnosticsPanel
        diagnostics={[withPath]}
        onSelect={onSelect}
        read={noFix}
        onApplyFix={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith('sections.body.items[0]');
  });

  it('renders a pathless diagnostic as an inert row (no button)', () => {
    draw(
      <DiagnosticsPanel
        diagnostics={[pathless]}
        onSelect={vi.fn()}
        read={noFix}
        onApplyFix={vi.fn()}
      />,
    );
    expect(screen.getByText('image 項目には `src` か `data` が必要です')).toBeDefined();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders an HTML-looking arg value as inert text, never as markup', () => {
    const hostile: Diagnostic = {
      severity: 'warning',
      code: 'undefined_style_name',
      category: 'style',
      message: 'x',
      args: { name: '<img src=x onerror="alert(1)">' },
    };
    const { container } = draw(
      <DiagnosticsPanel
        diagnostics={[hostile]}
        onSelect={vi.fn()}
        read={noFix}
        onApplyFix={vi.fn()}
      />,
    );
    // The value is interpolated by formatMessage and rendered by React as text —
    // it appears verbatim and injects no element.
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(container.querySelector('img')).toBeNull();
  });

  describe('quick-fix button', () => {
    const fixable: Diagnostic = {
      severity: 'warning',
      code: 'layout_key_on_leaf',
      category: 'layout',
      message: 'box layout keys ignored here',
      args: {},
      path: 'sections.body.items[0]',
    };
    // A read that resolves the fixable node to one carrying a removable box key.
    const readGap: ReadNode = () => ({ box: { gap: 4 } });

    it('renders a 直す button for a fixable diagnostic and applies the ops on click', () => {
      const onApplyFix = vi.fn();
      draw(
        <DiagnosticsPanel
          diagnostics={[fixable]}
          onSelect={vi.fn()}
          read={readGap}
          onApplyFix={onApplyFix}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: '直す' }));
      expect(onApplyFix).toHaveBeenCalledWith([
        { op: 'removeKey', path: 'sections.body.items[0]', keys: ['box', 'gap'] },
      ]);
    });

    it('gives the 直す button an instant-tooltip label (never a native title)', () => {
      const { container } = draw(
        <DiagnosticsPanel
          diagnostics={[fixable]}
          onSelect={vi.fn()}
          read={readGap}
          onApplyFix={vi.fn()}
        />,
      );
      // The TipBubble carries the explanatory label (decorative, aria-hidden);
      // the native `title` attribute is banned by the chrome convention.
      expect(screen.getByText(/元に戻せます/)).toBeDefined();
      expect(container.querySelector('[title]')).toBeNull();
    });

    it('shows the 直す button on a pathless-but-fixable diagnostic (orientation)', () => {
      const orientation: Diagnostic = {
        severity: 'warning',
        code: 'orientation_ignored',
        category: 'layout',
        message: 'orientation ignored',
        args: {},
      };
      draw(
        <DiagnosticsPanel
          diagnostics={[orientation]}
          onSelect={vi.fn()}
          read={() => ({ orientation: 'landscape' })}
          onApplyFix={vi.fn()}
        />,
      );
      expect(screen.getByRole('button', { name: '直す' })).toBeDefined();
    });

    it('renders no 直す button when the diagnostic has no mechanical fix', () => {
      draw(
        <DiagnosticsPanel
          diagnostics={[withPath]}
          onSelect={vi.fn()}
          read={readGap}
          onApplyFix={vi.fn()}
        />,
      );
      expect(screen.queryByRole('button', { name: '直す' })).toBeNull();
    });
  });
});
