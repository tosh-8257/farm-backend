import { resolveAccessTtl, resolveRefreshTtl } from './token-ttl';

describe('token ttl aliases', () => {
  it('prefers JWT_ACCESS_EXPIRES and keeps a duration string', () => {
    const ttl = resolveAccessTtl({
      JWT_ACCESS_EXPIRES: '15m',
      JWT_EXPIRATION: '3600',
    });
    expect(ttl).toMatchObject({
      seconds: 900,
      spec: '15m',
      source: 'JWT_ACCESS_EXPIRES',
    });
  });

  it('reads JWT_EXPIRATION seconds when the primary name is unset', () => {
    const ttl = resolveAccessTtl({ JWT_EXPIRATION: '3600' });
    expect(ttl).toMatchObject({
      seconds: 3600,
      spec: '3600s',
      source: 'JWT_EXPIRATION',
    });
  });

  it('defaults access tokens to 15 minutes', () => {
    expect(resolveAccessTtl({}).spec).toBe('15m');
  });

  it('treats the legacy 7-day blueprint value as no expiry', () => {
    const ttl = resolveRefreshTtl({ JWT_REFRESH_EXPIRATION: '604800' }, false);
    expect(ttl).toMatchObject({
      seconds: null,
      source: 'persistent',
    });
  });

  it('still honours an explicit refresh duration', () => {
    const ttl = resolveRefreshTtl({ JWT_REFRESH_EXPIRES: '90d' }, true);
    expect(ttl.seconds).toBe(90 * 86_400);
    expect(ttl.source).toBe('JWT_REFRESH_EXPIRES');
  });

  it('stays persistent when no refresh env is set and long-lived mode is off', () => {
    expect(resolveRefreshTtl({}, false).source).toBe('persistent');
    expect(resolveRefreshTtl({}, false).seconds).toBeNull();
  });
});
