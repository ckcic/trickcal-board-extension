import { matchesApostleFilter } from './filters.ts';
import type { ApostleProgress, FilterState } from './types.ts';

/** 전체 데이터에서 표시할 사도를 골라 원본 가상 목록에 넘길 정렬 순서를 만든다. */
export function selectApostleIds(progressMap: Map<string, ApostleProgress>, filter: FilterState): number[] {
  const apostles = [...new Set(progressMap.values())].filter(progress => matchesApostleFilter(progress, filter));
  const primary = (p: ApostleProgress): number => {
    switch (filter.sortBy) {
      case 'unlocked_desc': return -p.unlockedBoardCount;
      case 'unlocked_asc': return p.unlockedBoardCount;
      case 'grade_desc': return -p.gradeDefault;
      case 'grade_asc': return p.gradeDefault;
      case 'personality_desc': return -p.personality;
      case 'personality_asc': return p.personality;
      default: return 0;
    }
  };
  return apostles.sort((a, b) => primary(a) - primary(b) ||
    (filter.sortBy === 'name_desc' ? b.name.localeCompare(a.name, 'ko') : a.name.localeCompare(b.name, 'ko')))
    .map(p => p.apostleId);
}
