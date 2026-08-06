const RANK_STEP = 1000;

export function nextRank(maxRank: number | null): number {
  return maxRank === null ? RANK_STEP : maxRank + RANK_STEP;
}

export function rankBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return RANK_STEP;
  if (before === null) return after! / 2;
  if (after === null) return before + RANK_STEP;
  return (before + after) / 2;
}
