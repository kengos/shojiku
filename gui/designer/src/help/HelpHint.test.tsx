import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HelpHint } from './HelpHint';

describe('HelpHint', () => {
  it('exposes the `?` trigger by its accessible name and starts closed', () => {
    render(<HelpHint label="What is this?" body="An explanation." />);
    expect(screen.getByRole('button', { name: 'What is this?' })).toBeTruthy();
    expect(screen.queryByText('An explanation.')).toBeNull();
  });

  it('carries its tooltip in a decorative bubble, and still opens on click', () => {
    const { container } = render(<HelpHint label="What is this?" body="An explanation." />);
    const trigger = screen.getByRole('button', { name: 'What is this?' });
    expect(trigger.getAttribute('title')).toBeNull();
    expect(trigger.getAttribute('aria-label')).toBe('What is this?');
    const tip = container.querySelector('[data-sj-tip]');
    expect(tip?.textContent).toBe('What is this?');
    expect(tip?.getAttribute('aria-hidden')).toBe('true');
    // The bubble shares the Popover root, so it must not swallow the click.
    fireEvent.click(trigger);
    expect(screen.getByText('An explanation.')).toBeTruthy();
  });

  it('opens the popover with the title and body on click', () => {
    render(<HelpHint label="Help" title="Data field" body="Pulls a value from your data." />);
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    expect(screen.getByText('Data field')).toBeTruthy();
    expect(screen.getByText('Pulls a value from your data.')).toBeTruthy();
  });

  it('omits the title line when no title is given', () => {
    render(<HelpHint label="Help" body="Just a body." />);
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    expect(screen.getByText('Just a body.')).toBeTruthy();
    expect(screen.queryByText('Data field')).toBeNull();
  });

  it('shows the 「詳しく見る」 link and fires onMore', () => {
    const onMore = vi.fn();
    render(<HelpHint label="Help" body="Body." onMore={onMore} moreLabel="Learn more" />);
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    fireEvent.click(screen.getByRole('button', { name: 'Learn more' }));
    expect(onMore).toHaveBeenCalledOnce();
  });

  it('omits the more link without onMore', () => {
    render(<HelpHint label="Help" body="Body." moreLabel="Learn more" />);
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    expect(screen.queryByRole('button', { name: 'Learn more' })).toBeNull();
  });

  it('renders body text inertly, never as markup', () => {
    render(<HelpHint label="Help" body="<img src=x onerror=alert(1)>" />);
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
  });
});
