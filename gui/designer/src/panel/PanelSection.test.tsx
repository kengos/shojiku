// One collapsible panel section, and the store that remembers which ones are
// open: the toggle's ARIA state, the summary that shows only while closed, the
// body that is not rendered while closed, the `?` as a SIBLING of the toggle,
// and the open state outliving the section itself under a provider.

import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { PanelSection } from './PanelSection';
import { type SectionId, SectionOpenProvider } from './sectionOpenState';

function Section({
  id = 'table.rows',
  defaultOpen,
  help,
}: {
  readonly id?: SectionId;
  readonly defaultOpen?: boolean;
  readonly help?: string;
}) {
  return (
    <PanelSection
      id={id}
      title={`Title ${id}`}
      summary={`Summary ${id}`}
      help={help}
      defaultOpen={defaultOpen}
    >
      <p>Body {id}</p>
    </PanelSection>
  );
}

function draw(node: ReactNode) {
  return render(<I18nProvider locale="en">{node}</I18nProvider>);
}

function toggle(id: SectionId = 'table.rows'): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`^Title ${id}`) });
}

describe('PanelSection', () => {
  it('starts closed: the summary shows, the body is not rendered', () => {
    draw(<Section />);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(toggle().getAttribute('aria-controls')).toBeNull();
    expect(screen.getByText('Summary table.rows')).toBeTruthy();
    expect(screen.queryByText('Body table.rows')).toBeNull();
  });

  it('opens on click: the body replaces the summary and the toggle controls it', () => {
    draw(<Section />);
    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    const body = screen.getByText('Body table.rows').parentElement as HTMLElement;
    expect(toggle().getAttribute('aria-controls')).toBe(body.id);
    expect(screen.queryByText('Summary table.rows')).toBeNull();
    fireEvent.click(toggle());
    expect(screen.queryByText('Body table.rows')).toBeNull();
  });

  it('starts open when it is the first section of its tab', () => {
    draw(<Section defaultOpen />);
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Body table.rows')).toBeTruthy();
  });

  it('shows no summary line for an empty summary', () => {
    draw(
      <PanelSection id="table.style" title="Plain" summary="">
        <p>x</p>
      </PanelSection>,
    );
    expect(screen.getByRole('button', { name: 'Plain' })).toBeTruthy();
  });

  it('names the toggle by its title alone and describes it with the summary', () => {
    // The summary always resolves and can carry document text, so it is the
    // DESCRIPTION channel, never part of the name.
    draw(<Section />);
    expect(screen.getByRole('button', { name: 'Title table.rows' })).toBe(toggle());
    const describedBy = toggle().getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(describedBy)?.textContent).toBe('Summary table.rows');
    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-describedby')).toBeNull();
  });

  it('wraps the toggle in a heading, the accordion pattern', () => {
    draw(<Section />);
    expect(toggle().closest('h3')).not.toBeNull();
  });

  it('puts the `?` BESIDE the toggle, never inside it', () => {
    // A button nested in a button is invalid markup a screen reader flattens.
    draw(<Section help="What rows do." />);
    const help = screen.getByRole('button', { name: 'About Title table.rows' });
    expect(toggle().contains(help)).toBe(false);
    expect(help.closest('h3')).toBeNull();
  });

  it('carries no `?` without help text', () => {
    draw(<Section />);
    expect(screen.queryByRole('button', { name: /^About/ })).toBeNull();
  });

  it('bounds a long summary to two lines rather than widening the panel', () => {
    draw(
      <PanelSection id="table.groups" title="Groups" summary={'x'.repeat(500)}>
        <p>x</p>
      </PanelSection>,
    );
    expect(screen.getByText('x'.repeat(500)).className).toContain('line-clamp-2');
  });

  it('renders a document string in the summary as text, never markup', () => {
    draw(
      <PanelSection id="table.groups" title="Groups" summary="<img src=x onerror=alert(1)>">
        <p>x</p>
      </PanelSection>,
    );
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
  });
});

describe('sectionOpenState', () => {
  it('remembers a section the reader opened across its unmount and remount', () => {
    // The tab bodies unmount on a tab switch; the provider does not.
    const { rerender } = draw(
      <SectionOpenProvider>
        <Section />
      </SectionOpenProvider>,
    );
    fireEvent.click(toggle());
    rerender(
      <I18nProvider locale="en">
        <SectionOpenProvider>{null}</SectionOpenProvider>
      </I18nProvider>,
    );
    expect(screen.queryByRole('button')).toBeNull();
    rerender(
      <I18nProvider locale="en">
        <SectionOpenProvider>
          <Section />
        </SectionOpenProvider>
      </I18nProvider>,
    );
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
  });

  it('remembers a first section the reader CLOSED, over its open default', () => {
    const tree = (node: ReactNode) => (
      <I18nProvider locale="en">
        <SectionOpenProvider>{node}</SectionOpenProvider>
      </I18nProvider>
    );
    const { rerender } = render(tree(<Section id="table.columns" defaultOpen />));
    fireEvent.click(toggle('table.columns'));
    rerender(tree(null));
    rerender(tree(<Section id="table.columns" defaultOpen />));
    expect(toggle('table.columns').getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps each section its own', () => {
    draw(
      <SectionOpenProvider>
        <Section id="table.rows" />
        <Section id="table.empty" />
      </SectionOpenProvider>,
    );
    fireEvent.click(toggle('table.rows'));
    expect(toggle('table.rows').getAttribute('aria-expanded')).toBe('true');
    expect(toggle('table.empty').getAttribute('aria-expanded')).toBe('false');
  });

  it('falls back to state of its own with no provider above it', () => {
    const { unmount } = draw(<Section />);
    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    unmount();
    draw(<Section />);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });
});
