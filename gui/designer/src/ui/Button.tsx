// Button / IconButton primitives — styled with plain Tailwind utilities (the
// app's Tailwind build scans this package's src). Colors resolve to the
// `--sj-*` tokens via the `@theme inline` bridge; spacing/shape use Tailwind's
// scale + the `rounded-md` token. `data-variant` is the stable hook for tests
// and restyling (never assert the utility strings). Both render a plain
// `<button type="button">`; the label is React text (auto-escaped).

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { TipBubble } from './TipBubble';

export type ButtonVariant = 'default' | 'primary' | 'ghost';

type NativeButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'>;

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-md border cursor-pointer transition-colors disabled:opacity-45 disabled:cursor-default';

const VARIANT: Record<ButtonVariant, string> = {
  default: 'bg-surface text-text border-border hover:border-muted',
  primary: 'bg-accent text-on-accent border-accent font-semibold',
  ghost: 'bg-transparent text-text border-transparent hover:bg-chrome',
};

function cx(...parts: (string | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export interface ButtonProps extends NativeButtonProps {
  readonly variant?: ButtonVariant;
  readonly children: ReactNode;
}

export function Button({ variant = 'default', className, children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      data-variant={variant}
      className={cx(BASE, 'px-4 py-2', VARIANT[variant], className)}
      {...rest}
    >
      {children}
    </button>
  );
}

export interface IconButtonProps extends NativeButtonProps {
  /** The accessible name (an icon button has no visible text). */
  readonly label: string;
  readonly variant?: ButtonVariant;
  readonly children: ReactNode;
}

/** An icon-only button. `label` is both the accessible name (`aria-label`) and
 * the hover tooltip — carried by the instant `TipBubble`, never native `title`
 * (whose OS-controlled ~1s delay reads as "no tooltip"). The bubble needs a
 * positioned `group/tip` ancestor, so the button ships inside one; `className`
 * still lands on the BUTTON, so every call site keeps its styling target. */
export function IconButton({
  label,
  variant = 'default',
  className,
  children,
  ...rest
}: IconButtonProps) {
  return (
    <span className="group/tip relative inline-flex">
      <button
        type="button"
        aria-label={label}
        data-variant={variant}
        className={cx(BASE, 'p-2 min-w-9 min-h-9', VARIANT[variant], className)}
        {...rest}
      >
        {children}
      </button>
      <TipBubble text={label} />
    </span>
  );
}
