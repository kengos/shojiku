// Theme resolution: pure functions from (scheme, host override) to the token
// set the chrome renders with, and from tokens to the CSS custom properties
// the stylesheet reads. React-free — hosts outside this component (the
// standalone app's shell chrome) resolve through the same functions.

import {
  type ColorScheme,
  DARK_THEME,
  LIGHT_THEME,
  type ThemeOverride,
  type ThemeTokens,
  TOKEN_NAMES,
  TOKEN_VARS,
} from './tokens';

// An override value becomes a live CSS custom property, so it is guarded even
// though a host's theme config is developer-supplied (defense in depth: a
// value must never smuggle a URL fetch or extra declarations into the
// chrome's CSS). The allowlist covers colors, lengths, and font stacks;
// `url(` is rejected outright even though `(` is allowed for `rgba(...)`.
const MAX_VALUE_LENGTH = 256;
const SAFE_VALUE = /^[A-Za-z0-9 _\-.,#%()'"]+$/;

/** Whether a host-supplied token value is safe to apply. */
export function safeTokenValue(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_VALUE_LENGTH &&
    SAFE_VALUE.test(value) &&
    !value.toLowerCase().includes('url(')
  );
}

/** The scheme's built-in token set with the host override merged over it.
 * Only known token names are consulted (a forged extra key never reaches the
 * output), and an unsafe value falls back to the built-in one. */
export function resolveTheme(scheme: ColorScheme, override?: ThemeOverride): ThemeTokens {
  const base = scheme === 'dark' ? DARK_THEME : LIGHT_THEME;
  const out: Record<string, string> = { ...base };
  if (override !== undefined) {
    for (const name of TOKEN_NAMES) {
      const value = override[name];
      if (value !== undefined && safeTokenValue(value)) {
        out[name] = value;
      }
    }
  }
  return out as ThemeTokens;
}

/** Tokens as the `--sj-*` custom-property map, ready to spread onto a root
 * element's inline style (React applies each entry via `setProperty`). */
export function cssVars(tokens: ThemeTokens): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of TOKEN_NAMES) {
    out[TOKEN_VARS[name]] = tokens[name];
  }
  return out;
}
