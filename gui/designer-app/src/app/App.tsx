// The standalone shell: a locale-keyed preset catalog that opens into the
// embedded Designer — or, when a mount config injected a remote provider, the
// mounted host's project list (MountedApp). Pure orchestration over injected
// services (App is the single host of the Designer component); every browser
// concern is a service. App owns the i18n shell, the UI locale, and the theme;
// StandaloneBody owns the preset navigation (catalog → draft prompt → editor);
// EditorScreen owns the per-document engine wiring.

import { type ColorScheme, cssVars, I18nProvider, resolveTheme } from '@shojiku/designer';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { APP_CATALOG } from '../i18n/appCatalog';
import { EngineLoadBar } from '../loading/EngineLoadBar';
import { resolveScheme, subscribeScheme, type ThemePreference } from '../theme/scheme';
import { AppHeader, type HeaderDoc } from './AppHeader';
import { MountedApp } from './MountedApp';
import { StandaloneBody } from './StandaloneBody';
import type { AppServices } from './services';

export interface AppProps {
  readonly services: AppServices;
}

export function App({ services }: AppProps) {
  const [locale, setLocale] = useState(services.initialLocale);
  const [themePref, setThemePref] = useState(services.initialThemePref);
  const [scheme, setScheme] = useState<ColorScheme>(() =>
    resolveScheme(services.initialThemePref, services.colorSchemeMedia),
  );
  const changeLocale = (tag: string) => {
    setLocale(tag);
    services.persistLocale(tag);
  };
  const changeTheme = (pref: ThemePreference) => {
    setThemePref(pref);
    setScheme(resolveScheme(pref, services.colorSchemeMedia));
    services.persistThemePref(pref);
  };
  // Under 'auto' the scheme follows the OS live; an explicit preference needs
  // no subscription.
  useEffect(() => {
    if (themePref !== 'auto') {
      return undefined;
    }
    return subscribeScheme(services.colorSchemeMedia, () =>
      setScheme(resolveScheme('auto', services.colorSchemeMedia)),
    );
  }, [themePref, services]);
  return (
    <I18nProvider locale={locale} catalog={APP_CATALOG}>
      <AppShell
        services={services}
        locale={locale}
        onLocaleChange={changeLocale}
        themePref={themePref}
        onThemeChange={changeTheme}
        scheme={scheme}
      />
    </I18nProvider>
  );
}

interface AppShellProps {
  readonly services: AppServices;
  readonly locale: string;
  readonly onLocaleChange: (tag: string) => void;
  readonly themePref: ThemePreference;
  readonly onThemeChange: (pref: ThemePreference) => void;
  readonly scheme: ColorScheme;
}

/** The chrome common to both modes — the themed app root and the header —
 * around the mode-specific body (mounted project flow vs preset catalog). The
 * header carries the open document's name + save status (the gdoc-style stack);
 * the body reports that context UP via `onHeaderDocChange`, so the header can
 * own the document title without the editor screen being re-parented into it. */
function AppShell({
  services,
  locale,
  onLocaleChange,
  themePref,
  onThemeChange,
  scheme,
}: AppShellProps) {
  // Tokens go on the DOCUMENT root (the app owns its page — sidekiq-web
  // style): the app-shell chrome sits outside the Designer root, and Headless
  // UI portals overlays to <body> — both resolve the vars only from a
  // page-root scope. Re-applied per scheme; removed on unmount.
  useEffect(() => {
    const root = document.documentElement;
    const vars = cssVars(resolveTheme(scheme));
    for (const [name, value] of Object.entries(vars)) {
      root.style.setProperty(name, value);
    }
    return () => {
      for (const name of Object.keys(vars)) {
        root.style.removeProperty(name);
      }
    };
  }, [scheme]);

  // The open document's header context (name + save status); null in a list /
  // catalog view. The editor screen reports it via `setHeaderDoc` and clears
  // it (null) on unmount, so leaving the editor drops the title cleanly.
  const [headerDoc, setHeaderDoc] = useState<HeaderDoc | null>(null);

  // The engine-module transfer, subscribed ONCE here and handed down: the header
  // reports it, the rail under the header draws it, and whichever body is
  // mounted needs it to describe a preset open that is still waiting on it.
  const { moduleLoad } = services;
  const load = useSyncExternalStore(moduleLoad.subscribe, moduleLoad.get);

  const remote = services.remote;
  return (
    <div className="sj-app flex h-dvh flex-col overflow-y-auto bg-bg text-text">
      <AppHeader
        doc={headerDoc}
        engineLoad={load}
        locale={locale}
        onLocaleChange={onLocaleChange}
        themePref={themePref}
        onThemeChange={onThemeChange}
      />
      <EngineLoadBar load={load} />
      {remote !== undefined ? (
        <MountedApp
          services={services}
          remote={remote}
          scheme={scheme}
          engineLoad={load}
          onHeaderDocChange={setHeaderDoc}
        />
      ) : (
        <StandaloneBody
          services={services}
          locale={locale}
          scheme={scheme}
          engineLoad={load}
          onHeaderDocChange={setHeaderDoc}
        />
      )}
    </div>
  );
}
