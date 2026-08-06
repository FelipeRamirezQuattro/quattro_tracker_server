import { nextRank, rankBetween } from '../../../src/helpers/rank';

describe('rank helper', () => {
  it('starts at 1000 when there is no existing rank', () => {
    expect(nextRank(null)).toBe(1000);
  });

  it('steps by 1000 above the max existing rank', () => {
    expect(nextRank(1000)).toBe(2000);
    expect(nextRank(5500)).toBe(6500);
  });

  it('returns 1000 when inserting into an empty column', () => {
    expect(rankBetween(null, null)).toBe(1000);
  });

  it('halves the following rank when inserting at the start', () => {
    expect(rankBetween(null, 1000)).toBe(500);
  });

  it('adds a full step when inserting at the end', () => {
    expect(rankBetween(1000, null)).toBe(2000);
  });

  it('averages when inserting between two ranks', () => {
    expect(rankBetween(1000, 2000)).toBe(1500);
  });
});
