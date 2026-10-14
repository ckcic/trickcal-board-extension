import type { ApostleProgress, ProgressMap } from './types.ts';

/** ID·이름 별칭이 참조하는 같은 객체를 한 번만 반환하고 최초 등장 순서를 유지한다. */
export function getUniqueApostles(progressMap: ProgressMap): ApostleProgress[] {
  return [...new Set(progressMap.values())];
}
