/** 보유 사도의 황크 최대 칸 수. 계정 별칭은 중복 집계하지 않는다. */
import { getNodeStatCategories, isHwangNode, NODE_TYPE, STAT_CATEGORIES } from './boardProgress.ts';
import { findLinkedPetalNode } from './boardPathfinder.ts';
import type { RedistributionStat } from './hwangRedistribution.ts';
import type { ApostleProgress } from './types.ts';

export interface HwangStatLimit {
  byBoard: number[];
  total: number;
  unlocked: number;
}
export type HwangStatLimits = Record<RedistributionStat, HwangStatLimit>;
export const getRedistributionStatUnit = (stat: RedistributionStat): number =>
  ['attack', 'atk_phys', 'atk_mag'].includes(stat) ? 6 : 8;
/** 목표를 실제 황크 한 칸 단위로 올림한다. 잘못된 입력은 검증을 위해 유지한다. */
export function roundRedistributionTarget(value: number, stat: RedistributionStat): number {
  const unit = getRedistributionStatUnit(stat);
  return Number.isFinite(value) && value >= 0 ? Math.ceil(value / unit) * unit : value;
}

export function getHwangStatLimits(progressMap: Map<string, ApostleProgress>, resource: 'hwang' | 'bokr' = 'hwang'): HwangStatLimits {
  const result = Object.fromEntries(['attack', ...STAT_CATEGORIES].map(stat =>
    [stat, { byBoard: [0, 0, 0], total: 0, unlocked: 0 }])) as HwangStatLimits;
  const apostles = new Map([...progressMap.values()].map(apostle => [apostle.apostleId, apostle]));
  for (const apostle of apostles.values()) {
    if (apostle.isOwned === false) continue;
    apostle.boards.forEach((board, boardIndex) => {
      const nodes = board.masterNodes || [];
      for (const node of nodes) {
        if (resource === 'bokr' ? node.nodeType !== NODE_TYPE.BOKR : !isHwangNode(node) && node.nodeType !== NODE_TYPE.HWANG_EXT) continue;
        const categories: RedistributionStat[] = getNodeStatCategories(node);
        if (categories.includes('atk_phys') || categories.includes('atk_mag')) categories.push('attack');
        const petal = findLinkedPetalNode(nodes, node);
        const available = board.unlocked && (node.nodeType !== NODE_TYPE.HWANG_EXT ||
          (petal && board.stepStr?.[nodes.indexOf(petal)] === '1'));
        for (const stat of new Set(categories)) {
          const limit = result[stat];
          limit.byBoard[boardIndex] = (limit.byBoard[boardIndex] || 0) + 1;
          limit.total++;
          if (available) limit.unlocked++;
        }
      }
    });
  }
  return result;
}
