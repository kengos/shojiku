import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { type SaveStatus, Titlebar } from './Titlebar';

function renderEn(node: ReactNode) {
  return render(<I18nProvider locale="en">{node}</I18nProvider>);
}

describe('Titlebar', () => {
  it('shows the document name when given', () => {
    renderEn(<Titlebar documentName="Invoice" />);
    expect(screen.getByText('Invoice')).toBeTruthy();
  });

  it('renders nothing when both the name and the save status are absent', () => {
    // A host that carries the document name in its own chrome (the standalone
    // app's header) passes neither prop — the bar must not leave an empty
    // bordered row above the menubar.
    const { container } = renderEn(<Titlebar />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the saving indicator', () => {
    renderEn(<Titlebar documentName="Invoice" saveStatus="saving" />);
    expect(screen.getByText('Saving…')).toBeTruthy();
  });

  it('shows the saved indicator', () => {
    renderEn(<Titlebar documentName="Invoice" saveStatus="saved" />);
    expect(screen.getByText('Saved')).toBeTruthy();
  });

  it('omits the save indicator when absent', () => {
    const { container } = renderEn(<Titlebar documentName="Invoice" />);
    expect(container.querySelector('output')).toBeNull();
  });

  it('accepts the exported SaveStatus type', () => {
    const s: SaveStatus = 'saved';
    renderEn(<Titlebar saveStatus={s} />);
    expect(screen.getByText('Saved')).toBeTruthy();
  });
});
