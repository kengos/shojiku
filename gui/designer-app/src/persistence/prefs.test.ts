import { DEFAULT_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH } from '@shojiku/designer';
import { describe, expect, it } from 'vitest';
import { Prefs } from './prefs';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

describe('Prefs', () => {
  it('returns null when no override is stored', () => {
    expect(new Prefs(memoryStorage()).localeOverride()).toBeNull();
  });

  it('round-trips a stored locale override', () => {
    const prefs = new Prefs(memoryStorage());
    prefs.setLocaleOverride('zh-TW');
    expect(prefs.localeOverride()).toBe('zh-TW');
  });

  it('silently ignores a write failure', () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new Error('quota');
    };
    expect(() => new Prefs(storage).setLocaleOverride('ja-JP')).not.toThrow();
  });

  it("defaults the theme preference to 'auto' when unset", () => {
    expect(new Prefs(memoryStorage()).themePref()).toBe('auto');
  });

  it('round-trips a stored theme preference', () => {
    const prefs = new Prefs(memoryStorage());
    prefs.setThemePref('dark');
    expect(prefs.themePref()).toBe('dark');
  });

  it('defaults the grid step when unset', () => {
    expect(new Prefs(memoryStorage()).gridStep()).toBe(1);
  });

  it('round-trips a stored grid step, including off', () => {
    const prefs = new Prefs(memoryStorage());
    prefs.setGridStep(4);
    expect(prefs.gridStep()).toBe(4);
    prefs.setGridStep(0);
    expect(prefs.gridStep()).toBe(0);
  });

  it('degrades hostile stored grid values to the default', () => {
    const storage = memoryStorage();
    const prefs = new Prefs(storage);
    for (const hostile of ['garbage', '1e999', '-4', '999999', '<script>']) {
      storage.setItem('shojiku.gridStep', hostile);
      expect(prefs.gridStep()).toBe(1);
    }
  });

  it('silently ignores a grid-step write failure', () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new Error('quota');
    };
    expect(() => new Prefs(storage).setGridStep(2)).not.toThrow();
  });

  it("degrades a corrupted stored theme value to 'auto'", () => {
    const storage = memoryStorage();
    storage.setItem('shojiku.theme', 'url(evil); }');
    expect(new Prefs(storage).themePref()).toBe('auto');
  });

  it('silently ignores a theme write failure', () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new Error('quota');
    };
    expect(() => new Prefs(storage).setThemePref('light')).not.toThrow();
  });

  const TWO_MIB = 2 * 1024 * 1024;
  const EIGHT_MIB = 8 * 1024 * 1024;

  it('defaults the template-size cap when unset', () => {
    expect(new Prefs(memoryStorage()).templateMaxBytes()).toBe(TWO_MIB);
  });

  it('round-trips a stored template-size cap', () => {
    const prefs = new Prefs(memoryStorage());
    prefs.setTemplateMaxBytes(4 * 1024 * 1024);
    expect(prefs.templateMaxBytes()).toBe(4 * 1024 * 1024);
  });

  it('clamps a persisted over-ceiling cap down to the ceiling', () => {
    const prefs = new Prefs(memoryStorage());
    prefs.setTemplateMaxBytes(EIGHT_MIB * 10);
    expect(prefs.templateMaxBytes()).toBe(EIGHT_MIB);
  });

  it('degrades hostile stored template-cap values to the default', () => {
    const storage = memoryStorage();
    const prefs = new Prefs(storage);
    for (const hostile of ['', '   ', 'NaN', 'constructor', '-5', '0', 'Infinity']) {
      storage.setItem('shojiku.templateMaxBytes', hostile);
      expect(prefs.templateMaxBytes()).toBe(TWO_MIB);
    }
  });

  it('silently ignores a template-cap write failure', () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new Error('quota');
    };
    expect(() => new Prefs(storage).setTemplateMaxBytes(EIGHT_MIB)).not.toThrow();
  });

  it('defaults the sidebar width when unset', () => {
    expect(new Prefs(memoryStorage()).sidebarWidth()).toBe(DEFAULT_SIDEBAR_WIDTH);
  });

  it('round-trips a stored sidebar width', () => {
    const prefs = new Prefs(memoryStorage());
    prefs.setSidebarWidth(300);
    expect(prefs.sidebarWidth()).toBe(300);
  });

  it('clamps a persisted out-of-bounds width to the pane bounds', () => {
    const storage = memoryStorage();
    const prefs = new Prefs(storage);
    storage.setItem('shojiku.sidebarWidth', '10');
    expect(prefs.sidebarWidth()).toBe(MIN_SIDEBAR_WIDTH);
    storage.setItem('shojiku.sidebarWidth', '9999');
    expect(prefs.sidebarWidth()).toBe(MAX_SIDEBAR_WIDTH);
  });

  it('degrades hostile stored sidebar-width values to the default', () => {
    const storage = memoryStorage();
    const prefs = new Prefs(storage);
    for (const hostile of ['', '   ', 'NaN', 'constructor', 'Infinity']) {
      storage.setItem('shojiku.sidebarWidth', hostile);
      expect(prefs.sidebarWidth()).toBe(DEFAULT_SIDEBAR_WIDTH);
    }
  });

  it('silently ignores a sidebar-width write failure', () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new Error('quota');
    };
    expect(() => new Prefs(storage).setSidebarWidth(300)).not.toThrow();
  });

  it('hands the tutorial its stored progress verbatim, for the component to vet', () => {
    const storage = memoryStorage();
    const store = new Prefs(storage).tutorialStore();
    expect(store.load()).toBeNull();
    store.save({ completed: ['ch0.margin'], dismissed: true });
    expect(storage.getItem('shojiku.tutorial.progress')).toBe(
      '{"completed":["ch0.margin"],"dismissed":true}',
    );
    // The RAW string comes back: only the Designer knows which step ids are
    // real, so the shape guard lives there, not here.
    expect(store.load()).toBe('{"completed":["ch0.margin"],"dismissed":true}');
  });

  it('returns hostile stored tutorial progress untouched, rather than guessing', () => {
    const storage = memoryStorage();
    storage.setItem('shojiku.tutorial.progress', 'not json');
    expect(new Prefs(storage).tutorialStore().load()).toBe('not json');
  });

  it('silently ignores a tutorial-progress write failure', () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new Error('quota');
    };
    const store = new Prefs(storage).tutorialStore();
    expect(() => store.save({ completed: [], dismissed: false })).not.toThrow();
  });
});
