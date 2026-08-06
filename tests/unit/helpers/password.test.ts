import { hashPassword, verifyPassword } from '../../../src/helpers/password';

describe('password helper', () => {
  it('hashes and verifies a correct password', async () => {
    const hash = await hashPassword('correct-horse', 4);
    expect(await verifyPassword('correct-horse', hash)).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct-horse', 4);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});
