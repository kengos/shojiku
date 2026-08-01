// The faker locale modules, one static dynamic-import each so Vite code-splits
// per locale and only the needed one loads. Keyed by the faker locale-module
// key (`fakerLocaleKey`), defaulting to English. Part of the browser-entry
// group (`src/browser/`, coverage-excluded with `main.tsx`) — the import map is
// bundler-resolved, so it has no meaning outside a real build.

import type { FakerLike, LoadFakerModule } from '../sample/fakerSynth';

const fakerLoaders: Record<string, () => Promise<{ faker: FakerLike }>> = {
  ja: () => import('@faker-js/faker/locale/ja'),
  en: () => import('@faker-js/faker/locale/en'),
  en_GB: () => import('@faker-js/faker/locale/en_GB'),
  en_AU: () => import('@faker-js/faker/locale/en_AU'),
  en_CA: () => import('@faker-js/faker/locale/en_CA'),
  en_IN: () => import('@faker-js/faker/locale/en_IN'),
  zh_TW: () => import('@faker-js/faker/locale/zh_TW'),
  zh_CN: () => import('@faker-js/faker/locale/zh_CN'),
};

export const loadFakerModule: LoadFakerModule = (key) => (fakerLoaders[key] ?? fakerLoaders.en)();
