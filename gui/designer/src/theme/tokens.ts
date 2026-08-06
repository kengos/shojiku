// Design tokens: the Designer's chrome theme as plain data. A theme is one
// complete token set; the default look is the warm-paper palette (sumi-ink text on a
// washi-toned ground with a vermilion accent), with a dark CHROME variant — the canvas
// paper itself is engine-rendered pixels and stays white in both schemes.
// Presentation lives in `styles.css`, which reads these values only through
// the CSS custom properties `cssVars` emits; hosts restyle by swapping token
// values (the `Designer` `theme` prop or the documented `--sj-*` contract),
// never by a theming engine.

/** Which built-in token set the chrome uses. The component never sniffs the
 * OS preference itself — a host resolves `auto` and passes the result. */
export type ColorScheme = 'light' | 'dark';

// Scheme-independent tokens (type ramp, spacing, shape). Both schemes carry
// them so a theme stays ONE complete set a host can swap wholesale.
const SHARED = {
  fontFamily: "'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', system-ui, sans-serif",
  // Root font-size only (app.css `html`); it happens to equal Tailwind's stock
  // `text-base` (16px). The type ramp itself rides Tailwind's stock scale — no
  // per-step overrides live here (see gui/STYLE.md).
  fontSize: '16px',
  space1: '4px',
  space2: '8px',
  space3: '12px',
  space4: '16px',
  space5: '24px',
  // Softer, framework-like corner.
  radius: '6px',
} as const;

/** The default (light) token set. */
export const LIGHT_THEME = {
  ...SHARED,
  bg: '#f7f5f1',
  chrome: '#fdfcfa',
  surface: '#ffffff',
  border: '#e4dfd5',
  text: '#2b2724',
  muted: '#6f675a',
  accent: '#c2402a',
  onAccent: '#ffffff',
  focus: '#c2402a',
  canvas: '#eae6df',
  paperShadow: 'rgba(43, 39, 36, 0.25)',
  warnBg: '#f7ecd3',
  warnText: '#8a6116',
  errorBg: '#f9e4e2',
  errorText: '#8f1d26',
  // Save/export diff review: sage-green added / terracotta removed,
  // tuned to the warm-paper ground (the error/warn pairs are the only other
  // semantic colours and neither is a green). AA-pinned in tokens.test.ts.
  diffAddBg: '#e7efdc',
  diffAddText: '#3f6021',
  diffDelBg: '#f6e3de',
  diffDelText: '#8a3a2a',
} as const;

/** A theme token name — the key set is fixed by the default theme. */
export type TokenName = keyof typeof LIGHT_THEME;

/** One complete theme: every token present. */
export type ThemeTokens = Readonly<Record<TokenName, string>>;

/** A host's partial restyle, merged over the scheme's built-in set. */
export type ThemeOverride = Partial<Record<TokenName, string>>;

/** The built-in dark-chrome token set (typed against the light set, so the
 * two key sets cannot drift apart at compile time). */
export const DARK_THEME: ThemeTokens = {
  ...SHARED,
  bg: '#201e1b',
  chrome: '#262421',
  surface: '#2e2b27',
  border: '#3b372f',
  text: '#ede9e2',
  muted: '#a59d8f',
  accent: '#e0664a',
  onAccent: '#29130d',
  focus: '#e0664a',
  canvas: '#161513',
  paperShadow: 'rgba(0, 0, 0, 0.5)',
  warnBg: '#3d3521',
  warnText: '#e0c375',
  errorBg: '#42221f',
  errorText: '#f2a69b',
  diffAddBg: '#2b3620',
  diffAddText: '#aecb8f',
  diffDelBg: '#3d2723',
  diffDelText: '#e2a89b',
};

/** Token name → CSS custom property. The property names are the PUBLIC
 * styling contract (stylesheets and host CSS address tokens only through
 * them), so renames are breaking — a contract test pins the exact list. */
export const TOKEN_VARS: Readonly<Record<TokenName, string>> = {
  bg: '--sj-bg',
  chrome: '--sj-chrome',
  surface: '--sj-surface',
  border: '--sj-border',
  text: '--sj-text',
  muted: '--sj-muted',
  accent: '--sj-accent',
  onAccent: '--sj-on-accent',
  focus: '--sj-focus',
  canvas: '--sj-canvas',
  paperShadow: '--sj-paper-shadow',
  warnBg: '--sj-warn-bg',
  warnText: '--sj-warn-text',
  errorBg: '--sj-error-bg',
  errorText: '--sj-error-text',
  diffAddBg: '--sj-diff-add-bg',
  diffAddText: '--sj-diff-add-text',
  diffDelBg: '--sj-diff-del-bg',
  diffDelText: '--sj-diff-del-text',
  fontFamily: '--sj-font-family',
  fontSize: '--sj-font-size',
  space1: '--sj-space-1',
  space2: '--sj-space-2',
  space3: '--sj-space-3',
  space4: '--sj-space-4',
  space5: '--sj-space-5',
  radius: '--sj-radius',
};

/** Every token name, in the stable TOKEN_VARS declaration order. */
export const TOKEN_NAMES = Object.keys(TOKEN_VARS) as readonly TokenName[];
