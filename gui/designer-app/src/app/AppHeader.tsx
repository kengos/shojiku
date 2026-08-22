// The app-shell header: a Google-Docs-style stack on the left (the open
// document's name over the small brand line) and right-aligned controls for
// language and theme (auto / light / dark). The document name + save
// status arrive as `doc` (the editor screen reports them up through the app
// shell); a list / catalog view passes `null` and the header shows the brand
// alone. When `doc.onRename` is present (an open editor document), the title is
// click-to-rename (Google-Docs style); a catalog / list view reports no doc, so
// there is nothing to rename. Theme + language are single-choice menus (the
// current value checked), replacing the old text `<select>`s. Language comes
// FIRST and states its own value: two 36px monochrome glyphs side by side are
// indistinguishable at low acuity, and both foveal-vision walkthroughs reached
// for the language switch and opened the theme menu instead. Its accessible
// name carries the value INSIDE it (`Language: 日本語`), because WCAG 2.5.3
// asks that a speech-input user be able to operate a control by saying what is
// written on it.
// The click-to-rename title itself is `EditableTitle.tsx`.

import { LOCALES, localeInfo, Menu, type SaveStatus, useI18n } from '@shojiku/designer';
import { FileText, Globe, type LucideIcon, Monitor, Moon, Sun } from 'lucide-react';
import { EngineLoadStatus } from '../loading/EngineLoadBar';
import type { ModuleLoad } from '../loading/moduleLoad';
import type { ThemePreference } from '../theme/scheme';
import { EditableTitle } from './EditableTitle';

/** The open document's header context: its display name, (optionally) the
 * compact save indicator, and — when the document is renameable — a commit
 * callback. Both name and status omitted = a bare-brand header. */
export interface HeaderDoc {
  readonly name?: string;
  readonly saveStatus?: SaveStatus;
  /** Present when the title can be renamed (an open editor document). Called
   * with the committed name (already trimmed and clipped to the cap); absent
   * for a non-renamable report (a list / catalog view reports no doc at all). */
  readonly onRename?: (name: string) => void;
}

/** The product name — the header's brand line (and the sole title when no
 * document is open). */
const BRAND = 'Shojiku Designer';

/** The trigger glyph for each theme preference — the icon control reflects the
 * current choice at a glance (sun / moon / monitor). */
const THEME_ICON: Record<ThemePreference, LucideIcon> = {
  light: Sun,
  dark: Moon,
  auto: Monitor,
};

export interface AppHeaderProps {
  /** The open document (name + save status), or null in a list / catalog view. */
  readonly doc: HeaderDoc | null;
  /** The background engine-module transfer — reported here (right-aligned, ahead
   * of the icon controls) because catalog-first boot leaves it running behind a
   * page the user is already using. Silent once the module is in. */
  readonly engineLoad: ModuleLoad;
  readonly locale: string;
  readonly onLocaleChange: (tag: string) => void;
  readonly themePref: ThemePreference;
  readonly onThemeChange: (pref: ThemePreference) => void;
}

export function AppHeader({
  doc,
  engineLoad,
  locale,
  onLocaleChange,
  themePref,
  onThemeChange,
}: AppHeaderProps) {
  const { t } = useI18n();
  const ThemeIcon = THEME_ICON[themePref];
  // The language's own name, which is what a reader hunting for it recognizes.
  // A tag the registry does not know (a stored preference from an older build)
  // shows the tag itself rather than nothing.
  const localeName = localeInfo(locale)?.label ?? locale;
  const themeGroups = [
    {
      entries: [
        { id: 'auto', label: t('app.themeAuto') },
        { id: 'light', label: t('app.themeLight') },
        { id: 'dark', label: t('app.themeDark') },
      ],
    },
  ];
  const localeGroups = [{ entries: LOCALES.map((l) => ({ id: l.tag, label: l.label })) }];
  const title = doc?.name ?? BRAND;
  return (
    <header className="flex items-center gap-3 border-b border-border bg-chrome px-4 py-2">
      <FileText aria-hidden size={26} strokeWidth={1.5} className="shrink-0 text-muted" />
      <div className="mr-auto flex min-w-0 flex-col leading-tight">
        <span className="flex items-center gap-2">
          {/* An open editor document (name + onRename) shows a click-to-rename
              title; every other report renders the plain title text. */}
          {doc?.name !== undefined && doc.onRename !== undefined ? (
            <EditableTitle name={doc.name} label={t('app.renameTitle')} onRename={doc.onRename} />
          ) : (
            <span className="truncate font-semibold text-text">{title}</span>
          )}
          {doc?.saveStatus !== undefined ? (
            <output className="shrink-0 text-xs text-muted">
              {t(doc.saveStatus === 'saving' ? 'app.saving' : 'app.saved')}
            </output>
          ) : null}
        </span>
        {/* The small brand sub-line appears only under a real document NAME —
            keyed on the name, not the doc object, so a name-less report can
            never show the brand twice (title already falls back to it). */}
        {doc?.name !== undefined ? <span className="text-xs text-muted">{BRAND}</span> : null}
      </div>
      <EngineLoadStatus load={engineLoad} />
      <Menu
        // The name CONTAINS the visible language name (WCAG 2.5.3 "Label in
        // Name"): the trigger shows 日本語, so "click 日本語" has to operate it.
        label={t('app.localeLabelWith', { name: localeName })}
        trigger={<Globe aria-hidden size={18} />}
        triggerText={localeName}
        groups={localeGroups}
        checkedId={locale}
        onSelect={onLocaleChange}
      />
      <Menu
        label={t('app.themeLabel')}
        trigger={<ThemeIcon aria-hidden size={18} />}
        groups={themeGroups}
        checkedId={themePref}
        // The menu offers only the three ThemePreference ids, so the id handed
        // back is always a valid preference.
        onSelect={(id) => onThemeChange(id as ThemePreference)}
      />
    </header>
  );
}
