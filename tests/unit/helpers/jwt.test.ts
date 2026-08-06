import { signAccessToken, verifyAccessToken } from '../../../src/helpers/jwt';

describe('jwt helper', () => {
  it('signs and verifies a token round-trip', () => {
    const token = signAccessToken({ sub: 'user1', role: 'admin', tokenVersion: 0 }, 'secret', '15m');
    const decoded = verifyAccessToken(token, 'secret');
    expect(decoded.sub).toBe('user1');
    expect(decoded.role).toBe('admin');
    expect(decoded.tokenVersion).toBe(0);
  });

  it('throws on a token signed with a different secret', () => {
    const token = signAccessToken({ sub: 'user1', role: 'admin', tokenVersion: 0 }, 'secret-a', '15m');
    expect(() => verifyAccessToken(token, 'secret-b')).toThrow();
  });

  it('throws on an expired token', () => {
    const token = signAccessToken({ sub: 'user1', role: 'admin', tokenVersion: 0 }, 'secret', '-1s');
    expect(() => verifyAccessToken(token, 'secret')).toThrow();
  });
});
