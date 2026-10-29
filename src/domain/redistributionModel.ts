/** 재분배 경로와 배분에서 공유하는 노드·자원·스탯 계산 */
import { getNodeStatCategories, getStatCategoryFromStatType, isHwangNode } from './boardProgress.ts';
import { NODE_TYPE, STAT_META_LIST } from './constants.ts';
import { extractNodeCost } from './boardPathfinder.ts';
import type { ProgressMap, MasterBoardNode, ResourceCostSummary } from './types.ts';
import type { HwangStats, RedistributionStat, RedistributionNode } from './redistributionTypes.ts';

/** 공격력은 물공·마공을 더하지 않고 함께 확보한 백분율로 비교한다. */
export const getHwangTargetValue = (stats: HwangStats, stat: RedistributionStat): number =>
  stat === 'attack' ? Math.min(stats.atk_phys, stats.atk_mag) : stats[stat];

export const emptyStats = (): HwangStats => ({
  hp: 0, atk_phys: 0, atk_mag: 0, def_phys: 0, def_mag: 0,
  crit: 0, crit_dmg: 0, crit_res: 0, crit_dmg_res: 0,
});
export const retained = (node: MasterBoardNode) => node.nodeType === NODE_TYPE.GATE || node.nodeType === NODE_TYPE.PETAL || node.nodeType === NODE_TYPE.START;
export const hwang = (node: MasterBoardNode) => isHwangNode(node) || node.nodeType === NODE_TYPE.HWANG_EXT;

/** 초기화 환급은 크레파스 4종과 골드만 해당한다. 물뿌리개는 환급하지 않는다. */
export function refundCost(entry: RedistributionNode): ResourceCostSummary {
  return { ...entry.cost, wateringCan: 0 };
}

/** 이름·ID 별칭과 미보유·미해금 보드를 제외하고 실제로 칠한 황크 비용을 합산한다. */
export function getSpentHwangCrayons(progressMap: ProgressMap): number {
  return getSpentCrayons(progressMap, 'hwang');
}

export function getSpentBokrCrayons(progressMap: ProgressMap): number {
  return getSpentCrayons(progressMap, 'bokr');
}

function getSpentCrayons(progressMap: ProgressMap, resource: 'hwang' | 'bokr'): number {
  const apostles = new Map([...progressMap.values()].map(apostle => [apostle.apostleId, apostle]));
  let total = 0;
  for (const apostle of apostles.values()) {
    if (apostle.isOwned === false) continue;
    for (const board of apostle.boards) {
      if (!board.unlocked) continue;
      for (const [index, node] of (board.masterNodes || []).entries()) {
        if (board.stepStr?.[index] !== '1' || (resource === 'hwang' ? !hwang(node) : node.nodeType !== NODE_TYPE.BOKR)) continue;
        total += extractNodeCost(node)[resource === 'hwang' ? 'ultraCrayon' : 'epicCrayon'];
      }
    }
  }
  return total;
}

/** 황크의 백분율 스탯 코드는 0.1% 단위이다. 일반칸의 정수 스탯과 혼합하지 않는다. */
export function readHwangStats(node: MasterBoardNode): HwangStats {
  const result = emptyStats();
  if (!hwang(node)) return result;
  for (const stat of node.stats || []) {
    const category = getStatCategoryFromStatType(stat.statType);
    if (!category || ![88, 89, 92, 93, 95, 97, 99, 101, 103].includes(stat.statType) || !Number.isFinite(stat.statValue) || stat.statValue < 0) {
      throw new Error('황크 스탯 형식을 확인할 수 없습니다. 이 데이터에서는 베타 계산을 중단합니다.');
    }
    result[category] += stat.statValue / 10;
  }
  if (!Object.values(result).some(value => value > 0)) throw new Error('황크 스탯 수치가 누락되어 계산할 수 없습니다.');
  return result;
}

/** 보크는 물공·마공을 구분한 스탯별 칸 수로 목표를 설정한다. */
export function readBokrCounts(node: MasterBoardNode): HwangStats {
  const result = emptyStats();
  if (node.nodeType === NODE_TYPE.BOKR) for (const stat of getNodeStatCategories(node)) result[stat] = 1;
  return result;
}

const bokrValueCache = new WeakMap<MasterBoardNode, HwangStats>();
const fallbackPerNodeByStat = new Map(STAT_META_LIST.map(meta => [meta.key, meta.valuePerNode ?? 0]));

/** 기존 보크 모달과 같은 원본 수치 우선, 메타데이터 대체 규칙. 백분율이 아닌 정수 스탯. */
export function readBokrValues(node: MasterBoardNode): HwangStats {
  const cached = bokrValueCache.get(node);
  if (cached) return cached;
  const result = emptyStats();
  if (node.nodeType === NODE_TYPE.BOKR) {
    for (const stat of getNodeStatCategories(node)) {
      result[stat] = node.stats?.find(value => getStatCategoryFromStatType(value.statType) === stat)?.statValue
        ?? fallbackPerNodeByStat.get(stat)!;
    }
  }
  bokrValueCache.set(node, result);
  return result;
}

export function compare(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    const delta = a[i]! - b[i]!;
    if (Math.abs(delta) > 1e-8) return delta;
  }
  return 0;
}
