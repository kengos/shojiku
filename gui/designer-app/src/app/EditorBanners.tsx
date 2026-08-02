// The editor screen's app-shell status strip. Every message is a localized
// catalog string keyed off a STATUS — never engine text, a file name, or a
// provider's internals.
//
// `saving` / `saved` are deliberately absent: the app header owns them (via the
// reported `HeaderDoc`), so only the error-class outcomes stay banners here.

import { useI18n } from '@shojiku/designer';
import type { LazyStatus } from '../engine/lazyFonts';
import { APP_BANNER, APP_STATUS } from './chrome';
import type { InstallStatus } from './useFontInstall';
import type { SaveState } from './useHostSave';

export interface EditorBannersProps {
  /** Opening a local file failed (unreadable / over the size cap). */
  readonly openError: boolean;
  readonly fontStatus: LazyStatus;
  readonly installStatus: InstallStatus;
  /** The faker-backed value synth failed to load — the Designer falls back to
   * its baseline synth behind this notice. */
  readonly synthError: boolean;
  readonly saveState: SaveState;
}

export function EditorBanners({
  openError,
  fontStatus,
  installStatus,
  synthError,
  saveState,
}: EditorBannersProps) {
  const { t } = useI18n();
  return (
    <>
      {openError ? (
        <p className={APP_BANNER} role="alert">
          {t('app.openError')}
        </p>
      ) : null}
      {fontStatus === 'fetching' || installStatus === 'installing' ? (
        <p className={APP_STATUS}>{t('app.fontLoading')}</p>
      ) : null}
      {fontStatus === 'error' ? (
        <p className={APP_BANNER} role="alert">
          {t('app.fontError')}
        </p>
      ) : null}
      {installStatus === 'error' ? (
        <p className={APP_BANNER} role="alert">
          {t('app.fontInstallError')}
        </p>
      ) : null}
      {synthError ? (
        <p className={APP_BANNER} role="alert">
          {t('app.synthError')}
        </p>
      ) : null}
      {saveState === 'conflict' ? (
        <p className={APP_BANNER} role="alert">
          {t('app.saveConflict')}
        </p>
      ) : null}
      {saveState === 'error' ? (
        <p className={APP_BANNER} role="alert">
          {t('app.saveError')}
        </p>
      ) : null}
      {saveState === 'local-error' ? (
        <p className={APP_BANNER} role="alert">
          {t('app.saveLocalError')}
        </p>
      ) : null}
    </>
  );
}
