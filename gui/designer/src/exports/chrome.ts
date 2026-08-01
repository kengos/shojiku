// Public surface of the CHROME: the menubar + titlebar and their host-injected
// menu-action seam, the i18n injection point, the theme token seam, the
// keyboard-shortcut vocabulary and the reusable UI primitives.
// Re-exported wholesale by the package index.

export { type Catalog, DEFAULT_CATALOG, type LanguageCatalog } from '../i18n/catalog';
// i18n host-injection point (BCP 47 locale + per-language message catalog).
export { type I18n, I18nProvider, type I18nProviderProps, useI18n } from '../i18n/context';
export { formatMessage, type MessageArgs } from '../i18n/format';
export { ALIASES, LOCALES, type LocaleInfo, localeInfo } from '../i18n/locales';
export { renderDiagnostic, translate } from '../i18n/render';
export { resolveChain } from '../i18n/resolve';
// The Google-Docs-style menubar chrome (title bar + menubar) and its pure
// model — the host-injected menu-action seam. Menu items dispatch existing
// ops/host callbacks only (AI parity); host-supplied entries are validated
// untrusted input.
export { Menubar, type MenubarProps } from '../menubar/Menubar';
export {
  buildMenubar,
  type HostMenuEntry,
  MAX_HOST_MENU_ENTRIES,
  MAX_MENU_ID_LEN,
  MAX_MENU_LABEL_LEN,
  type MenubarWiring,
  type MenuColumn,
  type MenuItem,
  type RawHostMenuEntry,
  validateHostEntries,
} from '../menubar/model';
export { type SaveStatus, Titlebar, type TitlebarProps } from '../menubar/Titlebar';
export { type KeyChord, type ShortcutAction, shortcutAction } from '../shortcuts';
export { cssVars, resolveTheme, safeTokenValue } from '../theme/resolve';
// Theme seam: tokens as data + pure resolution. The chrome stylesheet ships
// as the package's `./styles.css` export (a host imports it once); the
// `--sj-*` custom-property names are the public styling contract.
export {
  type ColorScheme,
  DARK_THEME,
  LIGHT_THEME,
  type ThemeOverride,
  type ThemeTokens,
  TOKEN_NAMES,
  TOKEN_VARS,
  type TokenName,
} from '../theme/tokens';
// Reusable chrome primitives (the Tailwind-styled UI layer, Headless UI for
// behavior-heavy ones). Rendered in isolation by the dev-only catalog; the
// app's Tailwind build scans this package's src for their utilities.
export {
  Button,
  type ButtonProps,
  type ButtonVariant,
  IconButton,
  type IconButtonProps,
} from '../ui/Button';
export {
  IconChevronDown,
  IconClose,
  IconMinus,
  IconPlus,
  type IconProps,
  IconRedo,
  IconSearch,
  IconTrash,
  IconUndo,
} from '../ui/icons';
export { Menu, type MenuEntry, type MenuGroup, type MenuProps } from '../ui/Menu';
export { Modal, type ModalProps } from '../ui/Modal';
export { Offcanvas, type OffcanvasProps } from '../ui/Offcanvas';
export { ResizeHandle, type ResizeHandleProps } from '../ui/ResizeHandle';
export { Select, type SelectOption, type SelectProps } from '../ui/Select';
export { Switch, type SwitchProps } from '../ui/Switch';
