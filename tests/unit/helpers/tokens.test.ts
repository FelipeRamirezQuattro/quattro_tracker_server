import { generateOpaqueToken, hashToken } from '../../../src/helpers/tokens';

describe('token helper', () => {
  it('generates unique high-entropy tokens', () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(a).not.toBe(b);
    expect(a).toHaveLength(64);
  });

  it('hashes deterministically', () => {
    const raw = 'fixed-value';
    expect(hashToken(raw)).toBe(hashToken(raw));
  });

  it('produces different hashes for different inputs', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });
});
