import { describe, expect, it } from 'vitest';
import {
  buildUsage,
  COPILOT_INSTRUCTIONS,
  cssVars,
  DARK_THEME,
  DEFAULT_CATALOG,
  DESIGNER_VERSION,
  Designer,
  DiagnosticsPanel,
  Editor,
  FieldPalette,
  formatMessage,
  HOOK_EVENTS,
  HookRegistry,
  I18nProvider,
  LIGHT_THEME,
  LOCALES,
  PropertyPanel,
  readDefinitionsView,
  renderDiagnostic,
  resolveChain,
  resolveTheme,
  ShojikuGui,
  translate,
  useEditor,
  useI18n,
} from './index';

describe('designer shell', () => {
  it('re-exports the core Editor', () => {
    expect(typeof Editor.create).toBe('function');
  });

  it('exposes a version marker', () => {
    expect(DESIGNER_VERSION).toBe('0.0.0');
  });

  it('exports the hook-registry surface', () => {
    expect(ShojikuGui).toBeInstanceOf(HookRegistry);
    expect(HOOK_EVENTS.get('init:presets')?.kind).toBe('notification');
    expect(HOOK_EVENTS.get('suggest:ops')?.kind).toBe('provider');
    expect(COPILOT_INSTRUCTIONS).toContain('"insertItem"');
  });

  it('exports the assembled component + i18n surface', () => {
    expect(typeof Designer).toBe('function');
    expect(typeof PropertyPanel).toBe('function');
    expect(typeof DiagnosticsPanel).toBe('function');
    expect(typeof FieldPalette).toBe('function');
    expect(typeof readDefinitionsView).toBe('function');
    expect(typeof buildUsage).toBe('function');
    expect(typeof useEditor).toBe('function');
    expect(typeof I18nProvider).toBe('function');
    expect(typeof useI18n).toBe('function');
    expect(typeof formatMessage).toBe('function');
    expect(typeof renderDiagnostic).toBe('function');
    expect(typeof translate).toBe('function');
    expect(typeof resolveChain).toBe('function');
    expect(DEFAULT_CATALOG.en.diagnostics.parse_error).toBeDefined();
    expect(LOCALES.some((locale) => locale.tag === 'zh-TW')).toBe(true);
  });

  it('exports the theme seam (token sets + pure resolution)', () => {
    expect(LIGHT_THEME.accent).toBeDefined();
    expect(DARK_THEME.accent).toBeDefined();
    expect(cssVars(resolveTheme('light'))['--sj-accent']).toBe(LIGHT_THEME.accent);
  });
});
