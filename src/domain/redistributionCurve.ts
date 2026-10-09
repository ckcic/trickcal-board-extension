import { getHwangTargetValue, readBokrValues, iterateHwangRedistribution, type HwangStats, type RedistributionOptions, type RedistributionStageResult } from './hwangRedistribution.ts';
import { STAT_CATEGORIES } from './boardProgress.ts';
import type { ApostleProgress } from './types.ts';

export interface RedistributionCurvePoint {
  limit: number;
  resetCount: number;
  hwang: HwangStats;
  bokr: HwangStats;
  bokrValues: HwangStats[];
}
export interface RedistributionCurve {
  points: RedistributionCurvePoint[];
  beforeHwang: HwangStats;
  beforeBokr: HwangStats;
  beforeBokrValues: HwangStats[];
  stages: RedistributionStageResult[];
}
/** 조합 탐색으로 상한 0~보유 사도 수를 계산한다. 후보안 사이에 UI에 제어권을 돌려준다. */
export async function calculateRedistributionCurve(progress: Map<string, ApostleProgress>, options: RedistributionOptions,
  onProgress?: (done: number, total: number, limit: number, max: number) => void, signal?: AbortSignal): Promise<RedistributionCurve> {
  const total = new Set([...progress.values()].filter(apostle => apostle.isOwned !== false).map(apostle => apostle.apostleId)).size;
  const result: RedistributionCurve = { points: [], beforeHwang: {} as HwangStats, beforeBokr: {} as HwangStats, beforeBokrValues: [], stages: [] };
  const iterator = iterateHwangRedistribution(progress, { ...options, maxReset: total }, true);
  const nodeValues = new Map<string, HwangStats>();
  let reportedLimit = -1;
  while (true) {
    if (signal?.aborted) throw new Error('그래프 계산을 취소했습니다.');
    const next = iterator.next();
    if (next.done) break;
    if (reportedLimit !== next.value.limit) {
      reportedLimit = next.value.limit;
      onProgress?.(result.points.length, total + 1, reportedLimit, total);
    }
    if (next.value.pending) { await new Promise(resolve => setTimeout(resolve, 0)); continue; }
    const { limit, plan } = next.value;
    const count = (picked: (key: string, original: boolean) => boolean): HwangStats => Object.fromEntries(STAT_CATEGORIES.map(stat => [stat,
      plan.nodes.filter(entry => picked(entry.key, entry.picked)).reduce((sum, entry) => sum + entry.bokrStats[stat], 0)])) as HwangStats;
    const values = (original: boolean) => {
      const totals = [0, 1, 2, 3].map(() => Object.fromEntries(STAT_CATEGORIES.map(stat => [stat, 0])) as HwangStats);
      for (const entry of plan.nodes) {
        if (!(original ? entry.picked : plan.selected.has(entry.key))) continue;
        if (!nodeValues.has(entry.key)) nodeValues.set(entry.key, readBokrValues(entry.node));
        for (const stat of STAT_CATEGORIES) {
          totals[entry.boardIndex]![stat] += nodeValues.get(entry.key)![stat];
          totals[3]![stat] += nodeValues.get(entry.key)![stat];
        }
      }
      return totals;
    };
    if (limit === 0) { result.beforeHwang = { ...plan.before }; result.beforeBokr = count((_, original) => original); result.beforeBokrValues = values(true); }
    result.points.push({ limit, resetCount: plan.resetCount, hwang: { ...plan.after }, bokr: count(key => plan.selected.has(key)), bokrValues: values(false) });
    result.stages = plan.stageResults || [];
    onProgress?.(limit + 1, total + 1, limit, total);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return result;
}
export const readBokrScopeValue = (values: HwangStats[], stat: Parameters<typeof getHwangTargetValue>[1], boardIndex?: number, boardThrough?: number) =>
  boardThrough === undefined ? getHwangTargetValue(values[boardIndex ?? 3]!, stat) :
    values.slice(0, boardThrough + 1).reduce((sum, value) => sum + getHwangTargetValue(value, stat), 0);
export const readCurveValue = (point: RedistributionCurvePoint, resource: 'hwang' | 'bokr', stat: Parameters<typeof getHwangTargetValue>[1], boardIndex?: number, boardThrough?: number) =>
  resource === 'bokr' ? readBokrScopeValue(point.bokrValues, stat, boardIndex, boardThrough) : getHwangTargetValue(point.hwang, stat);
