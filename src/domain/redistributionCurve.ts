import { getHwangTargetValue, readBokrValues, iterateHwangRedistribution, type HwangStats, type RedistributionOptions, type RedistributionStageResult, type RedistributionPlan } from './hwangRedistribution.ts';
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
  // 그래프 곡선 계산 시 기본 탐색 모드를 'fast'(빔 3개)로 가속 (사용자 지정 옵션 우선)
  const searchMode = options.searchMode ?? 'fast';
  const iterator = iterateHwangRedistribution(progress, { ...options, maxReset: total, searchMode }, true);
  const nodeValues = new Map<string, HwangStats>();
  let reportedLimit = -1;
  let lastYieldTime = Date.now();
  let prevPlan: RedistributionPlan | null = null;
  let prevBokr: HwangStats | null = null;
  let prevBokrValues: HwangStats[] | null = null;
  let unchangedStreak = 0;

  while (true) {
    if (signal?.aborted) throw new Error('그래프 계산을 취소했습니다.');
    const next = iterator.next();
    if (next.done) break;
    if (reportedLimit !== next.value.limit) {
      reportedLimit = next.value.limit;
      onProgress?.(result.points.length, total + 1, reportedLimit, total);
    }
    if (next.value.pending) {
      // 제안 탐색 중에는 30ms 간격으로 스로틀링하여 UI 틱 오버헤드를 대폭 줄이면서 반응성 유지
      const now = Date.now();
      if (now - lastYieldTime > 30) {
        lastYieldTime = now;
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      continue;
    }
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
    if (limit === 0) {
      result.beforeHwang = { ...plan.before };
      result.beforeBokr = count((_, original) => original);
      result.beforeBokrValues = values(true);
    }

    // 이전 plan과 동일한 경우 수천 개 노드 순회 생략 (메모이제이션)
    const isSamePlan = Boolean(prevPlan && (prevPlan === plan || (
      prevPlan.resetCount === plan.resetCount &&
      STAT_CATEGORIES.every(st => prevPlan!.after[st] === plan.after[st]) &&
      prevPlan.remaining === plan.remaining &&
      (prevPlan.remainingBokr ?? 0) === (plan.remainingBokr ?? 0)
    )));

    const currentBokr: HwangStats = (isSamePlan && prevBokr) ? prevBokr : count(key => plan.selected.has(key));
    const currentBokrValues: HwangStats[] = (isSamePlan && prevBokrValues) ? prevBokrValues : values(false);
    prevBokr = currentBokr;
    prevBokrValues = currentBokrValues;

    if (isSamePlan) {
      unchangedStreak++;
    } else {
      unchangedStreak = 0;
    }

    const currentPoint: RedistributionCurvePoint = {
      limit,
      resetCount: plan.resetCount,
      hwang: { ...plan.after },
      bokr: currentBokr,
      bokrValues: currentBokrValues
    };
    result.points.push(currentPoint);
    result.stages = plan.stageResults || [];
    prevPlan = plan;

    // 조기 포화(Early Saturation) 감지:
    // 1) 모든 목표치(유한값)를 100% 충족했고 직전과 동일한 경우
    const allTargetsMet = Boolean(plan.stageResults?.length && plan.stageResults.every(s =>
      s.targets.length && s.targets.every(t => !t.all && t.after >= t.target)
    ));
    // 2) 유한 목표 달성 후 확인되었거나, 무제한 목표에서도 5회 연속 변화가 없는 경우
    const canEarlyFill = (allTargetsMet && isSamePlan) || (unchangedStreak >= 5);

    if (canEarlyFill && limit < total) {
      for (let fillLimit = limit + 1; fillLimit <= total; fillLimit++) {
        result.points.push({
          limit: fillLimit,
          resetCount: currentPoint.resetCount,
          hwang: { ...currentPoint.hwang },
          bokr: currentPoint.bokr,
          bokrValues: currentPoint.bokrValues
        });
      }
      onProgress?.(total + 1, total + 1, total, total);
      break;
    }

    onProgress?.(limit + 1, total + 1, limit, total);
    lastYieldTime = Date.now();
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return result;
}
export const readBokrScopeValue = (values: HwangStats[], stat: Parameters<typeof getHwangTargetValue>[1], boardIndex?: number, boardThrough?: number) =>
  boardThrough === undefined ? getHwangTargetValue(values[boardIndex ?? 3]!, stat) :
    values.slice(0, boardThrough + 1).reduce((sum, value) => sum + getHwangTargetValue(value, stat), 0);
export const readCurveValue = (point: RedistributionCurvePoint, resource: 'hwang' | 'bokr', stat: Parameters<typeof getHwangTargetValue>[1], boardIndex?: number, boardThrough?: number) =>
  resource === 'bokr' ? readBokrScopeValue(point.bokrValues, stat, boardIndex, boardThrough) : getHwangTargetValue(point.hwang, stat);
