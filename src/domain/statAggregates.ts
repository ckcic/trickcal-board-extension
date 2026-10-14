import { getUniqueApostles } from './apostleProgress.ts';
import { STAT_CATEGORIES } from './boardProgress.ts';
import type { FilterState, ProgressMap, StatCategory, StatCountSummary } from './types.ts';

export type StatAggregates = Record<StatCategory, StatCountSummary>;

/** 속성·표시 범위에 맞는 사도의 보크를 집계하며 완료 상태·선택 스탯·정렬은 적용하지 않는다. */
export function aggregateBokrStats(progressMap: ProgressMap, filter: FilterState): StatAggregates {
  const result = Object.fromEntries(STAT_CATEGORIES.map(key =>
    [key, { picked: 0, total: 0, remaining: 0 }])) as StatAggregates;
  for (const progress of getUniqueApostles(progressMap)) {
    if (filter.unlockedTier !== 'all' && progress.unlockedBoardCount !== filter.unlockedTier) continue;
    if (filter.grade !== 'all' && progress.gradeDefault !== filter.grade) continue;
    if (filter.personality !== 'all' && progress.personality !== filter.personality) continue;
    const byStat = filter.boardLevel === 'all' ? progress.bokr.byStat
      : progress.boards.find(board => board.boardStepLevel === Number(filter.boardLevel))?.bokr.byStat;
    for (const key of STAT_CATEGORIES) {
      const stat = byStat?.[key];
      if (!stat) continue;
      result[key].picked += stat.picked;
      result[key].total += stat.total;
      result[key].remaining += stat.remaining;
    }
  }
  return result;
}
