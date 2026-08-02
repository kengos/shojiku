import { afterEach, describe, expect, it } from 'vitest';
import { ECHO_LIMIT } from '../src/errors.js';
import { Config, config, configure, resetConfiguration, UsageError } from '../src/index.js';
import { FIXTURE_TEMPLATES, makeClient } from './support/fixtures.js';

afterEach(resetConfiguration);

describe('configure', () => {
  it('sets process-wide defaults every later client inherits', () => {
    configure({ templates: FIXTURE_TEMPLATES });

    expect(makeClient({ templates: null }).templateRoot?.path).toBe(FIXTURE_TEMPLATES);
  });

  it('is BEATEN by an explicit constructor argument', () => {
    configure({ templates: '/from/configure' });

    expect(makeClient().templateRoot?.path).toBe(FIXTURE_TEMPLATES);
  });

  it('names an unknown setting rather than ignoring it', () => {
    expect(() => configure({ tempaltes: 'typo' } as never)).toThrow(UsageError);
  });

  it('bounds what it echoes of a misspelled key', () => {
    const hostile = 'z'.repeat(500);
    try {
      configure({ [hostile]: 1 } as never);
      expect.unreachable('an unknown setting must be refused');
    } catch (error) {
      expect(/z+/.exec((error as Error).message)?.[0].length ?? 0).toBeLessThanOrEqual(ECHO_LIMIT);
    }
  });

  it('is dropped entirely by resetConfiguration', () => {
    configure({ templates: '/from/configure' });
    resetConfiguration();

    expect(config().templates).toBeNull();
  });
});

describe('merge', () => {
  it('treats null and undefined overrides as "not given"', () => {
    const base = new Config();
    base.lang = 'ja-JP';

    expect(base.merge({ lang: null }).lang).toBe('ja-JP');
    expect(base.merge({}).lang).toBe('ja-JP');
    expect(base.merge({ lang: 'en-US' }).lang).toBe('en-US');
  });

  it('OR-s strict rather than overriding it', () => {
    const base = new Config();
    base.strict = true;

    // The one inversion: a restriction an operator declared must not be
    // liftable by application code.
    expect(base.merge({ strict: false }).strict).toBe(true);
    expect(new Config().merge({ strict: true }).strict).toBe(true);
    expect(new Config().merge({}).strict).toBe(false);
  });

  it('REPLACES the provider registry rather than merging it', () => {
    const base = new Config();
    base.providers = { global: 'a' };

    // A client declaring its own registry is stating the whole set it may sign
    // with; quietly adding globally-registered keys would defeat the point.
    expect(base.merge({ providers: { own: 'b' } }).providers).toEqual({ own: 'b' });
  });

  it('names an unknown key in an override too', () => {
    expect(() => new Config().merge({ nope: 1 } as never)).toThrow(UsageError);
  });

  it('leaves the original untouched', () => {
    const base = new Config();
    base.merge({ lang: 'ja-JP' });

    expect(base.lang).toBeNull();
  });
});
