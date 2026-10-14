import { getUniqueApostles } from './apostleProgress.ts';
import { matchesApostleFilter } from './filters.ts';
import type { ProgressMap, ApostleProgress, FilterState, SortOption } from './types.ts';

/** 일반 카드와 가상 목록의 정렬 기준을 공유하며, 같은 순위는 가나다순으로 비교한다. */
export function compareApostles(a: ApostleProgress, b: ApostleProgress, sortBy: SortOption): number {
  let primary = 0;
  switch (sortBy) {
    case 'unlocked_desc': primary = b.unlockedBoardCount - a.unlockedBoardCount; break;
    case 'unlocked_asc': primary = a.unlockedBoardCount - b.unlockedBoardCount; break;
    case 'grade_desc': primary = b.gradeDefault - a.gradeDefault; break;
    case 'grade_asc': primary = a.gradeDefault - b.gradeDefault; break;
    case 'personality_desc': primary = b.personality - a.personality; break;
    case 'personality_asc': primary = a.personality - b.personality; break;
  }
  return primary || (sortBy === 'name_desc' ? b.name.localeCompare(a.name, 'ko') : a.name.localeCompare(b.name, 'ko'));
}

/** 전체 데이터에서 표시할 사도를 골라 원본 가상 목록에 넘길 정렬 순서를 만든다. */
export function selectApostleIds(progressMap: ProgressMap, filter: FilterState): number[] {
  const apostles = getUniqueApostles(progressMap).filter(progress => matchesApostleFilter(progress, filter));
  return apostles.sort((a, b) => compareApostles(a, b, filter.sortBy))
    .map(p => p.apostleId);
}
