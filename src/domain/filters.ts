import type { ApostleProgress, FilterState } from './types.ts';

/** 카드 표시와 미완료 인원 집계가 같은 조건을 사용하도록 판정한다. */
export function matchesApostleFilter(progress: ApostleProgress, filter: FilterState): boolean {
  if (filter.grade !== 'all' && progress.gradeDefault !== filter.grade) return false;
  if (filter.unlockedTier !== 'all' && progress.unlockedBoardCount !== filter.unlockedTier) return false;
  if (filter.personality !== 'all' && progress.personality !== filter.personality) return false;

  const board = filter.boardLevel === 'all' ? undefined
    : progress.boards.find(item => item.boardStepLevel === Number(filter.boardLevel));
  if (filter.boardLevel !== 'all' && !board) return false;

  const summary = board?.bokr ?? progress.bokr;
  const remaining = board ? board.bokr.remaining : progress.bokr.remainingAll;
  let complete = board
    ? board.unlocked && board.bokr.total > 0 && board.bokr.picked === board.bokr.total
    : progress.bokr.isCompleted;
  let targetRemaining = remaining;

  if (filter.statCategory !== 'all') {
    const stat = summary.byStat[filter.statCategory];
    if (stat.total === 0) return false;
    targetRemaining = stat.remaining;
    complete = stat.remaining === 0;
  }

  if (filter.status === 'complete') return complete && targetRemaining === 0;
  if (filter.status === 'incomplete') return !complete && targetRemaining > 0;
  return true;
}
